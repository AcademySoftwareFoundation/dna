"""Tests for FtrackProvider."""

import os
import re
from datetime import date, datetime
from unittest import mock

import pytest

from dna.models.entity import Asset, Note, Playlist, Shot, Version
from dna.prodtrack_providers.ftrack import (
    FtrackProvider,
    ListPlaylistAdapter,
    ReviewSessionPlaylistAdapter,
    _movie_component_names,
    resolve_playlist_adapter,
)
from dna.prodtrack_providers.ftrack_id_map import InMemoryIdMap
from dna.prodtrack_providers.prodtrack_provider_base import (
    UserNotFoundError,
    get_prodtrack_provider,
)

SERVER_URL = "https://ftrack.example.com"
BASE_URL = "http://api.example.com"


# ---------------------------------------------------------------------------
# Fakes
#
# ftrack entities behave like dicts with an `entity_type`; queries return a
# result that is iterable, sliceable and has `.first()`. That is the whole
# surface the provider touches, so the fakes stay small.
# ---------------------------------------------------------------------------


class FakeEntity(dict):
    """A row. Reading a field it was not given records an auto-populate.

    Set the class attribute `lazy_reads` to a list to collect them; ftrack
    would serve each one as its own request.
    """

    lazy_reads = None

    def __init__(self, entity_type, data, session=None):
        super().__init__(data)
        self.entity_type = entity_type
        self.session = session

    def _record(self, key):
        if FakeEntity.lazy_reads is not None:
            FakeEntity.lazy_reads.append(f"{self.entity_type}.{key}")

    def get(self, key, default=None):
        if key not in self:
            self._record(key)
            return default
        return self[key]

    def create_note(self, content, author, recipients=None):
        note = FakeEntity(
            "Note",
            {
                "id": f"note-{len(self.session.created_notes) + 1}",
                "content": content,
                "author": author,
                "parent_id": self["id"],
                "parent_type": self.entity_type,
                "metadata": {},
            },
            session=self.session,
        )
        note.recipients = list(recipients or [])
        self.session.created_notes.append(note)
        return note


class FakeQueryResult(list):
    def first(self):
        return self[0] if self else None


class FakeSchema(FakeEntity):
    """A ProjectSchema row; get_statuses is ftrack's own helper."""

    def __init__(self, uuid, statuses):
        super().__init__("ProjectSchema", {"id": uuid})
        self._statuses = statuses

    def get_statuses(self, schema, type_id=None):
        return list(self._statuses)


# ftrack subtypes DNA queries through their common base.
_BASE_TYPES = {
    "Shot": "TypedContext",
    "AssetBuild": "TypedContext",
    "Sequence": "TypedContext",
    "Task": "TypedContext",
    "FileComponent": "Component",
    "SequenceComponent": "Component",
}

_CLAUSE = re.compile(r"^(?P<field>[\w.]+)\s+(?P<op>is not|is|in|like)\s+(?P<value>.+)$")


def _unquote(value):
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return value


def _split_values(value):
    return [_unquote(v) for v in value.strip().strip("()").split(",") if v.strip()]


def _walk(entity, field):
    """Resolve a dotted attribute path, as ftrack would."""
    current = entity
    for part in field.split("."):
        if current is None:
            return None
        if part.endswith("_id") and part not in current:
            # ftrack exposes both `project` and `project_id`; the fakes may
            # only carry one of them.
            linked = current.get(part[:-3])
            current = linked.get("id") if linked else None
            continue
        if part == "id" and hasattr(current, "get") and "id" not in current:
            return None
        current = current.get(part) if hasattr(current, "get") else None
    if hasattr(current, "get") and "id" in current and not isinstance(current, str):
        return current
    return current


def _matches(entity, clause):
    clause = clause.strip()
    if clause.startswith("(") and " or " in clause:
        return any(
            _matches(part, "") or _matches(entity, part)
            for part in clause.strip("()").split(" or ")
        )

    parsed = _CLAUSE.match(clause)
    if not parsed:
        return True

    field, op, raw = parsed.group("field"), parsed.group("op"), parsed.group("value")
    actual = _walk(entity, field)
    if hasattr(actual, "get") and not isinstance(actual, str):
        actual = actual.get("id")

    if op == "is":
        expected = _unquote(raw)
        if expected in ("active", "true", "false", "none"):
            return expected != "none" or actual is None
        return actual == expected
    if op == "is not":
        return actual != _unquote(raw)
    if op == "in":
        return actual in _split_values(raw)
    if op == "like":
        pattern = _unquote(raw).strip("%").lower()
        return pattern in str(actual or "").lower()
    return False


class FakeSession:
    """A small ftrack stand-in.

    Registered entities go into per-type tables and `query` parses the
    expression against them, so a provider that fetches in layers is exercised
    the way a real server would answer it. `respond` still pins an exact
    canned answer where a test wants one; it takes precedence.
    """

    def __init__(self, api_user="api@example.com"):
        self.api_user = api_user
        self.rules = []
        self.entities = {}
        self.created = []
        self.created_notes = []
        self.commits = 0
        self.rollbacks = 0
        self.queries = []
        self.types = {}
        self.location = None
        self.location_lookups = []

    def respond(self, fragment, result):
        """Register a canned answer for queries containing *fragment*."""
        self.rules.append((fragment, result))

    def query(self, expression, page_size=500):
        self.queries.append(expression)
        for fragment, result in self.rules:
            if fragment in expression:
                return FakeQueryResult(result)
        return FakeQueryResult(self._run(expression))

    def _run(self, expression):
        match = re.search(r"\bfrom\s+(\w+)(?:\s+where\s+(.*))?$", expression.strip())
        if not match:
            return []
        entity_type, where = match.group(1), match.group(2)

        rows = [
            entity
            for (kind, _), entity in self.entities.items()
            if kind == entity_type or _BASE_TYPES.get(kind) == entity_type
        ]
        if not where:
            return rows
        for clause in where.split(" and "):
            rows = [row for row in rows if _matches(row, clause)]
        return rows

    def get(self, entity_type, entity_key):
        return self.entities.get((entity_type, entity_key))

    def register(self, entity):
        self.entities[(entity.entity_type, entity["id"])] = entity
        entity.session = self
        return entity

    def queries_against(self, entity_type):
        """Every query issued against *entity_type*, for round-trip counting."""
        return [q for q in self.queries if f"from {entity_type} " in q + " "]

    def create(self, entity_type, data=None):
        entity = FakeEntity(
            entity_type, {"id": f"{entity_type.lower()}-new", **(data or {})}, self
        )
        self.created.append(entity)
        return entity

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def pick_locations(self, components):
        self.location_lookups.append(list(components))
        return [self.location] * len(components)


class FakeLocation(dict):
    """A mounted location: every component resolves to a path."""

    def __init__(self, location_id="location-1"):
        super().__init__({"id": location_id})
        self.path_calls = []

    def get_filesystem_paths(self, components):
        self.path_calls.append(list(components))
        return [f"/mnt/ftrack/{c['name']}" for c in components]


@pytest.fixture
def session():
    return FakeSession()


@pytest.fixture
def provider(session, monkeypatch):
    monkeypatch.setenv("API_BASE_URL", BASE_URL)
    instance = FtrackProvider(
        server_url=SERVER_URL,
        api_key="key",
        api_user="api@example.com",
        id_map=InMemoryIdMap(),
        connect=False,
    )
    instance.session = session
    return instance


def make_project(session, uuid="project-1", name="Skyfall", statuses=()):
    schema = session.register(
        FakeSchema(f"schema-{uuid}", [{"name": n} for n in statuses])
    )
    return session.register(
        FakeEntity(
            "Project",
            {
                "id": uuid,
                "name": "sky",
                "full_name": name,
                "project_schema_id": schema["id"],
            },
        )
    )


def make_user(session, uuid="user-1", email="artist@example.com"):
    return session.register(
        FakeEntity(
            "User",
            {
                "id": uuid,
                "username": "artist",
                "email": email,
                "first_name": "Ada",
                "last_name": "Lovelace",
                "is_active": True,
            },
        )
    )


def make_status(session, name, uuid=None):
    uuid = uuid or f"status-{name.lower().replace(' ', '-')}"
    return session.register(FakeEntity("Status", {"id": uuid, "name": name}))


def make_object_type(session, name="Shot"):
    return session.register(
        FakeEntity("ObjectType", {"id": f"objecttype-{name.lower()}", "name": name})
    )


def make_context(session, project, uuid, name, kind="Shot", description="A shot"):
    object_type = make_object_type(session, kind)
    return session.register(
        FakeEntity(
            kind.replace(" ", ""),
            {
                "id": uuid,
                "name": name,
                "description": description,
                "object_type_id": object_type["id"],
                "project_id": project["id"],
            },
        )
    )


def make_version(session, project, uuid="version-1", shot_name="sh010", number=3):
    """Seed a version and every row the layered fetch will follow to.

    Normalised on purpose: the provider reaches these through separate flat
    queries, exactly as it does against a real server.
    """
    shot = make_context(session, project, f"shot-for-{uuid}", shot_name)
    asset = session.register(
        FakeEntity(
            "Asset",
            {
                "id": f"asset-for-{uuid}",
                "name": f"{shot_name}_comp",
                # Asset links to its context through context_id, not parent_id
                # the way Task and Note do.
                "context_id": shot["id"],
            },
        )
    )
    task_type = session.register(
        FakeEntity("Type", {"id": "type-1", "name": "Compositing"})
    )
    task = session.register(
        FakeEntity(
            "Task",
            {
                "id": f"task-for-{uuid}",
                "name": "comp",
                "type_id": task_type["id"],
                "status_id": make_status(session, "In Progress")["id"],
                "project_id": project["id"],
                "parent_id": shot["id"],
            },
        )
    )
    user = make_user(session)
    return session.register(
        FakeEntity(
            "AssetVersion",
            {
                "id": uuid,
                "version": number,
                "comment": "first pass",
                "date": datetime(2026, 4, 15, 9, 0, 0),
                "is_published": True,
                "thumbnail_id": "thumb-1",
                "asset_id": asset["id"],
                "task_id": task["id"],
                "user_id": user["id"],
                "project_id": project["id"],
                "status_id": make_status(session, "Pending Review")["id"],
            },
        )
    )


def make_components(session, version, names):
    """Attach components to a version, as separate rows keyed by version_id."""
    return [
        session.register(
            FakeEntity(
                "FileComponent",
                {
                    "id": f"{version['id']}-{name}",
                    "name": name,
                    "version_id": version["id"],
                },
            )
        )
        for name in names
    ]


def make_review_session(
    session,
    project,
    uuid="review-1",
    name="round 2",
    description=None,
    versions=(),
):
    review = session.register(
        FakeEntity(
            "ReviewSession",
            {
                "id": uuid,
                "name": name,
                "description": description,
                "created_at": datetime(2026, 4, 15),
                "end_date": None,
                "project_id": project["id"],
            },
        )
    )
    for index, version in enumerate(versions):
        session.register(
            FakeEntity(
                "ReviewSessionObject",
                {
                    "id": f"{uuid}-object-{index}",
                    "review_session_id": uuid,
                    "version_id": version["id"],
                },
            )
        )
    return review


def make_playlist(session, project, uuid="list-1", name="dailies", versions=()):
    return session.register(
        FakeEntity(
            "AssetVersionList",
            {
                "id": uuid,
                "name": name,
                "date": datetime(2026, 4, 15),
                "project_id": project["id"],
                "items": list(versions),
            },
        )
    )


# ---------------------------------------------------------------------------
# Playlist entity type setting
# ---------------------------------------------------------------------------


class TestPlaylistEntityTypeSetting:
    """Which ftrack entity acts as a playlist is configuration, not a constant."""

    def test_defaults_to_lists(self, provider, monkeypatch):
        monkeypatch.delenv("FTRACK_PLAYLIST_ENTITY", raising=False)
        assert isinstance(provider.playlist_adapter(), ListPlaylistAdapter)
        assert provider.playlist_adapter().entity_type == "AssetVersionList"

    def test_env_var_selects_review_sessions(self, provider, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "ReviewSession")
        assert isinstance(provider.playlist_adapter(), ReviewSessionPlaylistAdapter)

    def test_accepts_the_ui_facing_names(self, provider, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "ClientReviews")
        assert provider.playlist_adapter().entity_type == "ReviewSession"

        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "Lists")
        assert provider.playlist_adapter().entity_type == "AssetVersionList"

    def test_is_reread_per_call(self, provider, monkeypatch):
        """A setting change must land without restarting the process."""
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")
        assert provider.playlist_adapter().entity_type == "AssetVersionList"
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "ClientReview")
        assert provider.playlist_adapter().entity_type == "ReviewSession"

    def test_constructor_pins_the_type(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "ClientReview")
        pinned = FtrackProvider(
            server_url=SERVER_URL,
            api_key="key",
            api_user="api@example.com",
            playlist_entity_type="AssetVersionList",
            id_map=InMemoryIdMap(),
            connect=False,
        )
        assert pinned.playlist_adapter().entity_type == "AssetVersionList"

    def test_rejects_an_unknown_type(self):
        with pytest.raises(ValueError, match="Unknown ftrack playlist entity type"):
            resolve_playlist_adapter("Sequence")


# ---------------------------------------------------------------------------
# Ids
# ---------------------------------------------------------------------------


class TestIdTranslation:
    """UUIDs never leave the provider."""

    def test_entities_come_back_with_int_ids(self, provider, session):
        project = make_project(session)
        project_id = provider._to_id(project, "Project")
        session.respond("from Project where", [project])

        entity = provider.get_entity("project", project_id)

        assert isinstance(entity.id, int)
        assert entity.name == "Skyfall"

    def test_the_same_uuid_always_maps_to_the_same_int(self, provider, session):
        project = make_project(session)
        assert provider._to_id(project, "Project") == provider._to_id(
            project, "Project"
        )

    def test_an_unmapped_id_reads_as_not_found(self, provider):
        with pytest.raises(ValueError, match="Entity not found: version 999"):
            provider.get_entity("version", 999)

    def test_a_mapped_id_with_no_row_on_the_server_is_not_found(self, provider):
        """A deleted entity keeps its mapping but has nothing behind it."""
        version_id = provider._to_id("version-deleted", "AssetVersion")
        with pytest.raises(ValueError, match="Entity not found"):
            provider.get_entity("version", version_id)


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


class TestGetVersionsForPlaylist:
    @pytest.fixture(autouse=True)
    def use_lists(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")

    def _setup(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {
                    "id": "list-1",
                    "name": "dailies_2026_04_15",
                    "date": datetime(2026, 4, 15),
                    "project": project,
                    "items": [version],
                },
            )
        )
        session.respond("from AssetVersionList where", [playlist])
        session.respond("from AssetVersion where id in", [version])
        session.respond(
            "from Note where parent_id in",
            [
                FakeEntity(
                    "Note",
                    {
                        "id": "note-1",
                        "content": "Push the grade warmer",
                        "parent_id": version["id"],
                        "parent_type": "AssetVersion",
                        "author": make_user(session),
                        "metadata": {"dna_subject": "Grade"},
                    },
                )
            ],
        )
        return provider._to_id(playlist, "AssetVersionList"), version

    def test_returns_fully_populated_versions(self, provider, session):
        playlist_id, _ = self._setup(provider, session)

        versions = provider.get_versions_for_playlist(playlist_id)

        assert len(versions) == 1
        version = versions[0]
        assert isinstance(version, Version)
        assert version.name == "sh010_comp_v003"
        assert version.description == "first pass"
        assert version.status == "Pending Review"
        assert isinstance(version.entity, Shot)
        assert version.entity.name == "sh010"
        assert version.task.name == "comp"
        assert version.task.pipeline_step["name"] == "Compositing"
        assert version.user.email == "artist@example.com"
        assert version.project["name"] == "Skyfall"

    def test_attaches_notes_from_the_version(self, provider, session):
        playlist_id, _ = self._setup(provider, session)

        notes = provider.get_versions_for_playlist(playlist_id)[0].notes

        assert [n.content for n in notes] == ["Push the grade warmer"]
        # ftrack has no note subject; DNA's round-trips through metadata.
        assert notes[0].subject == "Grade"

    def test_links_back_to_the_ftrack_web_ui(self, provider, session):
        playlist_id, _ = self._setup(provider, session)

        version = provider.get_versions_for_playlist(playlist_id)[0]

        assert version.prodtrack_detail_url == (
            f"{SERVER_URL}/#slideEntityId=version-1&slideEntityType=assetversion"
        )
        assert version.prodtrack_entity_detail_url == (
            f"{SERVER_URL}/#entityId=shot-for-version-1&entityType=task"
        )

    def test_thumbnails_are_proxied_not_signed_with_the_api_key(
        self, provider, session
    ):
        playlist_id, version = self._setup(provider, session)

        result = provider.get_versions_for_playlist(playlist_id)[0]

        assert result.thumbnail == f"{BASE_URL}/api/ftrack-thumbnails/{result.id}"
        assert "apiKey" not in (result.thumbnail or "")

    def test_no_thumbnail_component_means_no_url(self, provider, session):
        playlist_id, version = self._setup(provider, session)
        version["thumbnail_id"] = None

        assert provider.get_versions_for_playlist(playlist_id)[0].thumbnail is None

    def test_empty_playlist_returns_nothing(self, provider, session):
        project = make_project(session)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {"id": "list-2", "name": "empty", "project": project, "items": []},
            )
        )
        session.respond("from AssetVersionList where", [playlist])

        playlist_id = provider._to_id(playlist, "AssetVersionList")
        assert provider.get_versions_for_playlist(playlist_id) == []


# ---------------------------------------------------------------------------
# Playlists
# ---------------------------------------------------------------------------


class TestComponentPaths:
    """Path resolution is opt-in; the defaults must not invent unusable paths."""

    def _version_with(self, provider, session, component_names):
        project = make_project(session)
        version = make_version(session, project)
        make_components(session, version, component_names)
        session.location = FakeLocation()
        return version

    def _read(self, provider, session, version):
        return provider.get_entity(
            "version", provider._to_id(version, "AssetVersion"), resolve_links=False
        )

    @pytest.fixture(autouse=True)
    def no_configured_components(self, monkeypatch):
        monkeypatch.delenv("FTRACK_MOVIE_COMPONENTS", raising=False)
        monkeypatch.delenv("FTRACK_FRAME_COMPONENTS", raising=False)

    def test_no_paths_by_default(self, provider, session):
        """ftrackreview-* has no filesystem path; movie/main is an unreachable mount."""
        version = self._version_with(
            provider, session, ["ftrackreview-mp4", "ftrackreview-webm", "movie"]
        )

        result = self._read(provider, session, version)

        assert result.movie_path is None
        assert result.frame_path is None

    def test_default_costs_no_location_lookups(self, provider, session):
        """Location lookups are round trips; the default must make none."""
        version = self._version_with(provider, session, ["ftrackreview-mp4", "movie"])

        self._read(provider, session, version)

        assert session.location_lookups == []

    def test_a_playlist_resolves_every_path_in_one_batch(
        self, provider, session, monkeypatch
    ):
        """The whole point: 2 round trips for a playlist, not 2 per version."""
        monkeypatch.setenv("FTRACK_MOVIE_COMPONENTS", "movie")
        monkeypatch.setenv("FTRACK_FRAME_COMPONENTS", "frames")
        project = make_project(session)
        versions = []
        for i in range(4):
            version = make_version(session, project, uuid=f"version-{i}")
            make_components(session, version, ["movie", "frames"])
            versions.append(version)
        location = FakeLocation()
        session.location = location
        playlist = make_playlist(session, project, versions=versions)

        result = provider.get_versions_for_playlist(
            provider._to_id(playlist, "AssetVersionList")
        )

        assert [v.movie_path for v in result] == ["/mnt/ftrack/movie"] * 4
        assert [v.frame_path for v in result] == ["/mnt/ftrack/frames"] * 4
        # One availability request and one path request, whatever the count.
        assert len(session.location_lookups) == 1
        assert len(session.location_lookups[0]) == 8
        assert len(location.path_calls) == 1
        assert len(location.path_calls[0]) == 8
        # And the components themselves arrived in one query.
        assert len(session.queries_against("Component")) == 1

    def test_one_dead_location_does_not_sink_the_others(
        self, provider, session, monkeypatch
    ):
        monkeypatch.setenv("FTRACK_MOVIE_COMPONENTS", "movie")
        version = self._version_with(provider, session, ["movie"])
        dead = FakeLocation("ftrack.server")
        dead.get_filesystem_paths = mock.Mock(
            side_effect=NotImplementedError("get_filesystem_path")
        )
        session.location = dead

        result = self._read(provider, session, version)

        assert result.movie_path is None
        assert result.name == "sh010_comp_v003"

    def test_configured_names_resolve(self, provider, session, monkeypatch):
        monkeypatch.setenv("FTRACK_MOVIE_COMPONENTS", "movie,main")
        version = self._version_with(provider, session, ["movie"])

        assert self._read(provider, session, version).movie_path == "/mnt/ftrack/movie"

    def test_webm_is_recognised_when_configured(self, provider, session, monkeypatch):
        monkeypatch.setenv(
            "FTRACK_MOVIE_COMPONENTS", "ftrackreview-mp4,ftrackreview-webm"
        )
        version = self._version_with(provider, session, ["ftrackreview-webm"])

        result = self._read(provider, session, version)

        assert result.movie_path == "/mnt/ftrack/ftrackreview-webm"

    def test_configured_order_wins_over_server_order(
        self, provider, session, monkeypatch
    ):
        """ftrack encodes both for one version; the setting decides, not the server."""
        monkeypatch.setenv(
            "FTRACK_MOVIE_COMPONENTS", "ftrackreview-mp4,ftrackreview-webm"
        )
        version = self._version_with(
            provider, session, ["ftrackreview-webm", "ftrackreview-mp4"]
        )

        assert (
            self._read(provider, session, version).movie_path
            == "/mnt/ftrack/ftrackreview-mp4"
        )

        monkeypatch.setenv(
            "FTRACK_MOVIE_COMPONENTS", "ftrackreview-webm,ftrackreview-mp4"
        )
        assert (
            self._read(provider, session, version).movie_path
            == "/mnt/ftrack/ftrackreview-webm"
        )

    def test_frames_resolve_separately_from_the_movie(
        self, provider, session, monkeypatch
    ):
        monkeypatch.setenv("FTRACK_MOVIE_COMPONENTS", "movie")
        monkeypatch.setenv("FTRACK_FRAME_COMPONENTS", "frames")
        version = self._version_with(provider, session, ["movie", "frames"])

        result = self._read(provider, session, version)

        assert result.movie_path == "/mnt/ftrack/movie"
        assert result.frame_path == "/mnt/ftrack/frames"

    def test_unmatched_component_means_no_path(self, provider, session, monkeypatch):
        monkeypatch.setenv("FTRACK_MOVIE_COMPONENTS", "movie")
        version = self._version_with(provider, session, ["source-exr"])

        assert self._read(provider, session, version).movie_path is None

    def test_an_unmounted_location_is_not_fatal(self, provider, session, monkeypatch):
        monkeypatch.setenv("FTRACK_MOVIE_COMPONENTS", "movie")
        version = self._version_with(provider, session, ["movie"])
        session.location = None

        result = self._read(provider, session, version)

        assert result.movie_path is None
        assert result.name == "sh010_comp_v003"

    def test_defaults_are_empty(self, monkeypatch):
        monkeypatch.delenv("FTRACK_MOVIE_COMPONENTS", raising=False)
        assert _movie_component_names() == []


class TestProjections:
    """Queries stay flat, and conversion never reaches for an unfetched field.

    A dotted projection makes the ftrack server build the join; a field read
    but not fetched makes it serve a request per entity. Both are invisible in
    the code and both show up as a slow playlist.
    """

    @pytest.fixture(autouse=True)
    def use_lists(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")

    def _load_playlist(self, provider, session, versions=2):
        project = make_project(session)
        rows = [
            make_version(session, project, uuid=f"version-{i}", shot_name=f"sh{i:03d}")
            for i in range(versions)
        ]
        for row in rows:
            session.register(
                FakeEntity(
                    "Note",
                    {
                        "id": f"note-{row['id']}",
                        "content": "Warmer grade",
                        "parent_id": row["id"],
                        "parent_type": "AssetVersion",
                        "metadata": {"dna_subject": "Grade"},
                        "author_id": "user-1",
                    },
                )
            )
        playlist = make_playlist(session, project, versions=rows)
        return provider.get_versions_for_playlist(
            provider._to_id(playlist, "AssetVersionList")
        )

    def test_no_query_selects_a_dotted_path(self, provider, session):
        """The whole point: no `asset.parent.object_type.name` anywhere."""
        self._load_playlist(provider, session)

        for query in session.queries:
            selected = query.split(" from ", 1)[0].removeprefix("select ")
            dotted = [f.strip() for f in selected.split(",") if "." in f]
            assert dotted == [], f"deep projection in: {query}"

    def test_the_layers_are_fetched_separately(self, provider, session):
        """Versions, then assets, then contexts, then object types."""
        self._load_playlist(provider, session)

        for entity_type in (
            "AssetVersion",
            "Asset",
            "TypedContext",
            "ObjectType",
            "Task",
            "Status",
            "User",
            "Project",
        ):
            assert session.queries_against(entity_type), f"never queried {entity_type}"

    def test_each_layer_is_one_query_for_the_whole_batch(self, provider, session):
        versions = self._load_playlist(provider, session, versions=6)

        assert len(versions) == 6
        for entity_type in ("Asset", "TypedContext", "ObjectType", "Task", "Project"):
            assert len(session.queries_against(entity_type)) == 1, entity_type

    def test_conversion_reads_nothing_it_did_not_fetch(self, provider, session):
        """Any read outside a row's flat projection would be an auto-populate."""
        lazy_reads = []
        FakeEntity.lazy_reads = lazy_reads
        try:
            versions = self._load_playlist(provider, session)
        finally:
            FakeEntity.lazy_reads = None

        assert versions[0].entity.description == "A shot"
        assert versions[0].task.project["name"] == "Skyfall"
        assert versions[0].notes[0].subject == "Grade"
        assert lazy_reads == []

    def test_stitched_versions_carry_the_whole_shape(self, provider, session):
        versions = self._load_playlist(provider, session)

        version = versions[0]
        assert version.name == "sh000_comp_v003"
        assert version.status == "Pending Review"
        assert version.entity.name == "sh000"
        assert version.task.pipeline_step["name"] == "Compositing"
        assert version.user.email == "artist@example.com"
        assert version.project["name"] == "Skyfall"

    def test_note_projection_includes_metadata(self):
        """The note subject lives in metadata; unfetched it costs a request each."""
        from dna.prodtrack_providers.ftrack import NOTE_PROJECTION

        assert "metadata" in [f.strip() for f in NOTE_PROJECTION.split(",")]

    def test_no_projection_constant_contains_a_dotted_path(self):
        from dna.prodtrack_providers import ftrack as module

        for name in dir(module):
            if not name.endswith("_PROJECTION"):
                continue
            for field in getattr(module, name).split(","):
                assert "." not in field.strip(), f"{name} has a deep path: {field}"


class TestBatchedReads:
    """A playlist load must not scale its round trips with the version count."""

    @pytest.fixture(autouse=True)
    def use_lists(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")

    def _playlist_of(self, provider, session, count):
        project = make_project(session)
        versions = [
            make_version(session, project, uuid=f"version-{i}", shot_name=f"sh{i:03d}")
            for i in range(count)
        ]
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {
                    "id": "list-1",
                    "name": "dailies",
                    "project": project,
                    "items": versions,
                },
            )
        )
        session.respond("from AssetVersionList where", [playlist])
        session.respond("from AssetVersion where id in", versions)
        return provider._to_id(playlist, "AssetVersionList")

    def _count_id_reads(self, provider):
        reads = []
        real = provider._id_map._fetch_ints

        def counting(uuids):
            reads.append(list(uuids))
            return real(uuids)

        provider._id_map._fetch_ints = counting
        return reads

    def test_id_lookups_do_not_grow_with_the_playlist(self, provider, session):
        """Each version touches ~6 ids; unbatched that would be reads per version."""
        small = self._playlist_of(provider, session, 2)
        provider.get_versions_for_playlist(small)

        session.rules.clear()
        provider._id_map = InMemoryIdMap()
        large = self._playlist_of(provider, session, 20)
        reads = self._count_id_reads(provider)
        versions = provider.get_versions_for_playlist(large)

        assert len(versions) == 20
        # A handful of batches, not one read per entity reference.
        assert len(reads) <= 4
        # And the batch really did carry every version's uuid.
        assert any(len(batch) > 20 for batch in reads)

    def test_warming_covers_nested_references(self, provider, session):
        """Project, user, task, task type and parent context all arrive warmed."""
        playlist_id = self._playlist_of(provider, session, 3)
        provider.get_versions_for_playlist(playlist_id)

        reads = self._count_id_reads(provider)
        # Re-converting the same entities must now hit the cache only.
        provider.get_versions_for_playlist(playlist_id)

        assert reads == []

    def test_versions_are_still_correct_when_batched(self, provider, session):
        playlist_id = self._playlist_of(provider, session, 3)

        versions = provider.get_versions_for_playlist(playlist_id)

        assert [v.name for v in versions] == [
            "sh000_comp_v003",
            "sh001_comp_v003",
            "sh002_comp_v003",
        ]
        assert len({v.id for v in versions}) == 3
        assert all(v.entity is not None for v in versions)
        assert all(v.task.pipeline_step["name"] == "Compositing" for v in versions)


class TestGetEntity:
    @pytest.fixture(autouse=True)
    def use_lists(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")

    def test_reads_a_shot_with_its_tasks(self, provider, session):
        project = make_project(session)
        shot = session.register(
            FakeEntity(
                "Shot",
                {
                    "id": "shot-1",
                    "name": "sh010",
                    "description": "A shot",
                    "project": project,
                    "object_type": {"name": "Shot"},
                },
            )
        )
        session.respond("from Shot where", [shot])
        session.respond(
            "from Task where",
            [
                FakeEntity(
                    "Task",
                    {
                        "id": "task-1",
                        "name": "comp",
                        "type": {"id": "type-1", "name": "Compositing"},
                        "status": {"name": "In Progress"},
                        "project": project,
                        "parent": shot,
                    },
                )
            ],
        )

        result = provider.get_entity("shot", provider._to_id(shot, "Shot"))

        assert isinstance(result, Shot)
        assert [t.name for t in result.tasks] == ["comp"]

    def test_asset_builds_map_to_dna_assets(self, provider, session):
        project = make_project(session)
        build = session.register(
            FakeEntity(
                "AssetBuild",
                {
                    "id": "build-1",
                    "name": "hero_car",
                    "description": "The car",
                    "project": project,
                    "object_type": {"name": "Asset Build"},
                },
            )
        )
        session.respond("from AssetBuild where", [build])

        result = provider.get_entity(
            "asset", provider._to_id(build, "AssetBuild"), resolve_links=False
        )

        assert isinstance(result, Asset)
        assert result.name == "hero_car"

    def test_reads_a_playlist_with_its_versions(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {
                    "id": "list-1",
                    "name": "dailies",
                    "project": project,
                    "items": [version],
                },
            )
        )
        session.respond("from AssetVersionList where", [playlist])
        session.respond("from AssetVersion where id in", [version])

        result = provider.get_entity(
            "playlist", provider._to_id(playlist, "AssetVersionList")
        )

        assert isinstance(result, Playlist)
        assert result.code == "dailies"
        # Versions come back enriched, not as bare membership stubs.
        assert [v.name for v in result.versions] == ["sh010_comp_v003"]
        assert result.versions[0].entity.name == "sh010"

    def test_shallow_read_skips_the_versions(self, provider, session):
        project = make_project(session)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {"id": "list-1", "name": "dailies", "project": project, "items": []},
            )
        )
        session.respond("from AssetVersionList where", [playlist])

        result = provider.get_entity(
            "playlist",
            provider._to_id(playlist, "AssetVersionList"),
            resolve_links=False,
        )

        assert result.versions == []

    def test_rejects_an_unknown_entity_type(self, provider):
        with pytest.raises(ValueError, match="Unknown entity type"):
            provider.get_entity("sequence", 1)


class TestPlaylistsAsLists:
    @pytest.fixture(autouse=True)
    def use_lists(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")

    def test_lists_playlists_for_a_project(self, provider, session):
        project = make_project(session)
        make_playlist(session, project)

        result = provider.get_playlists_for_project(provider._to_id(project, "Project"))

        assert len(result) == 1
        assert isinstance(result[0], Playlist)
        assert result[0].code == "dailies"
        assert result[0].created_at == datetime(2026, 4, 15)

    def test_creates_a_list_with_a_category_and_owner(self, provider, session):
        project = make_project(session)
        session.respond(
            "from ListCategory",
            [FakeEntity("ListCategory", {"id": "cat-1", "name": "Dailies"})],
        )
        session.respond("from User where username", [make_user(session)])

        result = provider.create_playlist(
            provider._to_id(project, "Project"), "dailies_2026_04_15"
        )

        created = session.created[-1]
        assert created.entity_type == "AssetVersionList"
        assert created["name"] == "dailies_2026_04_15"
        assert created["category"]["name"] == "Dailies"
        assert created["owner"] is not None
        assert session.commits == 1
        assert result.code == "dailies_2026_04_15"

    def test_adds_a_version_to_a_list(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {"id": "list-1", "name": "dailies", "project": project, "items": []},
            )
        )

        added = provider.add_version_to_playlist(
            provider._to_id(playlist, "AssetVersionList"),
            provider._to_id(version, "AssetVersion"),
        )

        assert added is True
        assert [item["id"] for item in playlist["items"]] == ["version-1"]
        assert session.commits == 1

    def test_adding_a_version_twice_is_a_no_op(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {
                    "id": "list-1",
                    "name": "dailies",
                    "project": project,
                    "items": [version],
                },
            )
        )

        added = provider.add_version_to_playlist(
            provider._to_id(playlist, "AssetVersionList"),
            provider._to_id(version, "AssetVersion"),
        )

        assert added is True
        assert len(playlist["items"]) == 1
        assert session.commits == 0

    def test_unknown_playlist_raises(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        missing = provider._to_id("list-gone", "AssetVersionList")

        with pytest.raises(ValueError, match="Playlist .* not found"):
            provider.add_version_to_playlist(
                missing, provider._to_id(version, "AssetVersion")
            )


class TestPlaylistsAsClientReviews:
    @pytest.fixture(autouse=True)
    def use_review_sessions(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "ClientReview")

    def test_lists_review_sessions_for_a_project(self, provider, session):
        project = make_project(session)
        make_review_session(
            session, project, name="client round 2", description="for the client"
        )

        result = provider.get_playlists_for_project(provider._to_id(project, "Project"))

        assert [p.code for p in result] == ["client round 2"]
        assert result[0].description == "for the client"

    def test_creates_a_review_session(self, provider, session):
        project = make_project(session)

        provider.create_playlist(provider._to_id(project, "Project"), "client round 2")

        created = session.created[-1]
        assert created.entity_type == "ReviewSession"
        assert created["name"] == "client round 2"
        assert session.commits == 1

    def test_adds_a_version_through_a_review_session_object(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        review = make_review_session(session, project)

        added = provider.add_version_to_playlist(
            provider._to_id(review, "ReviewSession"),
            provider._to_id(version, "AssetVersion"),
        )

        assert added is True
        created = session.created[-1]
        assert created.entity_type == "ReviewSessionObject"
        assert created["version_id"] == version["id"]
        assert created["review_session_id"] == review["id"]
        assert created["name"] == "sh010_comp_v003"

    def test_reads_versions_through_review_session_objects(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        review = make_review_session(session, project, versions=[version])

        versions = provider.get_versions_for_playlist(
            provider._to_id(review, "ReviewSession")
        )

        assert [v.name for v in versions] == ["sh010_comp_v003"]


# ---------------------------------------------------------------------------
# Users and search
# ---------------------------------------------------------------------------


class TestUsers:
    def test_get_user_by_email(self, provider, session):
        session.respond("from User where email", [make_user(session)])

        user = provider.get_user_by_email("artist@example.com")

        assert user.name == "Ada Lovelace"
        assert user.login == "artist"

    def test_missing_user_raises(self, provider, session):
        with pytest.raises(ValueError, match="User not found"):
            provider.get_user_by_email("nobody@example.com")

    def test_projects_for_user_requires_the_user_to_exist(self, provider, session):
        with pytest.raises(ValueError, match="User not found"):
            provider.get_projects_for_user("nobody@example.com")

    def test_projects_for_user_returns_active_projects(self, provider, session):
        session.respond("from User where email", [make_user(session)])
        session.respond("from Project where status", [make_project(session)])

        projects = provider.get_projects_for_user("artist@example.com")

        assert [p.name for p in projects] == ["Skyfall"]


class TestSearch:
    def test_searches_users_by_name_and_email(self, provider, session):
        session.respond("from User where", [make_user(session)])

        results = provider.search("ada", ["user"])

        assert results == [
            {
                "type": "User",
                "id": mock.ANY,
                "name": "Ada Lovelace",
                "email": "artist@example.com",
            }
        ]
        assert "first_name like" in session.queries[-1]

    def test_scopes_shots_to_a_project(self, provider, session):
        project = make_project(session)
        make_context(session, project, "shot-1", "sh010")

        results = provider.search(
            "sh0", ["shot"], project_id=provider._to_id(project, "Project")
        )

        assert results[0]["type"] == "Shot"
        assert results[0]["name"] == "sh010"
        assert results[0]["project"]["name"] == "Skyfall"
        # Scoped on the flat foreign key, not a `project.id` join.
        shot_queries = session.queries_against("Shot")
        assert any('project_id is "project-1"' in q for q in shot_queries)
        assert not any("project.id" in q for q in shot_queries)

    def test_rejects_an_unsupported_type(self, provider):
        with pytest.raises(ValueError, match="Unsupported entity type"):
            provider.search("x", ["sequence"])


# ---------------------------------------------------------------------------
# Find
# ---------------------------------------------------------------------------


class TestFind:
    def test_translates_dna_filters_into_ftrack_expressions(self, provider, session):
        project = make_project(session)

        provider.find(
            "shot",
            [
                {
                    "field": "project",
                    "operator": "is",
                    "value": {
                        "type": "Project",
                        "id": provider._to_id(project, "Project"),
                    },
                },
                {"field": "name", "operator": "contains", "value": "sh0"},
            ],
        )

        expression = session.queries_against("Shot")[0]
        assert 'project_id is "project-1"' in expression
        assert 'name like "%sh0%"' in expression

    def test_rejects_an_unknown_field(self, provider):
        with pytest.raises(ValueError, match="Unknown field 'colour'"):
            provider.find("shot", [{"field": "colour", "operator": "is", "value": "x"}])

    def test_rejects_an_unsupported_operator(self, provider):
        with pytest.raises(ValueError, match="Unsupported filter operator"):
            provider.find(
                "shot", [{"field": "name", "operator": "starts_with", "value": "x"}]
            )

    def test_applies_the_limit(self, provider, session):
        project = make_project(session)
        for i in range(5):
            make_context(session, project, f"shot-{i}", f"sh{i:03d}")

        assert len(provider.find("shot", [], limit=2)) == 2

    def test_filtered_queries_ask_only_for_ids(self, provider, session):
        """The filtered query is the worst place for a join; keep it minimal."""
        project = make_project(session)
        make_context(session, project, "shot-1", "sh010")

        results = provider.find(
            "shot",
            [
                {
                    "field": "project",
                    "operator": "is",
                    "value": provider._to_id(project, "Project"),
                }
            ],
        )

        assert [r.name for r in results] == ["sh010"]
        assert session.queries_against("Shot") == [
            'select id from Shot where project_id is "project-1"'
        ]


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------


class TestPublishNote:
    def test_creates_a_note_on_the_version(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        author = make_user(session, uuid="user-2", email="lead@example.com")
        recipient = make_user(session)
        session.respond("from User where email", [author])
        session.respond("from User where id in", [recipient])
        session.respond("from Note where parent_id is", [])

        note_id = provider.publish_note(
            version_id=provider._to_id(version, "AssetVersion"),
            content="Warmer grade please",
            subject="Grade",
            to_users=[provider._to_id(recipient, "User")],
            cc_users=[],
            links=[],
            author_email="lead@example.com",
        )

        created = session.created_notes[-1]
        assert created["content"] == "Warmer grade please"
        assert created["author"] is author
        assert created["parent_id"] == "version-1"
        # ftrack has no subject field; DNA's goes to metadata.
        assert created["metadata"]["dna_subject"] == "Grade"
        assert len(created.recipients) == 1
        assert isinstance(note_id, int)

    def test_recipients_resolve_in_one_query(self, provider, session):
        """to_users and cc_users together, however many, cost one lookup."""
        project = make_project(session)
        version = make_version(session, project)
        recipients = [
            make_user(session, uuid=f"user-{i}", email=f"r{i}@example.com")
            for i in range(5)
        ]
        session.respond("from User where username", [recipients[0]])
        session.respond("from User where id in", recipients)
        session.respond("from Note where parent_id is", [])

        provider.publish_note(
            version_id=provider._to_id(version, "AssetVersion"),
            content="Notes for everyone",
            subject="Round 2",
            to_users=[provider._to_id(u, "User") for u in recipients[:3]],
            cc_users=[provider._to_id(u, "User") for u in recipients[3:]],
            links=[],
        )

        assert len(session.created_notes[-1].recipients) == 5
        user_queries = [q for q in session.queries if "from User where id in" in q]
        assert len(user_queries) == 1

    def test_is_idempotent_on_identical_content(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        existing = FakeEntity(
            "Note",
            {
                "id": "note-existing",
                "content": "Warmer grade please",
                "parent_id": "version-1",
                "author": make_user(session),
                "metadata": {"dna_subject": "Grade"},
            },
        )
        session.respond("from User where username", [make_user(session)])
        session.respond("from Note where parent_id is", [existing])

        note_id = provider.publish_note(
            version_id=provider._to_id(version, "AssetVersion"),
            content="Warmer grade please",
            subject="Grade",
            to_users=[],
            cc_users=[],
            links=[],
        )

        assert note_id == provider._to_id(existing, "Note")
        assert session.created_notes == []

    def test_unknown_author_raises_user_not_found(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        session.respond("from Note where parent_id is", [])

        with pytest.raises(UserNotFoundError, match="Author not found in ftrack"):
            provider.publish_note(
                version_id=provider._to_id(version, "AssetVersion"),
                content="hi",
                subject="s",
                to_users=[],
                cc_users=[],
                links=[],
                author_email="ghost@example.com",
            )

    def test_sets_the_version_status(self, provider, session):
        project = make_project(session, statuses=["Approved"])
        version = make_version(session, project)
        session.respond("from Note where parent_id is", [])

        provider.publish_note(
            version_id=provider._to_id(version, "AssetVersion"),
            content="Looks good",
            subject="Approval",
            to_users=[],
            cc_users=[],
            links=[],
            version_status="Approved",
        )

        assert version["status"]["name"] == "Approved"


class TestPublishPlaylistNote:
    @pytest.fixture(autouse=True)
    def use_lists(self, monkeypatch):
        monkeypatch.setenv("FTRACK_PLAYLIST_ENTITY", "AssetVersionList")

    def test_falls_back_to_the_project_when_the_type_takes_no_notes(
        self, provider, session
    ):
        project = make_project(session)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {"id": "list-1", "name": "dailies", "project": project, "items": []},
            )
        )
        session.respond("from AssetVersionList where", [playlist])
        session.respond("from User where username", [make_user(session)])
        session.respond("from Note where parent_id is", [])
        # session.types has no AssetVersionList -> the schema has no notes relation.

        provider.publish_playlist_note(
            playlist_id=provider._to_id(playlist, "AssetVersionList"),
            content="General notes",
            subject="Session",
            to_users=[],
            cc_users=[],
            links=[],
        )

        created = session.created_notes[-1]
        assert created["parent_type"] == "Project"
        assert created["content"] == "[dailies]\nGeneral notes"

    def test_attaches_to_the_playlist_when_the_schema_allows_it(
        self, provider, session
    ):
        project = make_project(session)
        playlist = session.register(
            FakeEntity(
                "AssetVersionList",
                {"id": "list-1", "name": "dailies", "project": project, "items": []},
            )
        )
        session.respond("from AssetVersionList where", [playlist])
        session.respond("from User where username", [make_user(session)])
        session.respond("from Note where parent_id is", [])
        session.types["AssetVersionList"] = mock.Mock(attributes={"notes": object()})

        provider.publish_playlist_note(
            playlist_id=provider._to_id(playlist, "AssetVersionList"),
            content="General notes",
            subject="Session",
            to_users=[],
            cc_users=[],
            links=[],
        )

        created = session.created_notes[-1]
        assert created["parent_type"] == "AssetVersionList"
        assert created["content"] == "General notes"


class TestAddEntity:
    def test_creates_a_note_against_its_first_link(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        session.respond("from User where username", [make_user(session)])

        result = provider.add_entity(
            "note",
            Note(
                id=0,
                subject="Grade",
                content="Warmer",
                note_links=[Version(id=provider._to_id(version, "AssetVersion"))],
            ),
        )

        assert isinstance(result, Note)
        assert session.created_notes[-1]["parent_id"] == "version-1"

    def test_requires_a_link(self, provider):
        with pytest.raises(ValueError, match="needs a note_link"):
            provider.add_entity("note", Note(id=0, content="orphan"))

    def test_other_entity_types_are_not_supported(self, provider):
        with pytest.raises(NotImplementedError):
            provider.add_entity("shot", Shot(id=1, name="sh010"))


class TestAttachFileToNote:
    def test_uploads_and_links_a_component(self, provider, session, tmp_path):
        note = session.register(
            FakeEntity("Note", {"id": "note-1", "content": "x", "metadata": {}})
        )
        path = tmp_path / "frame.jpg"
        path.write_bytes(b"jpeg")
        session.create_component = mock.Mock(
            return_value=FakeEntity("FileComponent", {"id": "component-1"})
        )

        assert provider.attach_file_to_note(
            provider._to_id(note, "Note"), str(path), "frame.jpg"
        )

        session.create_component.assert_called_once()
        assert session.created[-1].entity_type == "NoteComponent"

    def test_reports_failure_instead_of_raising(self, provider, session, tmp_path):
        note = session.register(
            FakeEntity("Note", {"id": "note-1", "content": "x", "metadata": {}})
        )
        session.create_component = mock.Mock(side_effect=RuntimeError("no location"))

        assert not provider.attach_file_to_note(
            provider._to_id(note, "Note"), str(tmp_path / "missing.jpg"), "x.jpg"
        )
        assert session.rollbacks == 1


# ---------------------------------------------------------------------------
# Statuses
# ---------------------------------------------------------------------------


class TestVersionStatuses:
    def test_reads_statuses_from_the_project_schema(self, provider, session):
        project = make_project(session, statuses=["Pending Review", "Approved"])

        statuses = provider.get_version_statuses(provider._to_id(project, "Project"))

        # ftrack statuses have no short code; the name doubles as one.
        assert statuses == [
            {"code": "Pending Review", "name": "Pending Review"},
            {"code": "Approved", "name": "Approved"},
        ]

    def test_update_sets_a_matching_status(self, provider, session):
        project = make_project(session, statuses=["Approved"])
        version = make_version(session, project)

        assert provider.update_version_status(
            provider._to_id(version, "AssetVersion"), "Approved"
        )
        assert version["status"]["name"] == "Approved"

    def test_update_refuses_a_status_outside_the_schema(self, provider, session):
        project = make_project(session, statuses=["Approved"])
        version = make_version(session, project)

        assert not provider.update_version_status(
            provider._to_id(version, "AssetVersion"), "Omitted"
        )

    def test_the_schema_is_read_once_per_publish_round(self, provider, session):
        """A publish updates every version; the schema must not be re-read."""
        project = make_project(session, statuses=["Approved"])
        versions = [
            make_version(session, project, uuid=f"version-{i}") for i in range(5)
        ]

        for version in versions:
            assert provider.update_version_status(
                provider._to_id(version, "AssetVersion"), "Approved"
            )

        assert len(session.queries_against("Project")) == 1


# ---------------------------------------------------------------------------
# Transcripts
# ---------------------------------------------------------------------------


class TestTranscripts:
    def test_transcripts_are_notes(self, provider):
        assert provider.transcript_entity_type() == "Note"

    def test_publish_records_the_meeting_on_the_note(self, provider, session):
        project = make_project(session)
        version = make_version(session, project)
        session.respond("from User where username", [make_user(session)])

        entity_id = provider.publish_transcript(
            project_id=provider._to_id(project, "Project"),
            playlist_id=42,
            version_id=provider._to_id(version, "AssetVersion"),
            meeting_id="meet-1",
            meeting_date=date(2026, 4, 15),
            platform="google_meet",
            body="Speaker: hello",
        )

        created = session.created_notes[-1]
        assert created["content"] == "Speaker: hello"
        assert created["metadata"]["dna_kind"] == "transcript"
        assert created["metadata"]["dna_meeting_id"] == "meet-1"
        assert created["metadata"]["dna_meeting_date"] == "2026-04-15"
        assert created["metadata"]["dna_platform"] == "google_meet"
        assert isinstance(entity_id, int)

    def test_update_rewrites_body_and_date(self, provider, session):
        note = session.register(
            FakeEntity("Note", {"id": "note-1", "content": "old", "metadata": {}})
        )

        assert provider.update_transcript(
            entity_type="Note",
            entity_id=provider._to_id(note, "Note"),
            body="Speaker: updated",
            meeting_date=date(2026, 4, 16),
        )
        assert note["content"] == "Speaker: updated"
        assert note["metadata"]["dna_meeting_date"] == "2026-04-16"

    def test_update_of_an_unknown_row_reports_failure(self, provider):
        assert not provider.update_transcript(
            entity_type="Note",
            entity_id=999,
            body="x",
            meeting_date=date(2026, 4, 16),
        )


# ---------------------------------------------------------------------------
# Wiring
# ---------------------------------------------------------------------------


class TestProviderFactory:
    def test_builds_an_ftrack_provider(self):
        with mock.patch.dict(
            os.environ,
            {
                "PRODTRACK_PROVIDER": "ftrack",
                "FTRACK_SERVER": SERVER_URL,
                "FTRACK_API_KEY": "key",
                "FTRACK_API_USER": "api@example.com",
                "FTRACK_ID_MAP": "memory",
            },
        ), mock.patch("dna.prodtrack_providers.ftrack.ftrack_api.Session") as session:
            provider = get_prodtrack_provider()

        assert isinstance(provider, FtrackProvider)
        session.assert_called_once_with(
            server_url=SERVER_URL,
            api_key="key",
            api_user="api@example.com",
            auto_connect_event_hub=False,
        )

    def test_missing_credentials_are_reported(self):
        with mock.patch.dict(os.environ, {"PRODTRACK_PROVIDER": "ftrack"}, clear=True):
            with pytest.raises(ValueError, match="ftrack credentials not provided"):
                get_prodtrack_provider()

    def test_operations_before_connecting_are_refused(self):
        provider = FtrackProvider(
            server_url=SERVER_URL,
            api_key="key",
            api_user="api@example.com",
            id_map=InMemoryIdMap(),
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ftrack"):
            provider.get_user_by_email("artist@example.com")
