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
        "INSERT INTO tasks (id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id) VALUES (200, 'Animation', 'ip', 1, 'Anim', 1, 'Shot', 100)"
    )
    conn.execute(
        """INSERT INTO versions (id, name, description, status, user_id, created_at, updated_at, movie_path, frame_path, thumbnail, project_id, entity_type, entity_id, task_id) VALUES (300, 'v_001', 'First version', 'rev', 10, '2024-01-01T00:00:00', '2024-01-02T00:00:00', NULL, NULL, NULL, 1, 'Shot', 100, 200)"""
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
    with pytest.raises(ValueError, match="User not found: nobody@example.com"):
        mock_provider.get_user_by_email("nobody@example.com")


def test_get_projects_for_user(mock_provider):
    projects = mock_provider.get_projects_for_user("test@example.com")
    assert len(projects) == 1
    assert projects[0].id == 1


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
