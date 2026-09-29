"""ftrack production tracking provider implementation.

Mirrors the surface the ShotGrid and mock providers expose, over ftrack's
schema. Two things differ from ShotGrid deeply enough to call out:

* **Ids.** ftrack keys entities by UUID, DNA by int. Every id crossing this
  boundary goes through :mod:`dna.prodtrack_providers.ftrack_id_map`, which
  hands out a stable int per UUID and remembers the pairing. Nothing outside
  this module sees a UUID.

* **Playlists.** ftrack has two entities a studio might call a playlist:
  ``AssetVersionList`` (Lists) and ``ReviewSession`` (Client Reviews). Which one
  is used is a setting, resolved per call through :meth:`FtrackProvider.playlist_adapter`
  so a future per-user preference can replace the env var without touching the
  operations built on top of it. ``AssetVersionList`` is the default.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import date, datetime
from typing import Any, Iterable, Optional, cast

import ftrack_api

from dna.models.entity import (
    Asset,
    EntityBase,
    Note,
    Playlist,
    Project,
    Shot,
    Task,
    User,
    Version,
)
from dna.prodtrack_providers.ftrack_id_map import FtrackIdMap, get_ftrack_id_map
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    UserNotFoundError,
)

logger = logging.getLogger(__name__)

# DNA entity type -> ftrack entity type. `playlist` is deliberately absent: it
# is resolved from settings, see PLAYLIST_ADAPTERS below.
DNA_TO_FTRACK_TYPE: dict[str, str] = {
    "project": "Project",
    "shot": "Shot",
    # ftrack's `Asset` is the container a version hangs off, not a modelled
    # thing. The DNA `asset` (character, prop, environment) is an AssetBuild.
    "asset": "AssetBuild",
    "task": "Task",
    "version": "AssetVersion",
    "note": "Note",
    "user": "User",
}

# Projections stay FLAT — scalar columns and `*_id` foreign keys only, never a
# dotted path like `asset.parent.object_type.name`. A deep projection makes the
# ftrack server build those joins, which is reliably slower than asking for each
# layer separately: versions, then their assets, then those assets' parents,
# then the parents' object types. Each follow-up is one `id in (...)` query for
# the whole batch, so the round trips stay constant in the number of versions
# while the server does far less work per query. `_hydrate_versions` walks the
# layers and stitches the nested shape the converters expect.
PROJECT_PROJECTION = "id, name, full_name"

USER_PROJECTION = "id, username, email, first_name, last_name"

STATUS_PROJECTION = "id, name"

TYPE_PROJECTION = "id, name"

OBJECT_TYPE_PROJECTION = "id, name"

# ftrack's Asset is the container a version hangs off; `context_id` is the
# context (Shot, AssetBuild, ...) that DNA actually wants. Note the name: Asset
# uses `context_id` where Task and Note use `parent_id`.
ASSET_PROJECTION = "id, name, context_id"

CONTEXT_PROJECTION = "id, name, description, object_type_id, project_id"

TASK_PROJECTION = "id, name, type_id, status_id, project_id, parent_id"

VERSION_PROJECTION = (
    "id, version, comment, date, is_published, thumbnail_id, "
    "asset_id, task_id, user_id, project_id, status_id"
)

COMPONENT_PROJECTION = "id, name, version_id"

NOTE_PROJECTION = "id, content, date, parent_id, parent_type, metadata, author_id"

# ftrack notes have no subject field; DNA's is round-tripped through metadata.
NOTE_SUBJECT_KEY = "dna_subject"

TRANSCRIPT_METADATA_KEYS = {
    "meeting_id": "dna_meeting_id",
    "meeting_date": "dna_meeting_date",
    "platform": "dna_platform",
    "playlist_id": "dna_playlist_id",
    "kind": "dna_kind",
}
TRANSCRIPT_KIND = "transcript"

# Types with no `project` attribute to warm. Everything else DNA reads —
# contexts, lists, review sessions — has one.
_PROJECTLESS_TYPES = frozenset({"Project", "User", "Type", "Status"})

# ftrack rejects very long query expressions; ids go out in chunks this size.
_QUERY_CHUNK = 200


class _Stitched(dict):
    """A nested entity assembled from flat query results.

    Carries `entity_type` so it is indistinguishable from an ftrack entity to
    the converters — and, unlike one, never lazily fetches anything.
    """

    __slots__ = ("entity_type",)

    def __init__(self, entity_type: str, data: dict):
        super().__init__(data)
        self.entity_type = entity_type


def _cache_ttl() -> float:
    """Seconds to reuse project and status lookups. 0 disables caching.

    The provider is a process-lifetime singleton, so these cannot be cached
    forever: a studio editing its project schema should not need a redeploy.
    """
    return float(os.getenv("FTRACK_CACHE_SECONDS", "300"))


def _quote(value: Any) -> str:
    """Quote a value for an ftrack query expression."""
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _full_name(user_entity: Any) -> Optional[str]:
    """Best display name for an ftrack user."""
    if user_entity is None:
        return None
    parts = [user_entity.get("first_name"), user_entity.get("last_name")]
    name = " ".join(p for p in parts if p).strip()
    return name or user_entity.get("username")


def _version_name(ftrack_version: Any) -> str:
    """Compose the version label ftrack shows as `asset - v003`."""
    asset = ftrack_version.get("asset")
    asset_name = asset.get("name") if asset else None
    number = ftrack_version.get("version")
    if asset_name and number is not None:
        return f"{asset_name}_v{int(number):03d}"
    if asset_name:
        return str(asset_name)
    return f"v{number:03d}" if number is not None else ""


class PlaylistAdapter:
    """One way of treating an ftrack entity as a DNA playlist.

    Subclasses own everything that differs between the entity types a studio
    may pick, so the provider's playlist methods read the same either way.
    """

    entity_type: str = ""
    projection: str = ""

    def list_for_project(self, session: Any, project_uuid: str) -> list[Any]:
        raise NotImplementedError()

    def create(self, session: Any, project: Any, name: str) -> Any:
        raise NotImplementedError()

    def version_ids(self, session: Any, playlist: Any) -> list[str]:
        """Member version ids only; the provider hydrates them in layers."""
        raise NotImplementedError()

    def add_version(
        self, session: Any, playlist: Any, version: Any, display: Any = None
    ) -> bool:
        """Link *version* to *playlist*.

        *display* is the hydrated version, for adapters that store their own
        copy of its name; the raw entity carries only foreign keys.
        """
        raise NotImplementedError()

    def description(self, playlist: Any) -> Optional[str]:
        return None

    def created_at(self, playlist: Any) -> Optional[datetime]:
        return None

    def updated_at(self, playlist: Any) -> Optional[datetime]:
        return None


class ListPlaylistAdapter(PlaylistAdapter):
    """ftrack Lists (`AssetVersionList`) as playlists. The default."""

    entity_type = "AssetVersionList"
    projection = "id, name, date, is_open, category_id, project_id"

    def list_for_project(self, session: Any, project_uuid: str) -> list[Any]:
        return list(
            session.query(
                f"select {self.projection} from {self.entity_type} "
                f"where project_id is {_quote(project_uuid)}"
            )
        )

    def create(self, session: Any, project: Any, name: str) -> Any:
        data: dict[str, Any] = {"name": name, "project": project}

        # `category` is required on lists. Studios name their categories
        # freely, so take the configured one and otherwise the first available.
        category = self._category(session)
        if category is not None:
            data["category"] = category

        owner = self._api_user(session)
        if owner is not None:
            data["owner"] = owner

        return session.create(self.entity_type, data)

    def _category(self, session: Any) -> Any:
        configured = os.getenv("FTRACK_LIST_CATEGORY")
        if configured:
            category = session.query(
                f"select id from ListCategory where name is {_quote(configured)}"
            ).first()
            if category is not None:
                return category
            logger.warning(
                "FTRACK_LIST_CATEGORY=%s does not match any ListCategory; "
                "falling back to the first category on the server.",
                configured,
            )
        return session.query("select id, name from ListCategory").first()

    def _api_user(self, session: Any) -> Any:
        return session.query(
            f"select id from User where username is {_quote(session.api_user)}"
        ).first()

    def version_ids(self, session: Any, playlist: Any) -> list[str]:
        return [item["id"] for item in playlist["items"]]

    def add_version(
        self, session: Any, playlist: Any, version: Any, display: Any = None
    ) -> bool:
        if any(item["id"] == version["id"] for item in playlist["items"]):
            return True
        playlist["items"].append(version)
        session.commit()
        return True

    def created_at(self, playlist: Any) -> Optional[datetime]:
        return playlist.get("date")


class ReviewSessionPlaylistAdapter(PlaylistAdapter):
    """ftrack Client Reviews (`ReviewSession`) as playlists."""

    entity_type = "ReviewSession"
    projection = "id, name, description, created_at, end_date, project_id"

    def list_for_project(self, session: Any, project_uuid: str) -> list[Any]:
        return list(
            session.query(
                f"select {self.projection} from {self.entity_type} "
                f"where project_id is {_quote(project_uuid)}"
            )
        )

    def create(self, session: Any, project: Any, name: str) -> Any:
        return session.create(self.entity_type, {"name": name, "project": project})

    # The join's foreign key to the version is `version_id` — not
    # `asset_version_id`, despite the entity linking AssetVersions. Note it sits
    # beside a separate string field also called `version`, which is the display
    # copy below.
    def version_ids(self, session: Any, playlist: Any) -> list[str]:
        objects = session.query(
            "select version_id from ReviewSessionObject "
            f"where review_session_id is {_quote(playlist['id'])}"
        )
        return [obj["version_id"] for obj in objects if obj.get("version_id")]

    def add_version(
        self, session: Any, playlist: Any, version: Any, display: Any = None
    ) -> bool:
        existing = session.query(
            "select id from ReviewSessionObject where review_session_id is "
            f"{_quote(playlist['id'])} and version_id is "
            f"{_quote(version['id'])}"
        ).first()
        if existing is not None:
            return True

        # ReviewSessionObject carries its own display copy of the version's
        # identity, and ftrack shows that rather than the version's own. The
        # raw entity holds only foreign keys, so the labels come from the
        # hydrated copy.
        labelled = display if display is not None else version
        session.create(
            "ReviewSessionObject",
            {
                # Linked by foreign key. The `review_session` / `asset_version`
                # relationship attributes exist too and would work, but the
                # columns are what the rest of this adapter queries on, so
                # linking the same way keeps it consistent.
                "review_session_id": playlist["id"],
                "version_id": version["id"],
                "name": _version_name(labelled),
                "version": str(labelled.get("version") or ""),
                "description": labelled.get("comment") or "",
            },
        )
        session.commit()
        return True

    def description(self, playlist: Any) -> Optional[str]:
        return playlist.get("description")

    def created_at(self, playlist: Any) -> Optional[datetime]:
        return playlist.get("created_at")


# Accepts both the ftrack schema names and the names the ftrack UI uses, since
# the setting is headed for a user-facing picker.
PLAYLIST_ADAPTERS: dict[str, type[PlaylistAdapter]] = {
    "assetversionlist": ListPlaylistAdapter,
    "list": ListPlaylistAdapter,
    "lists": ListPlaylistAdapter,
    "reviewsession": ReviewSessionPlaylistAdapter,
    "clientreview": ReviewSessionPlaylistAdapter,
    "clientreviews": ReviewSessionPlaylistAdapter,
}

DEFAULT_PLAYLIST_ENTITY = "AssetVersionList"


def resolve_playlist_adapter(entity_type: Optional[str]) -> PlaylistAdapter:
    """Build the adapter for *entity_type*, defaulting to Lists."""
    key = (entity_type or DEFAULT_PLAYLIST_ENTITY).strip().lower()
    adapter_class = PLAYLIST_ADAPTERS.get(key)
    if adapter_class is None:
        raise ValueError(
            f"Unknown ftrack playlist entity type: {entity_type}. "
            f"Supported: {sorted({c.entity_type for c in PLAYLIST_ADAPTERS.values()})}"
        )
    return adapter_class()


class FtrackProvider(ProdtrackProviderBase):
    """ftrack provider for production tracking operations."""

    def __init__(
        self,
        server_url: Optional[str] = None,
        api_key: Optional[str] = None,
        api_user: Optional[str] = None,
        playlist_entity_type: Optional[str] = None,
        id_map: Optional[FtrackIdMap] = None,
        connect: bool = True,
    ):
        """Initialise the ftrack connection.

        Args:
            server_url: ftrack server URL. Defaults to FTRACK_SERVER env var.
            api_key: API key. Defaults to FTRACK_API_KEY env var.
            api_user: API user. Defaults to FTRACK_API_USER env var.
            playlist_entity_type: Pins the entity used as a playlist for this
                instance. Left unset, the setting is re-read on every playlist
                call so a change takes effect without a restart.
            id_map: UUID <-> int store. Defaults to the configured backend.
            connect: Whether to open the session immediately.
        """
        super().__init__()

        self.server_url = server_url or os.getenv("FTRACK_SERVER")
        self.api_key = api_key or os.getenv("FTRACK_API_KEY")
        self.api_user = api_user or os.getenv("FTRACK_API_USER")
        self._playlist_entity_type = playlist_entity_type

        if not all([self.server_url, self.api_key, self.api_user]):
            raise ValueError(
                "ftrack credentials not provided. Set FTRACK_SERVER, "
                "FTRACK_API_KEY, and FTRACK_API_USER environment variables."
            )

        self.server_url = (self.server_url or "").rstrip("/")
        self._id_map = id_map if id_map is not None else get_ftrack_id_map()
        self._base_url = (os.getenv("API_BASE_URL", "http://localhost:8000")).rstrip(
            "/"
        )

        # Status lookups repeat across a publish round; version->project never
        # changes at all. See _project_statuses / _project_uuid_for_version.
        self._status_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._project_cache: dict[str, tuple[float, _Stitched]] = {}
        self._version_project: dict[str, str] = {}

        self.session: Any = None
        if connect:
            self.connect()

    def connect(self) -> None:
        """Open the ftrack session."""
        self.session = ftrack_api.Session(
            server_url=self.server_url,
            api_key=self.api_key,
            api_user=self.api_user,
            auto_connect_event_hub=False,
        )

    @property
    def _session(self) -> Any:
        if self.session is None:
            raise ValueError("Not connected to ftrack")
        return self.session

    def _safe_rollback(self) -> None:
        """Roll back if there is a session to roll back, never raising."""
        try:
            if self.session is not None:
                self.session.rollback()
        except Exception:
            logger.debug("Rollback failed", exc_info=True)

    # ------------------------------------------------------------------
    # Playlist entity type
    # ------------------------------------------------------------------

    def playlist_adapter(self) -> PlaylistAdapter:
        """The adapter for the entity type currently configured as a playlist.

        Resolved per call rather than cached at init. Today the value comes
        from FTRACK_PLAYLIST_ENTITY; when the choice becomes a user setting,
        this is the only place that has to learn how to read it.
        """
        if self._playlist_entity_type is not None:
            return resolve_playlist_adapter(self._playlist_entity_type)
        return resolve_playlist_adapter(
            os.getenv("FTRACK_PLAYLIST_ENTITY", DEFAULT_PLAYLIST_ENTITY)
        )

    # ------------------------------------------------------------------
    # Id translation
    # ------------------------------------------------------------------

    def _to_id(self, ftrack_entity: Any, entity_type: Optional[str] = None) -> int:
        """Surrogate int for an ftrack entity (or a raw uuid + type)."""
        if isinstance(ftrack_entity, str):
            if entity_type is None:
                raise ValueError("entity_type is required when mapping a raw uuid")
            return self._id_map.to_int(ftrack_entity, entity_type)
        resolved_type = entity_type or ftrack_entity.entity_type
        return self._id_map.to_int(ftrack_entity["id"], resolved_type)

    def _to_uuid(self, entity_type: str, entity_id: int) -> str:
        """UUID behind a surrogate int, raising the way callers expect."""
        uuid = self._id_map.to_uuid(entity_id)
        if uuid is None:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}")
        return uuid

    def _warm_ids(self, entities: Iterable[Any]) -> None:
        """Pre-map every uuid a batch of entities will need.

        Conversion asks for an id per entity and per nested reference — a
        version alone touches its project, user, task, task type and parent
        context. Resolved one at a time that is a store round trip each; warmed
        here it is one for the batch, and every later `_to_id` is a cache hit.

        Walks each type's own references rather than probing for likely
        attribute names. A blind probe is only safe while no type happens to
        carry an unprojected attribute by that name — and reading one is the
        auto-populate round trip the projections exist to avoid.
        """
        pairs: list[tuple[str, str]] = []

        def collect(entity: Any, entity_type: Optional[str] = None) -> None:
            if not entity:
                return
            resolved = entity_type or getattr(entity, "entity_type", None)
            # Plain dicts with no discoverable type fall back to resolving
            # individually; real ftrack entities always carry entity_type.
            if resolved and entity.get("id"):
                pairs.append((entity["id"], resolved))

        def collect_context(context: Any) -> None:
            collect(context)
            if context:
                collect(context.get("project"), "Project")

        def collect_task(task: Any) -> None:
            collect(task, "Task")
            if task:
                collect(task.get("type"), "Type")
                collect(task.get("project"), "Project")

        for entity in entities:
            collect(entity)
            kind = getattr(entity, "entity_type", None)

            if kind == "AssetVersion":
                collect(entity.get("project"), "Project")
                collect(entity.get("user"), "User")
                collect_task(entity.get("task"))
                asset = entity.get("asset")
                if asset:
                    collect_context(asset.get("parent"))
            elif kind == "Task":
                collect_task(entity)
                collect_context(entity.get("parent"))
            elif kind == "Note":
                # Notes are fetched with author_id only; callers that resolve
                # the author warm it with the author row.
                pass
            elif kind not in _PROJECTLESS_TYPES:
                # Contexts, lists and review sessions all carry a project link
                # and nothing else the conversions reach for.
                collect(entity.get("project"), "Project")

        if pairs:
            self._id_map.to_ints(pairs)

    # ------------------------------------------------------------------
    # Hydration
    #
    # Each helper issues ONE flat query for a whole batch of ids. Callers chain
    # them layer by layer instead of asking the server for a deep projection.
    # ------------------------------------------------------------------

    def _fetch_by_ids(
        self, ftrack_type: str, uuids: Iterable[str], projection: str
    ) -> dict[str, Any]:
        """One flat `id in (...)` query, keyed by id. Empty input costs nothing."""
        unique = [u for u in dict.fromkeys(uuids) if u]
        if not unique:
            return {}

        fetched: dict[str, Any] = {}
        # ftrack rejects over-long expressions; chunk rather than risk one.
        for start in range(0, len(unique), _QUERY_CHUNK):
            chunk = unique[start : start + _QUERY_CHUNK]
            quoted = ", ".join(_quote(uuid) for uuid in chunk)
            for entity in self._session.query(
                f"select {projection} from {ftrack_type} where id in ({quoted})"
            ):
                fetched[entity["id"]] = entity
        return fetched

    def _stitch_projects(self, rows: Iterable[Any]) -> dict[str, _Stitched]:
        """{id: project} for every project_id in *rows*.

        Cached, because hydrating one playlist reaches for the project from
        three directions — the versions, their contexts and their tasks — and
        it is almost always the same one.
        """
        wanted = [r.get("project_id") for r in rows]

        ttl = _cache_ttl()
        now = time.monotonic()
        found: dict[str, _Stitched] = {}
        missing: list[str] = []
        for uuid in wanted:
            if not uuid:
                continue
            entry = self._project_cache.get(uuid)
            if entry is not None and ttl > 0 and (now - entry[0]) < ttl:
                found[uuid] = entry[1]
            else:
                missing.append(uuid)

        if missing:
            fetched = self._fetch_by_ids("Project", missing, PROJECT_PROJECTION)
            for uuid, project in fetched.items():
                stitched = _Stitched(
                    "Project",
                    {
                        "id": uuid,
                        "name": project.get("name"),
                        "full_name": project.get("full_name"),
                    },
                )
                self._project_cache[uuid] = (now, stitched)
                found[uuid] = stitched
        return found

    def _stitch_contexts(self, context_uuids: Iterable[str]) -> dict[str, _Stitched]:
        """Shots, asset builds and the like, with object type and project.

        Three flat queries — contexts, their object types, their projects —
        instead of one `...parent.object_type.name` join.
        """
        contexts = self._fetch_by_ids("TypedContext", context_uuids, CONTEXT_PROJECTION)
        if not contexts:
            return {}

        object_types = self._fetch_by_ids(
            "ObjectType",
            [c.get("object_type_id") for c in contexts.values()],
            OBJECT_TYPE_PROJECTION,
        )
        projects = self._stitch_projects(contexts.values())

        stitched: dict[str, _Stitched] = {}
        for uuid, context in contexts.items():
            object_type = object_types.get(context.get("object_type_id"))
            stitched[uuid] = _Stitched(
                # The concrete type ftrack returned, which is what decides
                # between DNA's Shot and Asset.
                getattr(context, "entity_type", "TypedContext"),
                {
                    "id": uuid,
                    "name": context.get("name"),
                    "description": context.get("description"),
                    "object_type": (
                        {"name": object_type.get("name")} if object_type else None
                    ),
                    "project": projects.get(context.get("project_id")),
                },
            )
        return stitched

    def _stitch_tasks(
        self,
        task_uuids: Iterable[str],
        contexts: Optional[dict[str, _Stitched]] = None,
    ) -> dict[str, _Stitched]:
        """Tasks with their type, status and project, in flat queries."""
        tasks = self._fetch_by_ids("Task", task_uuids, TASK_PROJECTION)
        if not tasks:
            return {}

        types = self._fetch_by_ids(
            "Type", [t.get("type_id") for t in tasks.values()], TYPE_PROJECTION
        )
        statuses = self._fetch_by_ids(
            "Status", [t.get("status_id") for t in tasks.values()], STATUS_PROJECTION
        )
        projects = self._stitch_projects(tasks.values())

        stitched: dict[str, _Stitched] = {}
        for uuid, task in tasks.items():
            task_type = types.get(task.get("type_id"))
            status = statuses.get(task.get("status_id"))
            stitched[uuid] = _Stitched(
                "Task",
                {
                    "id": uuid,
                    "name": task.get("name"),
                    "type": (
                        {"id": task_type["id"], "name": task_type.get("name")}
                        if task_type
                        else None
                    ),
                    "status": {"name": status.get("name")} if status else None,
                    "project": projects.get(task.get("project_id")),
                    "parent": (contexts or {}).get(task.get("parent_id")),
                },
            )
        return stitched

    def _hydrate_versions(self, version_uuids: list[str]) -> list[_Stitched]:
        """Assemble whole versions from flat, batched queries.

        The layers: versions -> assets -> parent contexts -> object types, plus
        statuses, users, tasks and projects alongside. Roughly ten queries for a
        playlist of any size, none of them asking the server to join.
        """
        versions = self._fetch_by_ids("AssetVersion", version_uuids, VERSION_PROJECTION)
        if not versions:
            return []
        rows = list(versions.values())

        assets = self._fetch_by_ids(
            "Asset", [v.get("asset_id") for v in rows], ASSET_PROJECTION
        )
        contexts = self._stitch_contexts([a.get("context_id") for a in assets.values()])
        tasks = self._stitch_tasks([v.get("task_id") for v in rows])
        users = self._fetch_by_ids(
            "User", [v.get("user_id") for v in rows], USER_PROJECTION
        )
        statuses = self._fetch_by_ids(
            "Status", [v.get("status_id") for v in rows], STATUS_PROJECTION
        )
        projects = self._stitch_projects(rows)
        components = self._hydrate_components(list(versions))

        stitched = []
        for uuid in version_uuids:
            version = versions.get(uuid)
            if version is None:
                continue
            asset = assets.get(version.get("asset_id"))
            status = statuses.get(version.get("status_id"))
            stitched.append(
                _Stitched(
                    "AssetVersion",
                    {
                        "id": uuid,
                        "version": version.get("version"),
                        "comment": version.get("comment"),
                        "date": version.get("date"),
                        "is_published": version.get("is_published"),
                        "thumbnail_id": version.get("thumbnail_id"),
                        "asset": (
                            {
                                "id": asset["id"],
                                "name": asset.get("name"),
                                "parent": contexts.get(asset.get("context_id")),
                            }
                            if asset
                            else None
                        ),
                        "status": {"name": status.get("name")} if status else None,
                        "user": users.get(version.get("user_id")),
                        "task": tasks.get(version.get("task_id")),
                        "project": projects.get(version.get("project_id")),
                        "components": components.get(uuid, []),
                    },
                )
            )
        return stitched

    def _hydrate_components(self, version_uuids: list[str]) -> dict[str, list[Any]]:
        """Components per version — skipped entirely unless paths are configured."""
        if not _movie_component_names() and not _frame_component_names():
            return {}

        grouped: dict[str, list[Any]] = {}
        unique = [u for u in dict.fromkeys(version_uuids) if u]
        for start in range(0, len(unique), _QUERY_CHUNK):
            chunk = unique[start : start + _QUERY_CHUNK]
            quoted = ", ".join(_quote(uuid) for uuid in chunk)
            for component in self._session.query(
                f"select {COMPONENT_PROJECTION} from Component "
                f"where version_id in ({quoted})"
            ):
                grouped.setdefault(component["version_id"], []).append(component)
        return grouped

    def _ftrack_type(self, entity_type: str) -> str:
        """ftrack entity type for a DNA entity type."""
        if entity_type == "playlist":
            return self.playlist_adapter().entity_type
        ftrack_type = DNA_TO_FTRACK_TYPE.get(entity_type)
        if ftrack_type is None:
            raise ValueError(f"Unknown entity type: {entity_type}")
        return ftrack_type

    # ------------------------------------------------------------------
    # Conversions
    # ------------------------------------------------------------------

    def _project_ref(self, project: Any) -> Optional[dict[str, Any]]:
        if not project:
            return None
        return {
            "type": "Project",
            "id": self._to_id(project, "Project"),
            "name": project.get("full_name") or project.get("name"),
        }

    def _project_from(self, project: Any) -> Project:
        return Project(
            id=self._to_id(project, "Project"),
            name=project.get("full_name") or project.get("name"),
        )

    def _user_from(self, user: Any) -> User:
        return User(
            id=self._to_id(user, "User"),
            name=_full_name(user),
            email=user.get("email"),
            login=user.get("username"),
        )

    def _context_from(
        self, context: Any, tasks: Optional[list[Task]] = None
    ) -> EntityBase:
        """Shot or Asset, picked from the ftrack object type."""
        object_type = context.get("object_type")
        object_name = object_type.get("name") if object_type else None
        model = Shot if (object_name or context.entity_type) == "Shot" else Asset
        return model(
            id=self._to_id(context),
            name=context.get("name"),
            description=context.get("description"),
            project=self._project_ref(context.get("project")),
            tasks=tasks or [],
        )

    def _task_from(self, task: Any, entity: Optional[EntityBase] = None) -> Task:
        step = None
        task_type = task.get("type")
        if task_type:
            # ftrack's Task `type` is the closest analogue to a ShotGrid step.
            step = {
                "id": self._to_id(task_type, "Type"),
                "name": task_type.get("name"),
            }
        status = task.get("status")
        return Task(
            id=self._to_id(task, "Task"),
            name=task.get("name"),
            status=status.get("name") if status else None,
            pipeline_step=step,
            project=self._project_ref(task.get("project")),
            entity=entity,
        )

    def _note_from(self, note: Any, author: Optional[User] = None) -> Note:
        # The author is passed in rather than read off the note: NOTE_PROJECTION
        # fetches only author_id, and reading the link would auto-populate.
        metadata = self._note_metadata(note)
        return Note(
            id=self._to_id(note, "Note"),
            subject=metadata.get(NOTE_SUBJECT_KEY),
            content=note.get("content"),
            # ftrack notes belong to their parent, not to a project of their own.
            project=None,
            note_links=[],
            author=author,
        )

    def _note_metadata(self, note: Any) -> dict[str, Any]:
        """Note metadata, tolerating servers/schemas without the attribute."""
        try:
            return dict(note["metadata"].items())
        except Exception:
            return {}

    def _version_from(
        self,
        ftrack_version: Any,
        entity: Optional[EntityBase] = None,
        task: Optional[Task] = None,
        notes: Optional[list[Note]] = None,
        user: Optional[User] = None,
        paths: Optional[tuple[Optional[str], Optional[str]]] = None,
    ) -> Version:
        if paths is None:
            paths = self._component_paths([ftrack_version])[ftrack_version["id"]]
        movie_path, frame_path = paths
        project = ftrack_version.get("project")
        if project:
            self._version_project[ftrack_version["id"]] = project["id"]
        status = ftrack_version.get("status")
        version_id = self._to_id(ftrack_version, "AssetVersion")

        entity_detail_url = None
        if entity is not None:
            parent = ftrack_version["asset"]["parent"]
            entity_detail_url = (
                f"{self.server_url}/#entityId={parent['id']}&entityType=task"
            )

        return Version(
            id=version_id,
            name=_version_name(ftrack_version),
            description=ftrack_version.get("comment"),
            status=status.get("name") if status else None,
            user=user,
            created_at=ftrack_version.get("date"),
            # ftrack AssetVersion records creation only; there is no
            # server-side modification stamp to map onto updated_at.
            updated_at=None,
            movie_path=movie_path,
            frame_path=frame_path,
            thumbnail=self._thumbnail_url(ftrack_version, version_id),
            project=self._project_ref(ftrack_version.get("project")),
            entity=entity,
            task=task,
            notes=notes or [],
            prodtrack_detail_url=(
                f"{self.server_url}/#slideEntityId={ftrack_version['id']}"
                "&slideEntityType=assetversion"
            ),
            prodtrack_entity_detail_url=entity_detail_url,
        )

    def _thumbnail_url(self, ftrack_version: Any, version_id: int) -> Optional[str]:
        """Proxy URL for the version thumbnail.

        ftrack's own thumbnail URL embeds the API key as a query parameter, so
        it cannot be handed to a browser. The backend streams the image instead.
        """
        if not ftrack_version.get("thumbnail_id"):
            return None
        return f"{self._base_url}/api/ftrack-thumbnails/{version_id}"

    def _component_paths(
        self, ftrack_versions: list[Any]
    ) -> dict[str, tuple[Optional[str], Optional[str]]]:
        """Movie and frame paths for many versions, in as few round trips as possible.

        Off unless the component names are configured, because neither kind of
        component yields a path DNA can use by default:

        * The reviewable encodings (`ftrackreview-mp4`, `ftrackreview-webm`)
          live in the ftrack.server location, whose ServerAccessor has no
          `get_filesystem_path` at all — it raises, always.
        * `movie` and `main` live on studio disk locations, which do resolve,
          but to a mount a containerised DNA almost certainly cannot read. A
          path that looks authoritative and isn't is worse than none.

        Studios running DNA inside the network opt in through
        FTRACK_MOVIE_COMPONENTS / FTRACK_FRAME_COMPONENTS.

        Picks per version by walking the configured names rather than the
        version's components, so the preference decides: ftrack encodes both
        mp4 and webm for one version, and iterating components would take
        whichever the server happened to return first.
        """
        movie_names = _movie_component_names()
        frame_names = _frame_component_names()

        empty: tuple[Optional[str], Optional[str]] = (None, None)
        if not movie_names and not frame_names:
            return {version["id"]: empty for version in ftrack_versions}

        wanted: list[Any] = []
        picks: dict[str, dict[str, Any]] = {}
        for version in ftrack_versions:
            by_name: dict[str, Any] = {}
            for component in version.get("components") or []:
                by_name.setdefault(component["name"], component)

            chosen: dict[str, Any] = {}
            for kind, names in (("movie", movie_names), ("frame", frame_names)):
                for name in names:
                    component = by_name.get(name)
                    if component is not None:
                        chosen[kind] = component
                        wanted.append(component)
                        break
            picks[version["id"]] = chosen

        resolved = self._filesystem_paths(wanted)

        def path_for(chosen: dict[str, Any], kind: str) -> Optional[str]:
            component = chosen.get(kind)
            return resolved.get(component["id"]) if component else None

        return {
            version_id: (path_for(chosen, "movie"), path_for(chosen, "frame"))
            for version_id, chosen in picks.items()
        }

    def _filesystem_paths(self, components: list[Any]) -> dict[str, Optional[str]]:
        """Resolve a batch of components to paths, keyed by component id.

        One `pick_locations` call covers the whole batch (it is a single
        availability request), then one `get_filesystem_paths` per location
        that came back — rather than two round trips per version. A location
        that cannot produce paths at all, which is what ftrack.server does,
        loses only its own group.
        """
        if not components:
            return {}

        unique: dict[str, Any] = {}
        for component in components:
            unique.setdefault(component["id"], component)
        ordered = list(unique.values())

        try:
            locations = self._session.pick_locations(ordered)
        except Exception:
            logger.debug("Could not pick locations for components", exc_info=True)
            return {}

        grouped: dict[str, tuple[Any, list[Any]]] = {}
        for component, location in zip(ordered, locations):
            if location is None:
                continue
            grouped.setdefault(location["id"], (location, []))[1].append(component)

        paths: dict[str, Optional[str]] = {}
        for location, group in grouped.values():
            try:
                for component, path in zip(group, location.get_filesystem_paths(group)):
                    paths[component["id"]] = path
            except Exception:
                logger.debug(
                    "Location %s cannot resolve filesystem paths",
                    location["id"],
                    exc_info=True,
                )
        return paths

    def _playlist_from(
        self,
        playlist: Any,
        adapter: PlaylistAdapter,
        versions: Optional[list[Version]] = None,
    ) -> Playlist:
        return Playlist(
            id=self._to_id(playlist, adapter.entity_type),
            code=playlist.get("name"),
            description=adapter.description(playlist),
            project=self._project_ref(playlist.get("project")),
            created_at=adapter.created_at(playlist),
            updated_at=adapter.updated_at(playlist),
            versions=versions or [],
        )

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def get_entity(
        self, entity_type: str, entity_id: int, resolve_links: bool = True
    ) -> EntityBase:
        """Get an entity by its DNA id.

        Args:
            entity_type: The type of entity to fetch
            entity_id: The DNA id of the entity
            resolve_links: If True, fetch linked entities too. If False, only
                shallow links with id/name.
        """
        # Validate the type before the id, so an unsupported type reads as one
        # rather than as a missing entity.
        self._ftrack_type(entity_type)
        uuid = self._to_uuid(entity_type, entity_id)

        if entity_type == "project":
            return self._project_from(self._require(entity_type, entity_id, uuid))

        if entity_type == "user":
            return self._user_from(self._require(entity_type, entity_id, uuid))

        if entity_type in ("shot", "asset"):
            context = self._stitch_contexts([uuid]).get(uuid)
            if context is None:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            tasks: list[Task] = []
            if resolve_links:
                task_ids = [
                    task["id"]
                    for task in self._session.query(
                        f"select id from Task where parent_id is {_quote(uuid)}"
                    )
                ]
                stitched = self._stitch_tasks(task_ids)
                self._warm_ids(stitched.values())
                tasks = [self._task_from(task) for task in stitched.values()]
            return self._context_from(context, tasks)

        if entity_type == "task":
            task = self._stitch_tasks([uuid]).get(uuid)
            if task is None:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            entity = None
            if resolve_links:
                raw = self._fetch_by_ids("Task", [uuid], TASK_PROJECTION).get(uuid)
                parent_id = raw.get("parent_id") if raw else None
                if parent_id:
                    context = self._stitch_contexts([parent_id]).get(parent_id)
                    if context is not None:
                        entity = self._context_from(context)
            self._warm_ids([task])
            return self._task_from(task, entity)

        if entity_type == "version":
            hydrated = self._hydrate_versions([uuid])
            if not hydrated:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            ftrack_version = hydrated[0]
            self._warm_ids([ftrack_version])
            entity = None
            task = None
            user = None
            notes: list[Note] = []
            if resolve_links:
                parent = (ftrack_version.get("asset") or {}).get("parent")
                if parent:
                    entity = self._context_from(parent)
                if ftrack_version.get("task"):
                    task = self._task_from(ftrack_version["task"])
                if ftrack_version.get("user"):
                    user = self._user_from(ftrack_version["user"])
                notes = self._notes_for_parents([uuid]).get(uuid, [])
            return self._version_from(ftrack_version, entity, task, notes, user)

        if entity_type == "playlist":
            adapter = self.playlist_adapter()
            playlist = self._attach_projects(
                [self._require(entity_type, entity_id, uuid)], adapter.entity_type
            )[0]
            versions: list[Version] = []
            if resolve_links:
                # Membership only gives ids; reuse the path that hydrates them
                # in layers and attaches notes.
                versions = self.get_versions_for_playlist(entity_id)
            return self._playlist_from(playlist, adapter, versions)

        if entity_type == "note":
            note = self._require(entity_type, entity_id, uuid)
            author = None
            if resolve_links and note.get("author_id"):
                row = self._fetch_by_ids(
                    "User", [note["author_id"]], USER_PROJECTION
                ).get(note["author_id"])
                if row is not None:
                    self._warm_ids([row])
                    author = self._user_from(row)
            return self._note_from(note, author)

        raise ValueError(f"Unknown entity type: {entity_type}")

    def _require(self, entity_type: str, entity_id: int, uuid: str) -> Any:
        """Fetch one entity with its projection, or raise the DNA-shaped error."""
        ftrack_type = self._ftrack_type(entity_type)
        projection = {
            "project": PROJECT_PROJECTION,
            "user": USER_PROJECTION,
            "note": NOTE_PROJECTION,
        }.get(entity_type)
        if projection is None:
            projection = self.playlist_adapter().projection

        entity = self._session.query(
            f"select {projection} from {ftrack_type} where id is {_quote(uuid)}"
        ).first()
        if entity is None:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}")
        return entity

    def _notes_for_parents(self, parent_uuids: list[str]) -> dict[str, list[Note]]:
        """Notes attached to each of *parent_uuids*, keyed by parent uuid."""
        if not parent_uuids:
            return {}
        quoted = ", ".join(_quote(uuid) for uuid in parent_uuids)
        notes = list(
            self._session.query(
                f"select {NOTE_PROJECTION} from Note where parent_id in ({quoted})"
            )
        )
        if not notes:
            return {}

        authors = self._fetch_by_ids(
            "User", [n.get("author_id") for n in notes], USER_PROJECTION
        )
        self._warm_ids(authors.values())

        grouped: dict[str, list[Note]] = {}
        for note in notes:
            author = authors.get(note.get("author_id"))
            grouped.setdefault(note["parent_id"], []).append(
                self._note_from(note, self._user_from(author) if author else None)
            )
        return grouped

    def add_entity(self, entity_type: str, entity: EntityBase) -> EntityBase:
        """Add an entity to ftrack.

        Only notes are supported; ftrack contexts and versions are created by
        the pipeline, not by review tooling.
        """
        if entity_type != "note":
            raise NotImplementedError(
                f"FtrackProvider does not support creating '{entity_type}' entities."
            )

        note = cast(Note, entity)
        if not note.note_links:
            raise ValueError("A note needs a note_link to attach to in ftrack")

        # ftrack notes hang off exactly one parent; the rest of the DNA links
        # have nowhere to go.
        link = note.note_links[0]
        link_type = link.__class__.__name__.lower()
        parent_uuid = self._to_uuid(link_type, link.id)
        parent = self._session.get(self._ftrack_type(link_type), parent_uuid)
        if parent is None:
            raise ValueError(f"Entity not found: {link_type} {link.id}")

        created = self._create_note(
            parent=parent,
            content=note.content or "",
            subject=note.subject,
            author=self._session.query(
                f"select id from User where username is "
                f"{_quote(self._session.api_user)}"
            ).first(),
            recipients=[],
        )
        # The note was just created locally, so its author link is populated.
        author = created.get("author")
        return self._note_from(created, self._user_from(author) if author else None)

    def find(
        self, entity_type: str, filters: list[dict[str, Any]], limit: int = 0
    ) -> list[EntityBase]:
        """Find entities matching DNA-format filters.

        Args:
            entity_type: The DNA entity type to search for
            filters: Filter dicts with 'field', 'operator' and 'value' keys
            limit: Maximum number of entities to return. 0 means no limit.
        """
        ftrack_type = self._ftrack_type(entity_type)
        if entity_type not in self.FILTER_FIELDS:
            raise ValueError(f"Unsupported entity type: {entity_type}")

        # Ask only for ids, then hydrate in layers. Selecting the full shape
        # here would put the deep joins back into the filtered query, which is
        # the slowest place to have them.
        expression = f"select id from {ftrack_type}"
        clauses = [self._filter_clause(entity_type, f) for f in filters]
        if clauses:
            expression += " where " + " and ".join(clauses)

        results = self._session.query(expression)
        matched = [row["id"] for row in (results[:limit] if limit > 0 else results)]
        if not matched:
            return []

        entities = self._hydrate(entity_type, matched)
        self._warm_ids(entities)
        paths = self._component_paths(entities) if entity_type == "version" else {}

        return [
            self._convert(entity_type, entity, paths.get(entity["id"]))
            for entity in entities
        ]

    def _hydrate(self, entity_type: str, uuids: list[str]) -> list[Any]:
        """Fetch a batch of one DNA entity type, stitched and in order."""
        if entity_type == "version":
            return self._hydrate_versions(uuids)
        if entity_type in ("shot", "asset"):
            stitched = self._stitch_contexts(uuids)
            return [stitched[u] for u in uuids if u in stitched]
        if entity_type == "task":
            stitched = self._stitch_tasks(uuids)
            return [stitched[u] for u in uuids if u in stitched]

        projection = {
            "project": PROJECT_PROJECTION,
            "user": USER_PROJECTION,
            "note": NOTE_PROJECTION,
            "playlist": self.playlist_adapter().projection,
        }[entity_type]
        fetched = self._fetch_by_ids(self._ftrack_type(entity_type), uuids, projection)
        rows = [fetched[u] for u in uuids if u in fetched]

        # Playlists carry a project link the converter reads.
        if entity_type == "playlist":
            rows = self._attach_projects(rows, self.playlist_adapter().entity_type)
        return rows

    def _attach_projects(self, rows: list[Any], entity_type: str) -> list[_Stitched]:
        """Stitch each row's project onto it, in one extra query for the batch."""
        projects = self._stitch_projects(rows)
        return [
            _Stitched(
                entity_type,
                {**dict(row), "project": projects.get(row.get("project_id"))},
            )
            for row in rows
        ]

    def _convert(
        self,
        entity_type: str,
        entity: Any,
        paths: Optional[tuple[Optional[str], Optional[str]]] = None,
    ) -> EntityBase:
        if entity_type == "project":
            return self._project_from(entity)
        if entity_type == "user":
            return self._user_from(entity)
        if entity_type in ("shot", "asset"):
            return self._context_from(entity)
        if entity_type == "task":
            return self._task_from(entity)
        if entity_type == "version":
            return self._version_from(entity, paths=paths)
        if entity_type == "note":
            return self._note_from(entity)
        if entity_type == "playlist":
            return self._playlist_from(entity, self.playlist_adapter())
        raise ValueError(f"Unknown entity type: {entity_type}")

    # DNA field -> ftrack attribute path, per entity type.
    FILTER_FIELDS: dict[str, dict[str, str]] = {
        "project": {"id": "id", "name": "full_name"},
        "user": {
            "id": "id",
            "email": "email",
            "login": "username",
            "name": "username",
        },
        "shot": {
            "id": "id",
            "name": "name",
            "description": "description",
            "project": "project_id",
        },
        "asset": {
            "id": "id",
            "name": "name",
            "description": "description",
            "project": "project_id",
        },
        "task": {
            "id": "id",
            "name": "name",
            "status": "status.name",
            "project": "project_id",
            "entity": "parent_id",
        },
        "version": {
            "id": "id",
            "name": "asset.name",
            "description": "comment",
            "status": "status.name",
            "project": "project_id",
            # The only filter that still needs the server to join: a version
            # reaches its context through the asset in between.
            "entity": "asset.context_id",
            "task": "task_id",
        },
        "playlist": {
            "id": "id",
            "code": "name",
            "project": "project_id",
        },
        "note": {
            "id": "id",
            "content": "content",
            "author": "author_id",
        },
    }

    def _filter_clause(self, entity_type: str, filter_spec: dict[str, Any]) -> str:
        field = filter_spec.get("field")
        operator = filter_spec.get("operator", "is")
        value = filter_spec.get("value")

        attribute = self.FILTER_FIELDS.get(entity_type, {}).get(field or "")
        if attribute is None:
            raise ValueError(f"Unknown field '{field}' for entity type '{entity_type}'")

        is_id_field = (
            attribute == "id" or attribute.endswith("_id") or attribute.endswith(".id")
        )

        def resolve(raw: Any) -> Any:
            if isinstance(raw, dict) and "id" in raw:
                raw = raw["id"]
            if is_id_field and isinstance(raw, int):
                uuid = self._id_map.to_uuid(raw)
                if uuid is None:
                    raise ValueError(f"Unknown id for field '{field}': {raw}")
                return uuid
            return raw

        if operator == "is":
            return f"{attribute} is {_quote(resolve(value))}"
        if operator == "in":
            values = ", ".join(_quote(resolve(v)) for v in (value or []))
            # `in ()` is a syntax error in ftrack; make it match nothing.
            return f"{attribute} in ({values})" if values else "id is none"
        if operator == "contains":
            return f"{attribute} like {_quote(f'%{value}%')}"

        raise ValueError(f"Unsupported filter operator: {operator}")

    def search(
        self,
        query: str,
        entity_types: list[str],
        project_id: int | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search entities by name across several types.

        Args:
            query: Text to match against the name (empty prefetches up to limit)
            entity_types: DNA entity types to search
            project_id: Optional project to scope non-user entities to
            limit: Maximum results per entity type
        """
        term = (query or "").strip()
        project_uuid = (
            self._id_map.to_uuid(project_id) if project_id is not None else None
        )

        results: list[dict[str, Any]] = []
        for entity_type in entity_types:
            if entity_type == "user":
                results.extend(self._search_users(term, limit))
            elif entity_type in ("shot", "asset"):
                results.extend(
                    self._search_contexts(entity_type, term, project_uuid, limit)
                )
            elif entity_type == "version":
                results.extend(self._search_versions(term, project_uuid, limit))
            elif entity_type not in DNA_TO_FTRACK_TYPE and entity_type != "playlist":
                raise ValueError(f"Unsupported entity type: {entity_type}")
        return results

    def _search_users(self, term: str, limit: int) -> list[dict[str, Any]]:
        expression = f"select {USER_PROJECTION} from User where is_active is true"
        if term:
            pattern = _quote(f"%{term}%")
            expression += (
                f" and (first_name like {pattern} or last_name like {pattern}"
                f" or username like {pattern} or email like {pattern})"
            )
        users = list(self._session.query(expression)[:limit])
        self._warm_ids(users)
        return [
            {
                "type": "User",
                "id": self._to_id(user, "User"),
                "name": _full_name(user),
                "email": user.get("email"),
            }
            for user in users
        ]

    def _search_contexts(
        self,
        entity_type: str,
        term: str,
        project_uuid: Optional[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        ftrack_type = DNA_TO_FTRACK_TYPE[entity_type]
        clauses = []
        if term:
            clauses.append(f"name like {_quote(f'%{term}%')}")
        if project_uuid:
            clauses.append(f"project_id is {_quote(project_uuid)}")
        expression = f"select id from {ftrack_type}"
        if clauses:
            expression += " where " + " and ".join(clauses)

        dna_type = "Shot" if entity_type == "shot" else "Asset"
        matched = [row["id"] for row in self._session.query(expression)[:limit]]
        stitched = self._stitch_contexts(matched)
        contexts = [stitched[u] for u in matched if u in stitched]
        self._warm_ids(contexts)
        return [
            {
                "type": dna_type,
                "id": self._to_id(context),
                "name": context.get("name"),
                "description": context.get("description"),
                "project": self._project_ref(context.get("project")),
            }
            for context in contexts
        ]

    def _search_versions(
        self, term: str, project_uuid: Optional[str], limit: int
    ) -> list[dict[str, Any]]:
        clauses = []
        if term:
            clauses.append(f"asset.name like {_quote(f'%{term}%')}")
        if project_uuid:
            clauses.append(f"project_id is {_quote(project_uuid)}")
        expression = "select id from AssetVersion"
        if clauses:
            expression += " where " + " and ".join(clauses)

        matched = [row["id"] for row in self._session.query(expression)[:limit]]
        versions = self._hydrate_versions(matched)
        self._warm_ids(versions)
        return [
            {
                "type": "Version",
                "id": self._to_id(version, "AssetVersion"),
                "name": _version_name(version),
                "description": version.get("comment"),
                "project": self._project_ref(version.get("project")),
            }
            for version in versions
        ]

    def get_user_by_email(self, user_email: str) -> User:
        """Get a user by email address.

        Raises:
            ValueError: If the user is not found
        """
        user = self._session.query(
            f"select {USER_PROJECTION} from User where email is {_quote(user_email)}"
        ).first()
        if user is None:
            raise ValueError(f"User not found: {user_email}")
        return self._user_from(user)

    def get_projects_for_user(self, user_email: str) -> list[Project]:
        """Get the projects a user has access to.

        ftrack grants access through security roles rather than a per-project
        membership list, so this returns the active projects the API user can
        see, after confirming the user exists.
        """
        user = self._session.query(
            f"select id from User where email is {_quote(user_email)}"
        ).first()
        if user is None:
            raise ValueError(f"User not found: {user_email}")

        projects = list(
            self._session.query(
                f"select {PROJECT_PROJECTION} from Project where status is active"
            )
        )
        self._warm_ids(projects)
        return [self._project_from(project) for project in projects]

    # ------------------------------------------------------------------
    # Playlists
    # ------------------------------------------------------------------

    def get_playlists_for_project(self, project_id: int) -> list[Playlist]:
        """Get playlists for a project, in the configured playlist entity type."""
        adapter = self.playlist_adapter()
        project_uuid = self._to_uuid("project", project_id)
        playlists = self._attach_projects(
            adapter.list_for_project(self._session, project_uuid), adapter.entity_type
        )
        self._warm_ids(playlists)
        return [self._playlist_from(playlist, adapter) for playlist in playlists]

    def create_playlist(self, project_id: int, name: str) -> Playlist:
        """Create a playlist in the configured playlist entity type."""
        adapter = self.playlist_adapter()
        project_uuid = self._to_uuid("project", project_id)
        project = self._session.get("Project", project_uuid)
        if project is None:
            raise ValueError(f"Entity not found: project {project_id}")

        playlist = adapter.create(self._session, project, name)
        self._session.commit()
        return self._playlist_from(
            self._attach_projects([playlist], adapter.entity_type)[0], adapter
        )

    def get_versions_for_playlist(self, playlist_id: int) -> list[Version]:
        """Get the versions in a playlist, with their tasks, users and notes."""
        adapter = self.playlist_adapter()
        playlist_uuid = self._to_uuid("playlist", playlist_id)
        playlist = self._session.query(
            f"select {adapter.projection} from {adapter.entity_type} "
            f"where id is {_quote(playlist_uuid)}"
        ).first()
        if playlist is None:
            return []

        member_ids = adapter.version_ids(self._session, playlist)
        if not member_ids:
            return []

        # Membership gives ids; the layered fetch turns them into whole
        # versions without asking the server for a single join.
        ftrack_versions = self._hydrate_versions(member_ids)

        notes_by_parent = self._notes_for_parents([v["id"] for v in ftrack_versions])

        # One store round trip for every id the conversion below will ask for,
        # and one location request for every component path.
        self._warm_ids(ftrack_versions)
        paths_by_version = self._component_paths(ftrack_versions)

        versions: list[Version] = []
        for ftrack_version in ftrack_versions:
            parent = (ftrack_version.get("asset") or {}).get("parent")
            entity = self._context_from(parent) if parent else None
            task = (
                self._task_from(ftrack_version["task"])
                if ftrack_version.get("task")
                else None
            )
            user = (
                self._user_from(ftrack_version["user"])
                if ftrack_version.get("user")
                else None
            )
            versions.append(
                self._version_from(
                    ftrack_version,
                    entity,
                    task,
                    notes_by_parent.get(ftrack_version["id"], []),
                    user,
                    paths=paths_by_version.get(ftrack_version["id"]),
                )
            )
        return versions

    def add_version_to_playlist(self, playlist_id: int, version_id: int) -> bool:
        """Add an existing version to a playlist.

        Returns:
            True on success, including when the version was already present
        """
        adapter = self.playlist_adapter()
        playlist_uuid = self._to_uuid("playlist", playlist_id)
        version_uuid = self._to_uuid("version", version_id)

        playlist = self._session.get(adapter.entity_type, playlist_uuid)
        if playlist is None:
            raise ValueError(f"Playlist {playlist_id} not found")

        version = self._session.get("AssetVersion", version_uuid)
        if version is None:
            raise ValueError(f"Version {version_id} not found")

        hydrated = self._hydrate_versions([version_uuid])
        return adapter.add_version(
            self._session, playlist, version, hydrated[0] if hydrated else None
        )

    # ------------------------------------------------------------------
    # Statuses
    # ------------------------------------------------------------------

    def get_version_statuses(
        self, project_id: int | None = None
    ) -> list[dict[str, str]]:
        """Get valid status values for versions.

        ftrack statuses have no stable short code, so the name doubles as the
        code; update_version_status resolves it back by name.
        """
        statuses = self._version_statuses(project_id)
        return [{"code": status["name"], "name": status["name"]} for status in statuses]

    def _version_statuses(self, project_id: int | None) -> list[Any]:
        if project_id is None:
            return list(self._session.query("select id, name from Status"))

        project_uuid = self._to_uuid("project", project_id)
        return list(self._project_statuses(project_uuid).values())

    def _project_statuses(self, project_uuid: str) -> dict[str, Any]:
        """{status name: Status} for AssetVersion, cached per project.

        Publishing a round of notes calls update_version_status once per
        version, and each call would otherwise re-read the project schema and
        its statuses. Cached with a TTL rather than forever, because the
        provider is a process-lifetime singleton and a studio editing its
        schema should not have to wait for a redeploy.
        """
        ttl = _cache_ttl()
        now = time.monotonic()
        cached = self._status_cache.get(project_uuid)
        if cached is not None and ttl > 0 and (now - cached[0]) < ttl:
            return cached[1]

        project = self._session.query(
            "select id, project_schema_id from Project "
            f"where id is {_quote(project_uuid)}"
        ).first()
        if project is None:
            raise ValueError(f"Entity not found: project {project_uuid}")

        schema = self._session.get("ProjectSchema", project.get("project_schema_id"))
        if schema is None:
            raise ValueError(f"Project {project_uuid} has no project schema")

        statuses = {
            status["name"]: status for status in schema.get_statuses("AssetVersion")
        }
        self._status_cache[project_uuid] = (now, statuses)
        return statuses

    def _project_uuid_for_version(self, version_uuid: str) -> Optional[str]:
        """Project a version belongs to, remembered from any earlier read.

        A version never moves between projects, so this needs no expiry. Every
        playlist read fills it in, which is what makes a publish round skip the
        per-version lookup entirely.
        """
        cached = self._version_project.get(version_uuid)
        if cached is not None:
            return cached

        version = self._session.query(
            "select id, project_id from AssetVersion "
            f"where id is {_quote(version_uuid)}"
        ).first()
        if version is None:
            return None
        project_uuid = version.get("project_id")
        if project_uuid is None:
            return None
        self._version_project[version_uuid] = project_uuid
        return project_uuid

    def update_version_status(self, version_id: int, status: str) -> bool:
        """Set a version's status. Returns False rather than raising on failure."""
        try:
            version_uuid = self._to_uuid("version", version_id)
            project_uuid = self._project_uuid_for_version(version_uuid)
            if project_uuid is None:
                return False

            match = self._project_statuses(project_uuid).get(status)
            if match is None:
                logger.warning(
                    "Status %s is not valid for AssetVersion in this project schema",
                    status,
                )
                return False

            version = self._session.get("AssetVersion", version_uuid)
            if version is None:
                return False

            version["status"] = match
            self._session.commit()
            return True
        except Exception:
            logger.exception("Failed to update status on version %s", version_id)
            self._safe_rollback()
            return False

    # ------------------------------------------------------------------
    # Notes
    # ------------------------------------------------------------------

    def _resolve_author(self, author_email: Optional[str]) -> Any:
        """The ftrack user a note is written as; falls back to the API user."""
        if author_email:
            author = self._session.query(
                f"select id from User where email is {_quote(author_email)}"
            ).first()
            if author is None:
                raise UserNotFoundError(f"Author not found in ftrack: {author_email}")
            return author
        return self._session.query(
            f"select id from User where username is {_quote(self._session.api_user)}"
        ).first()

    def _resolve_recipients(self, user_ids: list[int]) -> list[Any]:
        if not user_ids:
            return []

        uuids = self._id_map.to_uuids(list(user_ids))
        for user_id in user_ids:
            if user_id not in uuids:
                logger.warning("Skipping unknown recipient id %s", user_id)
        if not uuids:
            return []

        quoted = ", ".join(_quote(uuid) for uuid in uuids.values())
        return list(self._session.query(f"select id from User where id in ({quoted})"))

    def _create_note(
        self,
        parent: Any,
        content: str,
        subject: Optional[str],
        author: Any,
        recipients: list[Any],
        metadata: Optional[dict[str, str]] = None,
    ) -> Any:
        note = parent.create_note(content, author, recipients=recipients or None)

        extra = dict(metadata or {})
        if subject:
            extra[NOTE_SUBJECT_KEY] = subject
        if extra:
            self._set_note_metadata(note, extra)

        self._session.commit()
        return note

    def _set_note_metadata(self, note: Any, values: dict[str, str]) -> None:
        """Write note metadata, tolerating schemas that do not expose it."""
        try:
            for key, value in values.items():
                note["metadata"][key] = value
        except Exception:
            logger.warning(
                "Could not write note metadata %s; the note itself was kept.",
                sorted(values),
                exc_info=True,
            )

    def _existing_note(
        self, parent_uuid: str, content: str, subject: Optional[str]
    ) -> Optional[Any]:
        """Find an identical note already on the parent, for idempotency."""
        notes = self._session.query(
            f"select {NOTE_PROJECTION} from Note "
            f"where parent_id is {_quote(parent_uuid)}"
        )
        for note in notes:
            if note["content"] != content:
                continue
            if subject and self._note_metadata(note).get(NOTE_SUBJECT_KEY) != subject:
                continue
            return note
        return None

    def publish_note(
        self,
        version_id: int,
        content: str,
        subject: str,
        to_users: list[int],
        cc_users: list[int],
        links: list[EntityBase],
        author_email: Optional[str] = None,
        version_status: Optional[str] = None,
    ) -> int:
        """Publish a note against a version.

        ftrack notes attach to exactly one parent and have no cc list, so
        `links` beyond the version are dropped and `cc_users` join `to_users`
        as recipients. `subject` is kept in the note's metadata.

        Returns:
            The DNA id of the created (or matching existing) note
        """
        version_uuid = self._to_uuid("version", version_id)
        version = self._session.get("AssetVersion", version_uuid)
        if version is None:
            raise ValueError(f"Version {version_id} not found")

        existing = self._existing_note(version_uuid, content, subject)
        if existing is not None:
            if version_status:
                self.update_version_status(version_id, version_status)
            return self._to_id(existing, "Note")

        author = self._resolve_author(author_email)
        recipients = self._resolve_recipients(list(to_users) + list(cc_users))
        note = self._create_note(version, content, subject, author, recipients)

        if version_status:
            self.update_version_status(version_id, version_status)

        return self._to_id(note, "Note")

    def publish_playlist_note(
        self,
        playlist_id: int,
        content: str,
        subject: str,
        to_users: list[int],
        cc_users: list[int],
        links: list[EntityBase],
        author_email: Optional[str] = None,
    ) -> int:
        """Publish a note against a playlist.

        Lists and Client Reviews do not accept notes on every ftrack server. On
        those, the note lands on the project instead with the playlist named in
        the first line, so the content is never lost.

        Returns:
            The DNA id of the created (or matching existing) note
        """
        adapter = self.playlist_adapter()
        playlist_uuid = self._to_uuid("playlist", playlist_id)
        playlist = self._session.query(
            f"select {adapter.projection} from {adapter.entity_type} "
            f"where id is {_quote(playlist_uuid)}"
        ).first()
        if playlist is None:
            raise ValueError(f"Playlist {playlist_id} not found")

        author = self._resolve_author(author_email)
        recipients = self._resolve_recipients(list(to_users) + list(cc_users))

        if self._accepts_notes(adapter.entity_type):
            parent: Any = playlist
            body = content
        else:
            project = playlist.get("project")
            if project is None:
                raise ValueError(f"Playlist {playlist_id} has no project assigned")
            parent = self._session.get("Project", project["id"])
            body = f"[{playlist.get('name')}]\n{content}"

        existing = self._existing_note(parent["id"], body, subject)
        if existing is not None:
            return self._to_id(existing, "Note")

        note = self._create_note(parent, body, subject, author, recipients)
        return self._to_id(note, "Note")

    def _accepts_notes(self, ftrack_type: str) -> bool:
        """Whether *ftrack_type* has a notes relation on this server's schema."""
        try:
            return "notes" in self._session.types[ftrack_type].attributes.keys()
        except Exception:
            return False

    def attach_file_to_note(
        self, note_id: int, file_path: str, display_name: str
    ) -> bool:
        """Upload a local file as an attachment on an existing note."""
        try:
            note_uuid = self._to_uuid("note", note_id)
            note = self._session.get("Note", note_uuid)
            if note is None:
                return False

            component = self._session.create_component(
                file_path, data={"name": display_name}, location="auto"
            )
            self._session.create(
                "NoteComponent", {"component_id": component["id"], "note_id": note_uuid}
            )
            self._session.commit()
            return True
        except Exception:
            logger.exception("Failed to attach %s to note %s", file_path, note_id)
            self._safe_rollback()
            return False

    # ------------------------------------------------------------------
    # Transcripts
    # ------------------------------------------------------------------

    def transcript_entity_type(self) -> str:
        """Entity type publish_transcript writes into.

        ftrack has no equivalent of ShotGrid's spare custom-entity slots, so a
        transcript is a note on the version it was captured against.
        """
        return "Note"

    def publish_transcript(
        self,
        *,
        project_id: int,
        playlist_id: int,
        version_id: int,
        meeting_id: str,
        meeting_date: date,
        platform: str,
        body: str,
    ) -> int:
        """Create the transcript note. Returns its DNA id."""
        version_uuid = self._to_uuid("version", version_id)
        version = self._session.get("AssetVersion", version_uuid)
        if version is None:
            raise ValueError(f"Version {version_id} not found")

        subject = f"Transcript {meeting_date.isoformat()}"
        note = self._create_note(
            parent=version,
            content=body,
            subject=subject,
            author=self._resolve_author(None),
            recipients=[],
            metadata={
                TRANSCRIPT_METADATA_KEYS["kind"]: TRANSCRIPT_KIND,
                TRANSCRIPT_METADATA_KEYS["meeting_id"]: meeting_id,
                TRANSCRIPT_METADATA_KEYS["meeting_date"]: meeting_date.isoformat(),
                TRANSCRIPT_METADATA_KEYS["platform"]: platform,
                TRANSCRIPT_METADATA_KEYS["playlist_id"]: str(playlist_id),
            },
        )
        return self._to_id(note, "Note")

    def update_transcript(
        self,
        *,
        entity_type: str,
        entity_id: int,
        body: str,
        meeting_date: date,
    ) -> bool:
        """Patch body and meeting date on an existing transcript note.

        `entity_type` comes from the caller's bookkeeping rather than from the
        current setting, so a row still updates after a deployment changes how
        transcripts are stored.
        """
        try:
            uuid = self._id_map.to_uuid(entity_id)
            if uuid is None:
                return False
            entity = self._session.get(entity_type, uuid)
            if entity is None:
                return False

            entity["content"] = body
            self._set_note_metadata(
                entity,
                {
                    TRANSCRIPT_METADATA_KEYS["meeting_date"]: meeting_date.isoformat(),
                },
            )
            self._session.commit()
            return True
        except Exception:
            logger.exception("Failed to update transcript %s", entity_id)
            self._safe_rollback()
            return False

    # ------------------------------------------------------------------
    # Thumbnails
    # ------------------------------------------------------------------

    def get_thumbnail(self, version_id: int) -> Optional[tuple[bytes, str]]:
        """Fetch a version's thumbnail as (bytes, content type).

        Used by the thumbnail proxy endpoint: ftrack's own thumbnail URL carries
        the API key in the query string and must not reach a browser.
        """
        import requests

        version_uuid = self._to_uuid("version", version_id)
        version = self._session.query(
            "select thumbnail_id from AssetVersion "
            f"where id is {_quote(version_uuid)}"
        ).first()
        if version is None or not version.get("thumbnail_id"):
            return None

        try:
            location = self._session.query(
                "select id from Location where name is " f"{_quote('ftrack.server')}"
            ).first()
            if location is None:
                return None

            url = location.accessor.get_thumbnail_url(version["thumbnail_id"], size=300)
            response = requests.get(url, timeout=30)
            if response.status_code != 200:
                return None
            return response.content, response.headers.get("Content-Type", "image/jpeg")
        except Exception:
            logger.exception("Failed to fetch the thumbnail for version %s", version_id)
            return None


def _component_names(variable: str) -> list[str]:
    """Component names to resolve paths from, most preferred first.

    Empty by default: see :meth:`FtrackProvider._component_path` for why no
    name is a safe default. A studio with the storage mounted can set, say,
    `FTRACK_MOVIE_COMPONENTS=movie,main`, or name the reviewable encodings
    (`ftrackreview-mp4,ftrackreview-webm`) if it has a location plugin that
    gives those a filesystem path.
    """
    configured = os.getenv(variable, "")
    return [name.strip() for name in configured.split(",") if name.strip()]


def _movie_component_names() -> list[str]:
    """Component names treated as the reviewable movie, most preferred first."""
    return _component_names("FTRACK_MOVIE_COMPONENTS")


def _frame_component_names() -> list[str]:
    """Component names treated as the frame sequence, most preferred first."""
    return _component_names("FTRACK_FRAME_COMPONENTS")
