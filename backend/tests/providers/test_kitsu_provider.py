# SPDX-License-Identifier: Apache-2.0
# Copyright Contributors to the Dailies Notes Assistant Project.
"""
Tests for the Kitsu provider, through gazu with a fake HTTP session.
"""

import json
from datetime import date
from os.path import basename
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import pytest

from dna.models.entity import Asset, Note, Playlist, Shot, Task, Version
from dna.prodtrack_providers.kitsu import KitsuProvider
from dna.prodtrack_providers.prodtrack_provider_base import (
    UserNotFoundError,
    get_prodtrack_provider,
)

PROJECT = "00000000-0000-0000-0000-000000000001"
SHOT = "00000000-0000-0000-0000-000000000002"
ASSET = "00000000-0000-0000-0000-000000000003"
TASK = "00000000-0000-0000-0000-000000000004"
PREVIEW = "00000000-0000-0000-0000-000000000005"
OTHER_PREVIEW = "00000000-0000-0000-0000-000000000006"
COMMENT = "00000000-0000-0000-0000-000000000007"
PLAYLIST = "00000000-0000-0000-0000-000000000008"
PERSON = "00000000-0000-0000-0000-000000000009"
ADMIN = "00000000-0000-0000-0000-00000000000a"
MISSING = "00000000-0000-0000-0000-00000000000f"
TYPE = "00000000-0000-0000-0000-00000000000b"
SEQUENCE = "00000000-0000-0000-0000-00000000000e"
WFA = "00000000-0000-0000-0000-00000000000c"
RETAKE = "00000000-0000-0000-0000-00000000000d"

SAM = {
    "id": PERSON,
    "full_name": "Sam Reviewer",
    "email": "sam@studio.example",
    "desktop_login": "sam",
    "role": "supervisor",
    "active": True,
    "is_bot": False,
    "data": {"desk": "A3"},
}
STATUSES = [
    {"id": WFA, "short_name": "wfa", "name": "Waiting For Approval"},
    {"id": RETAKE, "short_name": "retake", "name": "Retake"},
    {"id": MISSING, "short_name": "old", "name": "Old", "archived": True},
]
FULL_TASK = {
    "id": TASK,
    "project_id": PROJECT,
    "project": {"name": "Demo"},
    "task_type_id": TYPE,
    "task_type": {"name": "Compositing"},
    "task_status_id": WFA,
    "task_status": {"short_name": "wfa"},
    "entity_id": SHOT,
    "entity": {"id": SHOT, "name": "SH010", "description": "Walk"},
    "entity_type": {"name": "Shot"},
    "sequence": {"name": "SQ01"},
    "data": {"bid": 3},
}
PREVIEW_ROW = {
    "id": PREVIEW,
    "task_id": TASK,
    "revision": 3,
    "description": "New key",
    "status": "ready",
    "is_movie": True,
    "person_id": PERSON,
    "created_at": "2026-10-14T16:40:12",
    "updated_at": "2026-10-14T16:41:03",
    "data": {"take": 2},
}
COMMENT_ROW = {
    "id": COMMENT,
    "object_id": TASK,
    "text": "Soften the matte",
    "data": {"subject": "Comp notes"},
    "preview_file_id": PREVIEW,
    "person_id": PERSON,
}
SHOT_ROW = {
    "id": SHOT,
    "name": "SH010",
    "sequence_name": "SQ01",
    "project_id": PROJECT,
    "description": "Walk",
    "data": {"cut_in": 1001},
}
PROJECT_SHOT_ROW = {
    "id": SHOT,
    "name": "SH010",
    "parent_id": SEQUENCE,
    "project_id": PROJECT,
    "description": "Walk",
    "data": {"cut_in": 1001},
}
ASSET_ROW = {"id": ASSET, "name": "Hero", "project_id": PROJECT, "description": "Lead"}
PLAYLIST_ROW = {
    "id": PLAYLIST,
    "name": "Dailies",
    "project_id": PROJECT,
    "created_at": "2026-10-14T15:02:41",
    "shots": [
        {"entity_id": SHOT, "preview_file_id": PREVIEW},
        {"entity_id": SHOT, "preview_file_id": MISSING},
        {"entity_id": ASSET},
    ],
}


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body
        self.text = json.dumps(body)
        self.headers = {}

    def json(self):
        return self.body


class FakeSession:
    """
    Answers gazu's requests from canned routes and records the writes.
    """

    def __init__(self):
        self.routes = {
            f"data/projects/{PROJECT}": {"id": PROJECT, "name": "Demo"},
            "data/projects/open": [{"id": PROJECT, "name": "Demo", "team": [PERSON]}],
            "data/persons": [
                SAM,
                {"id": ADMIN, "full_name": "Bot", "email": "b@x", "is_bot": True},
            ],
            "data/playlists": [],
            "data/task-status": STATUSES,
            f"data/projects/{PROJECT}/settings/task-status": [STATUSES[0]],
            "data/task-types": [{"id": TYPE, "name": "Compositing"}],
            f"data/projects/{PROJECT}/sequences": [{"id": SEQUENCE, "name": "SQ01"}],
            f"data/projects/{PROJECT}/shots": [PROJECT_SHOT_ROW],
            f"data/projects/{PROJECT}/assets": [ASSET_ROW],
            f"data/shots/{SHOT}": SHOT_ROW,
            f"data/shots/{SHOT}/tasks": [
                {
                    "id": TASK,
                    "task_type_id": TYPE,
                    "task_type_name": "Compositing",
                    "task_status_id": WFA,
                    "project_id": PROJECT,
                }
            ],
            f"data/assets/{ASSET}": ASSET_ROW,
            f"data/tasks/{TASK}/full": FULL_TASK,
            f"data/tasks/{TASK}/comments": [COMMENT_ROW],
            f"data/projects/{PROJECT}/tasks": [
                {
                    "id": TASK,
                    "task_type_id": TYPE,
                    "task_status_id": WFA,
                    "entity_id": SHOT,
                }
            ],
            f"data/projects/{PROJECT}/preview-files": [
                PREVIEW_ROW,
                {**PREVIEW_ROW, "id": OTHER_PREVIEW, "task_id": MISSING},
            ],
            f"data/projects/{PROJECT}/comments": [COMMENT_ROW],
            f"data/projects/{PROJECT}/playlists": [PLAYLIST_ROW],
            f"data/projects/{PROJECT}/metadata-descriptors": [
                {
                    "entity_type": "Shot",
                    "field_name": "difficulty",
                    "name": "Difficulty",
                    "data_type": "list",
                    "choices": ["easy", "hard"],
                },
                {"entity_type": "Asset", "field_name": "rig", "data_type": "string"},
            ],
            f"data/preview-files/{PREVIEW}": PREVIEW_ROW,
            f"data/comments/{COMMENT}": COMMENT_ROW,
            f"data/playlists/{PLAYLIST}": PLAYLIST_ROW,
        }
        self.writes = []

    def _write(self, method, url, data=None, **_):
        path = urlsplit(url).path.removeprefix("/api/")
        payload = json.loads(data)
        self.writes.append((method, path, payload))
        if "comment" in path:
            return FakeResponse(200, {"id": COMMENT})
        return FakeResponse(
            200, {"id": PLAYLIST, "name": "New", "project_id": PROJECT, **payload}
        )

    def get(self, url, **_):
        parts = urlsplit(url)
        path = parts.path.removeprefix("/api/")
        if path not in self.routes:
            return FakeResponse(404, {"message": "Not found"})
        body = self.routes[path]
        query = parse_qs(parts.query)
        if "page" in query and query["page"] != ["1"]:
            body = []
        for field in ("email", "short_name", "id"):
            if field in query:
                body = [row for row in body if row[field] == query[field][0]]
        return FakeResponse(200, body)

    def post(self, url, **kwargs):
        return self._write("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self._write("PUT", url, **kwargs)


@pytest.fixture
def session():
    return FakeSession()


@pytest.fixture
def provider(session):
    kitsu = KitsuProvider("https://kitsu.test/api/", "token")
    kitsu.client.session = session
    return kitsu


def comment_posts(session):
    return [w for w in session.writes if w[1].endswith("/comment")]


class TestSetup:
    def test_requires_credentials(self, monkeypatch):
        monkeypatch.delenv("KITSU_URL", raising=False)
        monkeypatch.delenv("KITSU_API_TOKEN", raising=False)
        with pytest.raises(ValueError, match="Kitsu credentials"):
            KitsuProvider()

    def test_factory_builds_it_from_env(self, monkeypatch):
        monkeypatch.setenv("PRODTRACK_PROVIDER", "kitsu")
        monkeypatch.setenv("KITSU_URL", "https://kitsu.test")
        monkeypatch.setenv("KITSU_API_TOKEN", "token")
        kitsu = get_prodtrack_provider()
        assert isinstance(kitsu, KitsuProvider)
        assert kitsu.client.host == "https://kitsu.test/api"
        assert kitsu.url == "https://kitsu.test"


class TestGetEntity:
    def test_version(self, provider):
        version = provider.get_entity("version", PREVIEW)
        assert version.name == "SQ01_SH010_Compositing_v003"
        assert version.status == "wfa"
        assert version.user["name"] == "Sam Reviewer"
        assert version.created_at == "2026-10-14T16:40:12+00:00"
        assert isinstance(version.entity, Shot)
        assert version.entity.name == "SQ01_SH010"
        assert version.task.pipeline_step["name"] == "Compositing"
        assert version.project["id"] == PROJECT
        assert version.thumbnail.endswith(
            f"/api/pictures/thumbnails/preview-files/{PREVIEW}.png"
        )
        assert version.movie_path.endswith(
            f"/api/movies/originals/preview-files/{PREVIEW}.mp4"
        )
        assert version.prodtrack_detail_url == (
            f"https://kitsu.test/productions/{PROJECT}/shots/tasks/{TASK}"
        )
        assert version.prodtrack_entity_detail_url == (
            f"https://kitsu.test/productions/{PROJECT}/shots/{SHOT}"
        )
        assert [note.content for note in version.notes] == ["Soften the matte"]

    def test_version_additional_fields_and_shallow(self, provider):
        version = provider.get_entity(
            "version", PREVIEW, resolve_links=False, additional_fields=["take", "nope"]
        )
        assert version.additional_fields == {"take": 2, "nope": None}
        assert version.notes == []

    @pytest.mark.parametrize(
        "kind, model", [("Character", Asset), ("Edit", type(None))]
    )
    def test_version_entity_kinds(self, provider, session, kind, model):
        session.routes[f"data/tasks/{TASK}/full"] = {
            **FULL_TASK,
            "entity_type": {"name": kind},
        }
        version = provider.get_entity("version", PREVIEW, resolve_links=False)
        assert isinstance(version.entity, model)
        if model is type(None):
            assert version.name == "Compositing_v003"
            assert version.prodtrack_detail_url is None

    def test_version_not_ready_has_no_thumbnail(self, provider, session):
        session.routes[f"data/preview-files/{PREVIEW}"] = {
            **PREVIEW_ROW,
            "status": "processing",
            "is_movie": False,
            "person_id": None,
        }
        version = provider.get_entity("version", PREVIEW, resolve_links=False)
        assert version.thumbnail is None
        assert version.movie_path is None
        assert version.user is None

    def test_other_types(self, provider):
        assert provider.get_entity("project", PROJECT).name == "Demo"
        assert provider.get_entity("user", PERSON).login == "sam"
        assert provider.get_entity("asset", ASSET, resolve_links=False).name == "Hero"
        shot = provider.get_entity("shot", SHOT, additional_fields=["cut_in"])
        assert shot.name == "SQ01_SH010"
        assert shot.additional_fields == {"cut_in": 1001}
        assert [(t.name, t.status) for t in shot.tasks] == [("Compositing", "wfa")]
        task = provider.get_entity("task", TASK, additional_fields=["bid"])
        assert (task.name, task.status, task.additional_fields) == (
            "Compositing",
            "wfa",
            {"bid": 3},
        )

    def test_note(self, provider):
        note = provider.get_entity("note", COMMENT)
        assert note.subject == "Comp notes"
        assert note.author.email == "sam@studio.example"
        assert isinstance(note.note_links[0], Version)
        assert note.note_links[0].id == PREVIEW
        assert note.project["id"] == PROJECT

    def test_playlist(self, provider):
        full = provider.get_entity("playlist", PLAYLIST)
        assert full.code == "Dailies"
        assert [version.id for version in full.versions] == [PREVIEW]
        shallow = provider.get_entity("playlist", PLAYLIST, resolve_links=False)
        assert [version.id for version in shallow.versions] == [PREVIEW, MISSING]

    @pytest.mark.parametrize(
        "entity_type, entity_id, message",
        [
            ("version", MISSING, "Entity not found"),
            ("task", MISSING, "Entity not found"),
            ("nope", PREVIEW, "Unknown entity type"),
            # These IDs would otherwise rewrite the API path the bot token calls.
            ("version", "../persons", "Invalid Kitsu entity ID"),
            ("task", f"{TASK}/../../persons", "Invalid Kitsu entity ID"),
        ],
    )
    def test_invalid(self, provider, session, entity_type, entity_id, message):
        with pytest.raises(ValueError, match=message):
            provider.get_entity(entity_type, entity_id)


class TestSchemaAndUpdate:
    def test_schema_is_scoped_to_the_entity_type(self, provider):
        fields = provider.get_schema("shot", PROJECT)
        assert [field.code for field in fields] == ["difficulty"]
        assert [o.value for o in fields[0].acceptable_values] == ["easy", "hard"]
        assert [f.code for f in provider.get_schema("asset")] == ["rig"]
        assert provider.get_schema("asset")[0].acceptable_values is None

    def test_schema_with_dna_fields(self, provider):
        fields = {
            field.code: field
            for field in provider.get_schema(
                "version", PROJECT, include_dna_fields=True
            )
        }
        assert fields["status"].editable
        assert fields["status"].data_type == "status_list"
        assert [o.value for o in fields["status"].acceptable_values] == ["wfa"]
        assert fields["description"].editable
        assert not fields["name"].editable
        assert fields["entity"].data_type == "entity"
        assert "id" not in fields

    def test_schema_unknown_type(self, provider):
        with pytest.raises(ValueError):
            provider.get_schema("nope")

    def test_update_shot_merges_metadata(self, provider, session):
        result = provider.update_entity(
            "shot", SHOT, {"description": "Run"}, {"difficulty": "hard"}
        )
        assert session.writes == [
            (
                "PUT",
                f"data/entities/{SHOT}",
                {
                    "id": SHOT,
                    "description": "Run",
                    "data": {"cut_in": 1001, "difficulty": "hard"},
                },
            )
        ]
        assert isinstance(result, Shot)

    def test_update_version_status_comments_on_the_task(self, provider, session):
        provider.update_entity("version", PREVIEW, {"status": "retake"}, {})
        posted = comment_posts(session)
        assert posted[0][1] == f"actions/tasks/{TASK}/comment"
        assert posted[0][2]["task_status_id"] == RETAKE
        assert posted[0][2]["comment"] == ""

    def test_update_task_status_to_current_is_a_no_op(self, provider, session):
        provider.update_entity("task", TASK, {"status": "wfa"}, {})
        assert session.writes == []

    def test_update_note_subject_keeps_other_data(self, provider, session):
        provider.update_entity("note", COMMENT, {"subject": "New"}, {"k": 1})
        assert session.writes[0][2] == {
            "id": COMMENT,
            "data": {"subject": "New", "k": 1},
        }

    @pytest.mark.parametrize(
        "entity_type, entity_id, fields, extra",
        [
            ("nope", SHOT, {}, {}),
            ("shot", SHOT, {"name": "x"}, {}),
            ("shot", SHOT, {"tasks": []}, {}),
            ("shot", SHOT, {"status": "wfa"}, {}),
            ("playlist", PLAYLIST, {}, {"x": 1}),
            ("shot", "../persons", {}, {}),
        ],
    )
    def test_update_rejects(
        self, provider, session, entity_type, entity_id, fields, extra
    ):
        with pytest.raises(ValueError):
            provider.update_entity(entity_type, entity_id, fields, extra)
        assert session.writes == []


class TestFindAndSearch:
    @pytest.mark.parametrize(
        "entity_type, filters, expected",
        [
            (
                "shot",
                [{"field": "name", "operator": "contains", "value": "sh01"}],
                [SHOT],
            ),
            ("shot", [{"field": "name", "operator": "is", "value": "SH010"}], []),
            ("shot", [{"field": "name", "operator": "is_not", "value": "x"}], [SHOT]),
            ("shot", [{"field": "id", "operator": "in", "value": [SHOT]}], [SHOT]),
            ("shot", [{"field": "id", "operator": "not_in", "value": [SHOT]}], []),
            (
                "shot",
                [
                    {
                        "field": "project",
                        "operator": "is",
                        "value": {"type": "Project", "id": PROJECT},
                    }
                ],
                [SHOT],
            ),
            ("asset", [], [ASSET]),
            ("task", [{"field": "status", "operator": "is", "value": "wfa"}], [TASK]),
            ("version", [{"field": "status", "value": "wfa"}], [PREVIEW]),
            (
                "note",
                [{"field": "content", "operator": "contains", "value": "matte"}],
                [COMMENT],
            ),
            (
                "note",
                [{"field": "note_links", "operator": "is", "value": {"id": TASK}}],
                [COMMENT],
            ),
            (
                "note",
                [{"field": "note_links", "operator": "contains", "value": TASK}],
                [COMMENT],
            ),
            (
                "playlist",
                [{"field": "code", "operator": "is", "value": "Dailies"}],
                [PLAYLIST],
            ),
            ("user", [], [PERSON]),
            (
                "project",
                [{"field": "name", "operator": "is", "value": "Demo"}],
                [PROJECT],
            ),
        ],
    )
    def test_find(self, provider, entity_type, filters, expected):
        assert [e.id for e in provider.find(entity_type, filters)] == expected

    def test_find_limit(self, provider, session):
        session.routes[f"data/projects/{PROJECT}/shots"] = [
            PROJECT_SHOT_ROW,
            {**PROJECT_SHOT_ROW, "id": ASSET},
        ]
        assert len(provider.find("shot", [], limit=1)) == 1

    @pytest.mark.parametrize(
        "entity_type, filters",
        [
            ("nope", []),
            ("shot", [{"field": "nope", "operator": "is", "value": 1}]),
            ("shot", [{"field": "name", "operator": "regex", "value": 1}]),
            ("shot", [{"field": "project", "operator": "is", "value": "../x"}]),
        ],
    )
    def test_find_rejects(self, provider, entity_type, filters):
        with pytest.raises(ValueError):
            provider.find(entity_type, filters)

    def test_search(self, provider):
        results = provider.search(
            "sh010", ["shot", "version", "task", "note"], PROJECT, limit=5
        )
        assert [(r["type"], r["name"]) for r in results] == [
            ("Shot", "SQ01_SH010"),
            ("Version", "SQ01_SH010_Compositing_v003"),
            ("Task", "SQ01_SH010_Compositing"),
        ]
        assert results[0]["description"] == "Walk"
        assert results[0]["project"] == {"type": "Project", "id": PROJECT}

    def test_search_users_by_email_without_bots(self, provider):
        results = provider.search("studio.example", ["user"])
        assert results == [
            {
                "type": "User",
                "id": PERSON,
                "name": "Sam Reviewer",
                "email": "sam@studio.example",
            }
        ]
        assert provider.search("bot", ["user"]) == []

    def test_search_empty_query_respects_limit(self, provider, session):
        session.routes[f"data/projects/{PROJECT}/shots"] = [
            PROJECT_SHOT_ROW,
            {**PROJECT_SHOT_ROW, "id": ASSET},
        ]
        assert len(provider.search("", ["shot"], PROJECT, limit=1)) == 1
        assert provider.search("dail", ["playlist"], PROJECT)[0]["name"] == "Dailies"

    def test_search_unknown_type(self, provider):
        with pytest.raises(ValueError):
            provider.search("x", ["nope"])


class TestUsersAndPlaylists:
    def test_user_by_email(self, provider):
        assert provider.get_user_by_email("sam@studio.example").id == PERSON
        with pytest.raises(ValueError):
            provider.get_user_by_email("no@studio.example")

    def test_projects_for_user(self, provider, session):
        session.routes["data/projects/open"] = [
            {"id": PROJECT, "name": "Mine", "team": [PERSON]},
            {"id": MISSING, "name": "Other", "team": []},
        ]
        assert [
            p.name for p in provider.get_projects_for_user("sam@studio.example")
        ] == ["Mine"]
        session.routes["data/persons"] = [{**SAM, "role": "admin"}]
        assert len(provider.get_projects_for_user("sam@studio.example")) == 2
        with pytest.raises(ValueError):
            provider.get_projects_for_user("no@studio.example")

    def test_playlists(self, provider, session):
        assert [p.code for p in provider.get_playlists_for_project(PROJECT)] == [
            "Dailies"
        ]
        created = provider.create_playlist(PROJECT, "New")
        assert isinstance(created, Playlist)
        assert session.writes[0][0] == "POST"
        assert session.writes[0][1] == "data/playlists"

    def test_versions_for_playlist_skips_deleted_previews(self, provider):
        versions = provider.get_versions_for_playlist(PLAYLIST)
        assert [version.id for version in versions] == [PREVIEW]
        assert versions[0].notes[0].author.email == "sam@studio.example"

    def test_versions_only_get_their_own_notes(self, provider, session):
        session.routes[f"data/tasks/{TASK}/comments"] = [
            {**COMMENT_ROW, "preview_file_id": OTHER_PREVIEW},
            {**COMMENT_ROW, "preview_file_id": None},
        ]
        assert provider.get_versions_for_playlist(PLAYLIST)[0].notes == []

    def test_versions_for_missing_playlist(self, provider):
        assert provider.get_versions_for_playlist(MISSING) == []

    def test_add_version_to_playlist(self, provider, session):
        session.routes[f"data/preview-files/{OTHER_PREVIEW}"] = {
            **PREVIEW_ROW,
            "id": OTHER_PREVIEW,
        }
        assert provider.add_version_to_playlist(PLAYLIST, OTHER_PREVIEW)
        assert session.writes == [
            (
                "POST",
                f"actions/playlists/{PLAYLIST}/add-entity",
                {"entity_id": SHOT, "preview_file_id": OTHER_PREVIEW},
            )
        ]

    def test_add_version_already_in_playlist(self, provider, session):
        assert provider.add_version_to_playlist(PLAYLIST, PREVIEW)
        assert session.writes == []

    def test_add_version_to_missing_playlist(self, provider):
        with pytest.raises(ValueError):
            provider.add_version_to_playlist(MISSING, PREVIEW)


class TestStatuses:
    def test_statuses_for_project_then_fallback(self, provider, session):
        assert provider.get_version_statuses(PROJECT) == [
            {"code": "wfa", "name": "Waiting For Approval"}
        ]
        session.routes[f"data/projects/{PROJECT}/settings/task-status"] = []
        assert [s["code"] for s in provider.get_version_statuses(PROJECT)] == [
            "retake",
            "wfa",
        ]

    def test_update_version_status(self, provider, session):
        assert provider.update_version_status(PREVIEW, "retake")
        assert comment_posts(session)[0][2]["task_status_id"] == RETAKE

    def test_update_version_status_failure_returns_false(self, provider, session):
        assert not provider.update_version_status(PREVIEW, "nope")
        assert not provider.update_version_status(MISSING, "retake")
        assert session.writes == []


class TestNotes:
    def publish(self, provider, **overrides):
        kwargs = {
            "version_id": PREVIEW,
            "content": "New note",
            "subject": "Subject",
            "to_users": [],
            "cc_users": [],
            "links": [Shot(id=SHOT)],
            "author_email": "sam@studio.example",
        }
        return provider.publish_note(**{**kwargs, **overrides})

    def test_publish_note_as_author_with_status(self, provider, session):
        assert self.publish(provider, version_status="retake") == COMMENT
        post, put = session.writes
        assert post[1] == f"actions/tasks/{TASK}/comment"
        assert post[2]["comment"] == "New note"
        assert post[2]["person_id"] == PERSON
        assert post[2]["task_status_id"] == RETAKE
        assert put[1] == f"data/comments/{COMMENT}"
        assert put[2] == {
            "id": COMMENT,
            "preview_file_id": PREVIEW,
            "data": {"subject": "Subject"},
        }

    def test_publish_note_keeps_status_by_default(self, provider, session):
        self.publish(provider, author_email=None)
        assert session.writes[0][2]["task_status_id"] == WFA
        assert "person_id" not in session.writes[0][2]

    def test_publish_note_unknown_author_writes_nothing(self, provider, session):
        with pytest.raises(UserNotFoundError):
            self.publish(provider, author_email="no@studio.example")
        assert session.writes == []

    def test_publish_note_unknown_status_writes_nothing(self, provider, session):
        with pytest.raises(ValueError, match="Unknown Kitsu task status"):
            self.publish(provider, version_status="nope")
        assert session.writes == []

    def test_publish_duplicate_reuses_the_comment(self, provider, session):
        note_id = self.publish(
            provider,
            content="Soften the matte",
            subject="Comp notes",
            version_status="retake",
        )
        assert note_id == COMMENT
        # The only write is the status, on an otherwise empty comment.
        assert len(session.writes) == 1
        assert session.writes[0][2]["comment"] == ""

    def test_publish_same_text_on_other_version_is_not_a_duplicate(
        self, provider, session
    ):
        session.routes[f"data/tasks/{TASK}/comments"] = [
            {**COMMENT_ROW, "preview_file_id": OTHER_PREVIEW}
        ]
        self.publish(provider, content="Soften the matte", subject="Comp notes")
        assert len(comment_posts(session)) == 1

    def test_update_note(self, provider, session):
        assert provider.update_note(
            COMMENT, "Edited", "New", PREVIEW, "retake", [Shot(id=SHOT)]
        )
        put, post = session.writes
        assert put[2] == {
            "id": COMMENT,
            "text": "Edited",
            "data": {"subject": "New"},
            "preview_file_id": PREVIEW,
        }
        assert post[2]["task_status_id"] == RETAKE

    def test_update_note_content_only(self, provider, session):
        assert provider.update_note(COMMENT, "Edited")
        assert session.writes == [
            ("PUT", f"data/comments/{COMMENT}", {"id": COMMENT, "text": "Edited"})
        ]

    def test_update_missing_note_returns_false(self, provider):
        assert not provider.update_note(MISSING, "Edited")

    def test_attach_file(self, provider, session):
        with mock.patch("gazu.task.add_attachment_files_to_comment") as attach:
            assert provider.attach_file_to_note(COMMENT, "/tmp/a.png", "a.png")
        assert attach.call_args.args == (TASK, COMMENT, "/tmp/a.png")
        assert not provider.attach_file_to_note(MISSING, "/tmp/a.png", "a.png")

    def test_add_note_on_version(self, provider, session):
        note = provider.add_entity(
            "note",
            Note(id="", content="Hi", subject="S", note_links=[Version(id=PREVIEW)]),
        )
        assert note.id == COMMENT
        assert session.writes[1][2]["preview_file_id"] == PREVIEW

    def test_add_note_on_task_keeps_additional_fields(self, provider, session):
        provider.add_entity(
            "note",
            Note(
                id="",
                content="Hi",
                note_links=[Task(id=TASK)],
                additional_fields={"k": 1},
            ),
        )
        assert session.writes[1][2] == {
            "id": COMMENT,
            "preview_file_id": None,
            "data": {"k": 1, "subject": None},
        }

    def test_add_entity_rejects(self, provider):
        with pytest.raises(ValueError, match="link to a version or a task"):
            provider.add_entity("note", Note(id="", note_links=[Shot(id=SHOT)]))
        with pytest.raises(ValueError, match="project and a code"):
            provider.add_entity("playlist", Playlist(id=""))
        with pytest.raises(NotImplementedError):
            provider.add_entity("shot", Shot(id=""))

    def test_add_playlist(self, provider):
        playlist = Playlist(id="", code="New", project={"id": PROJECT})
        assert provider.add_entity("playlist", playlist).code == "New"

    def test_playlist_note_raises_not_implemented(self, provider):
        # main.py reports this as a failed note.
        with pytest.raises(NotImplementedError, match="playlist"):
            provider.publish_playlist_note(playlist_id=PLAYLIST, content="x")

    def publish_transcript(self, provider):
        return provider.publish_transcript(
            project_id=PROJECT,
            playlist_id=PLAYLIST,
            version_id=PREVIEW,
            meeting_id="m",
            meeting_date=date(2026, 1, 2),
            platform="meet",
            body="Speaker: hé",
        )

    def test_publish_transcript_attaches_the_body(self, provider, session):
        uploads = []

        def read_upload(task_id, comment_id, path, client):
            with open(path, encoding="utf-8") as upload:
                uploads.append((task_id, comment_id, basename(path), upload.read()))

        with mock.patch(
            "gazu.task.add_attachment_files_to_comment", side_effect=read_upload
        ):
            assert self.publish_transcript(provider) == COMMENT

        name = f"transcript-{PREVIEW}-2026-01-02.txt"
        assert uploads == [(TASK, COMMENT, name, "Speaker: hé")]
        post, put = session.writes
        assert post[2]["comment"] == (
            "Transcript of SQ01_SH010_Compositing_v003, 2026-01-02 (meet)"
        )
        # Tied to a revision, the comment would sync back to DNA as a note.
        assert put[2]["preview_file_id"] is None
        assert put[2]["data"]["transcript"]["meeting_id"] == "m"

    def test_publish_transcript_removes_the_comment_if_upload_fails(
        self, provider, session
    ):
        with (
            mock.patch(
                "gazu.task.add_attachment_files_to_comment", side_effect=OSError
            ),
            mock.patch("gazu.task.remove_comment") as remove,
            pytest.raises(OSError),
        ):
            self.publish_transcript(provider)
        assert remove.call_args.args == (COMMENT,)

    def transcript_row(self):
        return {
            **COMMENT_ROW,
            "data": {
                "transcript": {
                    "version_id": PREVIEW,
                    "version_name": "v3",
                    "platform": "meet",
                }
            },
            "attachment_files": [
                {"id": ADMIN, "name": "transcript-old.txt"},
                {"id": MISSING, "name": "sketch.png"},
            ],
        }

    def test_update_transcript_replaces_only_the_transcript_file(
        self, provider, session
    ):
        session.routes[f"data/comments/{COMMENT}"] = self.transcript_row()
        calls = mock.Mock()
        with (
            mock.patch("gazu.task.add_attachment_files_to_comment", calls.upload),
            mock.patch("gazu.task.delete_comment_attachment", calls.delete),
        ):
            assert provider.update_transcript(
                entity_type="CustomEntity01",
                entity_id=COMMENT,
                body="New",
                meeting_date=date(2026, 1, 3),
            )
        assert [call[0] for call in calls.mock_calls] == ["upload", "delete"]
        assert calls.delete.call_args.args == (TASK, COMMENT, ADMIN)
        assert session.writes == [
            (
                "PUT",
                f"data/comments/{COMMENT}",
                {"id": COMMENT, "text": "Transcript of v3, 2026-01-03 (meet)"},
            )
        ]

    def test_update_transcript_keeps_the_old_file_if_upload_fails(
        self, provider, session
    ):
        session.routes[f"data/comments/{COMMENT}"] = self.transcript_row()
        with (
            mock.patch(
                "gazu.task.add_attachment_files_to_comment", side_effect=OSError
            ),
            mock.patch("gazu.task.delete_comment_attachment") as delete,
        ):
            assert not provider.update_transcript(
                entity_type="x",
                entity_id=COMMENT,
                body="New",
                meeting_date=date(2026, 1, 3),
            )
        delete.assert_not_called()
        assert session.writes == []

    def test_update_transcript_on_a_plain_note_returns_false(self, provider):
        # COMMENT_ROW has no transcript info in its data.
        assert not provider.update_transcript(
            entity_type="x",
            entity_id=COMMENT,
            body="New",
            meeting_date=date(2026, 1, 3),
        )
