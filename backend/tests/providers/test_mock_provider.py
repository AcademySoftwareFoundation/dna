import os
import sqlite3
from pathlib import Path
from unittest import mock

import pytest

from dna.models.entity import Note, Project, User, Version
from dna.prodtrack_providers.mock_data.seed_db import _download_thumbnail
from dna.prodtrack_providers.mock_provider import (
    THUMBNAIL_LOCAL,
    MockProdtrackProvider,
    _shallow_entity,
)
from dna.prodtrack_providers.prodtrack_provider_base import get_prodtrack_provider


def _create_seeded_db(path: Path) -> None:
    schema_path = (
        Path(__file__).resolve().parents[2]
        / "src"
        / "dna"
        / "prodtrack_providers"
        / "mock_data"
        / "schema.sql"
    )
    conn = sqlite3.connect(path)
    conn.executescript(schema_path.read_text())
    conn.execute("INSERT INTO projects (id, name) VALUES (1, 'Test Project')")
    conn.execute(
        "INSERT INTO users (id, name, email, login) VALUES (10, 'Test User', 'test@example.com', 'testuser')"
    )
    conn.execute("INSERT INTO project_users (project_id, user_id) VALUES (1, 10)")
    conn.execute(
        "INSERT INTO shots (id, name, description, project_id) VALUES (100, 's_001', 'A shot', 1)"
    )
    conn.execute(
        "INSERT INTO assets (id, name, description, project_id) VALUES (150, 'char_rig', 'Character rig', 1)"
    )
    conn.execute(
        "INSERT INTO tasks (id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id) VALUES (200, 'Animation', 'ip', 1, 'Anim', 1, 'Shot', 100)"
    )
    conn.execute(
        "INSERT INTO tasks (id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id) VALUES (201, 'Rig', 'ip', 1, 'Model', 1, 'Asset', 150)"
    )
    conn.execute(
        """INSERT INTO versions (id, name, description, status, user_id, created_at, updated_at, movie_path, frame_path, thumbnail, project_id, entity_type, entity_id, task_id) VALUES (300, 'v_001', 'First version', 'rev', 10, '2024-01-01T00:00:00', '2024-01-02T00:00:00', NULL, NULL, NULL, 1, 'Shot', 100, 200)"""
    )
    conn.execute(
        """INSERT INTO versions (id, name, description, status, user_id, created_at, updated_at, movie_path, frame_path, thumbnail, project_id, entity_type, entity_id, task_id) VALUES (301, 'v_002', 'Second version', 'ip', 10, '2024-01-03T00:00:00', '2024-01-04T00:00:00', NULL, NULL, NULL, 1, 'Shot', 100, 200)"""
    )
    conn.execute(
        "INSERT INTO playlists (id, code, description, project_id, created_at, updated_at) VALUES (400, 'pl_001', 'Playlist 1', 1, '2024-01-01', '2024-01-01')"
    )
    conn.execute(
        "INSERT INTO playlist_versions (playlist_id, version_id) VALUES (400, 300)"
    )
    conn.execute(
        "INSERT INTO notes (id, subject, content, project_id, author_id) VALUES (500, 'Note 1', 'Content 1', 1, 10)"
    )
    conn.execute(
        "INSERT INTO note_links (note_id, entity_type, entity_id) VALUES (500, 'Version', 300)"
    )
    conn.execute(
        "INSERT INTO version_statuses (code, name, project_id) VALUES ('rev', 'Revision', 1), ('apr', 'Approved', 1)"
    )
    conn.commit()
    conn.close()


@pytest.fixture
def mock_db_path(tmp_path):
    _create_seeded_db(tmp_path / "mock.db")
    return tmp_path / "mock.db"


@pytest.fixture
def mock_provider(mock_db_path):
    return MockProdtrackProvider(db_path=mock_db_path)


def test_get_entity_project(mock_provider):
    proj = mock_provider.get_entity("project", 1)
    assert proj.id == 1
    assert proj.name == "Test Project"


def test_get_entity_user(mock_provider):
    user = mock_provider.get_entity("user", 10)
    assert user.id == 10
    assert user.email == "test@example.com"
    assert user.name == "Test User"


def test_get_entity_shot(mock_provider):
    shot = mock_provider.get_entity("shot", 100, resolve_links=True)
    assert shot.id == 100
    assert shot.name == "s_001"
    assert shot.project == {"type": "Project", "id": 1}
    assert len(shot.tasks) == 1
    assert shot.tasks[0].name == "Animation"


def test_get_entity_project_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: project 999"):
        mock_provider.get_entity("project", 999)


def test_get_entity_user_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: user 999"):
        mock_provider.get_entity("user", 999)


def test_get_entity_asset(mock_provider):
    asset = mock_provider.get_entity("asset", 150, resolve_links=True)
    assert asset.id == 150
    assert asset.name == "char_rig"
    assert asset.description == "Character rig"
    assert len(asset.tasks) == 1
    assert asset.tasks[0].name == "Rig"


def test_get_entity_asset_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: asset 999"):
        mock_provider.get_entity("asset", 999)


def test_get_entity_shot_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: shot 999"):
        mock_provider.get_entity("shot", 999)


def test_get_entity_task_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: task 999"):
        mock_provider.get_entity("task", 999)


def test_get_entity_version_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: version 999"):
        mock_provider.get_entity("version", 999)


def test_get_entity_playlist_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: playlist 999"):
        mock_provider.get_entity("playlist", 999)


def test_get_entity_note_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: note 999"):
        mock_provider.get_entity("note", 999)


def test_get_entity_task_with_entity_link(mock_provider):
    task = mock_provider.get_entity("task", 200, resolve_links=True)
    assert task.id == 200
    assert task.entity is not None
    assert task.entity.id == 100
    assert task.entity.name == "s_001"


def test_get_entity_note_with_links(mock_provider):
    note = mock_provider.get_entity("note", 500, resolve_links=True)
    assert note.id == 500
    assert note.subject == "Note 1"
    assert note.author is not None
    assert note.author.id == 10
    assert len(note.note_links) == 1
    assert note.note_links[0].id == 300


def test_get_entity_version(mock_provider):
    version = mock_provider.get_entity("version", 300, resolve_links=True)
    assert version.id == 300
    assert version.name == "v_001"
    assert version.status == "rev"
    assert version.task is not None
    assert version.task.id == 200
    assert len(version.notes) == 1
    assert version.notes[0].subject == "Note 1"


def test_version_thumbnail_local_resolved_to_url(mock_db_path):
    conn = sqlite3.connect(mock_db_path)
    conn.execute("UPDATE versions SET thumbnail = ? WHERE id = 300", (THUMBNAIL_LOCAL,))
    conn.commit()
    conn.close()
    provider = MockProdtrackProvider(db_path=mock_db_path, base_url="http://api.test")
    version = provider.get_entity("version", 300, resolve_links=False)
    assert version.thumbnail == "http://api.test/api/mock-thumbnails/300"


def test_version_thumbnail_stored_url_rewritten_to_current_base(mock_db_path):
    conn = sqlite3.connect(mock_db_path)
    conn.execute(
        "UPDATE versions SET thumbnail = ? WHERE id = 300",
        ("http://localhost:8000/api/mock-thumbnails/300",),
    )
    conn.commit()
    conn.close()
    provider = MockProdtrackProvider(db_path=mock_db_path, base_url="http://api.test")
    version = provider.get_entity("version", 300, resolve_links=False)
    assert version.thumbnail == "http://api.test/api/mock-thumbnails/300"


def test_download_thumbnail_saves_file_and_returns_local_url(tmp_path):
    body = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    resp = mock.MagicMock()
    resp.read.return_value = body
    resp.headers = {"Content-Type": "image/jpeg"}
    resp.__enter__ = mock.Mock(return_value=resp)
    resp.__exit__ = mock.Mock(return_value=None)
    base_url = "http://localhost:8000"
    with mock.patch("urllib.request.urlopen", return_value=resp):
        result = _download_thumbnail(
            "http://example.com/thumb.jpg", 42, tmp_path, base_url
        )
    assert result == "http://localhost:8000/api/mock-thumbnails/42"
    assert (tmp_path / "42.jpg").exists()
    assert (tmp_path / "42.jpg").read_bytes() == body


def test_get_entity_playlist(mock_provider):
    playlist = mock_provider.get_entity("playlist", 400, resolve_links=True)
    assert playlist.id == 400
    assert playlist.code == "pl_001"
    assert len(playlist.versions) == 1
    assert playlist.versions[0].id == 300


def test_get_entity_not_found(mock_provider):
    with pytest.raises(ValueError, match="Entity not found: shot 999"):
        mock_provider.get_entity("shot", 999)


def test_get_entity_unknown_type(mock_provider):
    with pytest.raises(ValueError, match="Unknown entity type: invalid"):
        mock_provider.get_entity("invalid", 1)


def test_search_asset(mock_provider):
    results = mock_provider.search("char", ["asset"], project_id=1)
    assert len(results) == 1
    assert results[0]["type"] == "Asset"
    assert results[0]["id"] == 150
    assert results[0]["name"] == "char_rig"


def test_search_version(mock_provider):
    results = mock_provider.search("v_001", ["version"], limit=5)
    assert len(results) == 1
    assert results[0]["type"] == "Version"
    assert results[0]["id"] == 300
    assert results[0]["name"] == "v_001"


def test_search_version_with_project_id(mock_provider):
    results = mock_provider.search("v_001", ["version"], project_id=1, limit=5)
    assert len(results) == 1
    assert results[0]["id"] == 300


def test_search_unsupported_entity_type_returns_empty(mock_provider):
    results = mock_provider.search("x", ["playlist"], limit=5)
    assert results == []


def test_search_shot_with_project_id(mock_provider):
    results = mock_provider.search("s_", ["shot"], project_id=1)
    assert len(results) == 1
    assert results[0]["type"] == "Shot"
    assert results[0]["id"] == 100


def test_get_user_by_email_not_found_returns_synthetic_user(mock_provider):
    user = mock_provider.get_user_by_email("nobody@example.com")
    assert user.id == -1
    assert user.email == "nobody@example.com"
    assert user.name == "nobody@example.com"
    assert user.login == "nobody@example.com"


def test_get_user_by_email_returns_user(mock_provider):
    user = mock_provider.get_user_by_email("test@example.com")
    assert user.id == 10
    assert user.name == "Test User"


def test_get_versions_for_playlist_empty(mock_db_path):
    conn = sqlite3.connect(mock_db_path)
    conn.execute("DELETE FROM playlist_versions")
    conn.commit()
    conn.close()
    provider = MockProdtrackProvider(db_path=mock_db_path)
    versions = provider.get_versions_for_playlist(400)
    assert versions == []


def test_get_recent_versions_for_project(mock_provider):
    versions = mock_provider.get_recent_versions_for_project(1, limit=10)
    assert len(versions) >= 1
    ids = [v.id for v in versions]
    assert 300 in ids
    assert versions[0].project == {"type": "Project", "id": 1}


def test_get_recent_versions_for_project_respects_limit(mock_provider):
    versions = mock_provider.get_recent_versions_for_project(1, limit=1)
    assert len(versions) == 1


def test_add_version_to_playlist(mock_provider):
    breakpoint()
    mock_provider.add_version_to_playlist(400, 301)
    versions = mock_provider.get_versions_for_playlist(400)
    version_ids = [v.id for v in versions]
    assert 300 in version_ids
    assert 301 in version_ids


def test_add_version_to_playlist_idempotent(mock_provider):
    mock_provider.add_version_to_playlist(400, 301)
    mock_provider.add_version_to_playlist(400, 301)
    versions = mock_provider.get_versions_for_playlist(400)
    assert sum(1 for v in versions if v.id == 301) == 1


def test_add_version_to_playlist_playlist_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Playlist not found: 999"):
        mock_provider.add_version_to_playlist(999, 300)


def test_add_version_to_playlist_version_not_found_raises(mock_provider):
    with pytest.raises(ValueError, match="Version not found: 999"):
        mock_provider.add_version_to_playlist(400, 999)


def test_get_version_statuses_with_project_id(mock_provider):
    statuses = mock_provider.get_version_statuses(project_id=1)
    assert len(statuses) >= 1
    codes = [s["code"] for s in statuses]
    assert "rev" in codes


def test_get_version_statuses_without_project_id(mock_provider):
    statuses = mock_provider.get_version_statuses()
    assert len(statuses) >= 1


def test_add_entity_raises(mock_provider):
    with pytest.raises(
        NotImplementedError,
        match="MockProdtrackProvider is read-only",
    ):
        mock_provider.add_entity("shot", mock_provider.get_entity("shot", 100))


def test_publish_note_raises(mock_provider):
    with pytest.raises(
        NotImplementedError,
        match="publish_note is not supported",
    ):
        mock_provider.publish_note(
            version_id=300,
            content="test",
            subject="subj",
            to_users=[],
            cc_users=[],
            links=[],
        )


def test_find_unknown_field_raises(mock_provider):
    with pytest.raises(
        ValueError, match="Unknown field 'invalid' for entity type 'shot'"
    ):
        mock_provider.find(
            "shot",
            [{"field": "invalid", "operator": "is", "value": 1}],
        )


def test_find_with_in_operator(mock_provider):
    shots = mock_provider.find(
        "shot",
        [
            {
                "field": "project",
                "operator": "in",
                "value": [{"type": "Project", "id": 1}],
            }
        ],
    )
    assert len(shots) == 1
    assert shots[0].id == 100


def test_find_unsupported_operator_raises(mock_provider):
    with pytest.raises(ValueError, match="Unsupported filter operator"):
        mock_provider.find(
            "shot",
            [{"field": "name", "operator": "regex", "value": "x"}],
        )


def test_shallow_entity_unknown_type_returns_entity_base():
    entity = _shallow_entity("unknown_type", 42)
    assert entity.id == 42
    assert type(entity).__name__ == "EntityBase"


def test_shallow_entity_playlist_uses_code():
    entity = _shallow_entity("playlist", 400, "My Playlist")
    assert entity.id == 400
    assert entity.code == "My Playlist"


def test_provider_init_uses_env_base_url(mock_db_path):
    with mock.patch.dict(os.environ, {"API_BASE_URL": "http://api.test"}, clear=False):
        provider = MockProdtrackProvider(db_path=mock_db_path)
    conn = sqlite3.connect(mock_db_path)
    conn.execute("UPDATE versions SET thumbnail = ? WHERE id = 300", (THUMBNAIL_LOCAL,))
    conn.commit()
    conn.close()
    version = provider.get_entity("version", 300, resolve_links=False)
    assert version.thumbnail == "http://api.test/api/mock-thumbnails/300"


def test_find_with_filters(mock_provider):
    shots = mock_provider.find(
        "shot",
        [{"field": "project", "operator": "is", "value": {"type": "Project", "id": 1}}],
    )
    assert len(shots) == 1
    assert shots[0].id == 100
    shots = mock_provider.find(
        "shot", [{"field": "name", "operator": "contains", "value": "s_"}]
    )
    assert len(shots) == 1


def test_find_empty(mock_provider):
    shots = mock_provider.find(
        "shot", [{"field": "project", "operator": "is", "value": 999}]
    )
    assert shots == []


def test_search(mock_provider):
    results = mock_provider.search("s_", ["shot"], project_id=1, limit=10)
    assert len(results) >= 1
    assert any(r["type"] == "Shot" and r["id"] == 100 for r in results)
    results = mock_provider.search("test@", ["user"], limit=10)
    assert len(results) >= 1
    assert any(r.get("email") == "test@example.com" for r in results)


def test_get_user_by_email(mock_provider):
    user = mock_provider.get_user_by_email("test@example.com")
    assert user.id == 10
    assert user.login == "testuser"


def test_get_user_by_email_not_found(mock_provider):
    user = mock_provider.get_user_by_email("nobody@example.com")
    assert user.id == -1
    assert user.email == "nobody@example.com"


def test_get_projects_for_user(mock_provider):
    projects = mock_provider.get_projects_for_user("test@example.com")
    assert len(projects) >= 1
    project_ids = [p.id for p in projects]
    assert 1 in project_ids


def test_get_playlists_for_project(mock_provider):
    playlists = mock_provider.get_playlists_for_project(1)
    assert len(playlists) == 1
    assert playlists[0].id == 400


def test_get_versions_for_playlist(mock_provider):
    versions = mock_provider.get_versions_for_playlist(400)
    assert len(versions) == 1
    assert versions[0].id == 300
    assert versions[0].task is not None


def test_get_versions_for_playlist_empty(mock_provider):
    versions = mock_provider.get_versions_for_playlist(999)
    assert versions == []


def test_get_version_statuses(mock_provider):
    statuses = mock_provider.get_version_statuses(project_id=1)
    assert len(statuses) >= 1
    codes = [s["code"] for s in statuses]
    assert "rev" in codes
    assert "apr" in codes


def test_add_entity_raises(mock_provider):
    with pytest.raises(NotImplementedError, match="read-only"):
        mock_provider.add_entity(
            "note",
            Note(id=0, subject="x", content="y", project={"type": "Project", "id": 1}),
        )


def test_publish_note_raises(mock_provider):
    with pytest.raises(NotImplementedError, match="read-only"):
        mock_provider.publish_note(300, "content", "subject", [], [], [])


def test_factory_returns_mock_when_explicit():
    with mock.patch.dict(os.environ, {"PRODTRACK_PROVIDER": "mock"}, clear=False):
        from dna.prodtrack_providers.prodtrack_provider_base import (
            get_prodtrack_provider,
        )

        try:
            get_prodtrack_provider.cache_clear()
        except AttributeError:
            pass
        provider = get_prodtrack_provider()
        assert isinstance(provider, MockProdtrackProvider)


def test_factory_raises_when_shotgrid_selected_but_no_credentials():
    with mock.patch.dict(
        os.environ,
        {
            "PRODTRACK_PROVIDER": "shotgrid",
            "SHOTGRID_URL": "",
            "SHOTGRID_SCRIPT_NAME": "",
            "SHOTGRID_API_KEY": "",
        },
        clear=False,
    ):
        try:
            get_prodtrack_provider.cache_clear()
        except AttributeError:
            pass
        with pytest.raises(ValueError, match="ShotGrid credentials not provided"):
            get_prodtrack_provider()


def test_factory_returns_shotgrid_when_credentials_present():
    with mock.patch.dict(
        os.environ,
        {
            "PRODTRACK_PROVIDER": "shotgrid",
            "SHOTGRID_URL": "https://x.com",
            "SHOTGRID_SCRIPT_NAME": "s",
            "SHOTGRID_API_KEY": "k",
        },
        clear=False,
    ):
        with mock.patch.dict("sys.modules", {"shotgun_api3": mock.MagicMock()}):
            with mock.patch(
                "dna.prodtrack_providers.shotgrid.ShotgridProvider"
            ) as mock_sg_class:
                try:
                    get_prodtrack_provider.cache_clear()
                except AttributeError:
                    pass
                provider = get_prodtrack_provider()
                mock_sg_class.assert_called_once()
                assert provider is mock_sg_class.return_value
