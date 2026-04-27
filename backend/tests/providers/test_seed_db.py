import sqlite3
from datetime import datetime
from pathlib import Path
from unittest import mock

import pytest

from dna.prodtrack_providers.mock_data.seed_db import (
    _download_thumbnail,
    _link_id,
    _link_name,
    _link_type,
    _serialize_dt,
    _sg_type_to_entity_type,
    create_schema,
    extract_and_seed,
)


class TestSeedDbHelpers:
    def test_link_id_returns_id_from_dict(self):
        assert _link_id({"id": 42}) == 42
        assert _link_id({"type": "Shot", "id": 1}) == 1

    def test_link_id_returns_none_for_non_dict(self):
        assert _link_id(None) is None
        assert _link_id(42) is None

    def test_link_id_returns_none_when_no_id(self):
        assert _link_id({}) is None
        assert _link_id({"type": "Shot"}) is None

    def test_link_type_returns_type_from_dict(self):
        assert _link_type({"type": "Shot", "id": 1}) == "Shot"
        assert _link_type({"type": "Project"}) == "Project"

    def test_link_type_returns_none(self):
        assert _link_type(None) is None
        assert _link_type({}) is None
        assert _link_type({"id": 1}) is None

    def test_link_name_returns_name_from_dict(self):
        assert _link_name({"name": "s_001"}) == "s_001"
        assert _link_name({"type": "Shot", "id": 1, "name": "Shot 01"}) == "Shot 01"

    def test_link_name_returns_none(self):
        assert _link_name(None) is None
        assert _link_name({}) is None

    def test_serialize_dt_none(self):
        assert _serialize_dt(None) is None

    def test_serialize_dt_datetime(self):
        dt = datetime(2024, 1, 15, 10, 30, 0)
        assert _serialize_dt(dt) == "2024-01-15T10:30:00"

    def test_serialize_dt_other_falls_back_to_str(self):
        assert _serialize_dt(123) == "123"

    def test_sg_type_to_entity_type(self):
        assert _sg_type_to_entity_type("Project") == "project"
        assert _sg_type_to_entity_type("Shot") == "shot"
        assert _sg_type_to_entity_type("Asset") == "asset"
        assert _sg_type_to_entity_type("Task") == "task"
        assert _sg_type_to_entity_type("Version") == "version"
        assert _sg_type_to_entity_type("Playlist") == "playlist"
        assert _sg_type_to_entity_type("Note") == "note"
        assert _sg_type_to_entity_type("HumanUser") == "user"

    def test_sg_type_to_entity_type_unknown(self):
        assert _sg_type_to_entity_type("Unknown") is None


class TestCreateSchema:
    def test_create_schema_creates_tables(self, tmp_path):
        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(db_path)
        create_schema(conn)
        conn.close()
        conn = sqlite3.connect(db_path)
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [r[0] for r in cur.fetchall()]
        conn.close()
        assert "projects" in tables
        assert "users" in tables
        assert "shots" in tables
        assert "assets" in tables
        assert "versions" in tables
        assert "playlists" in tables
        assert "notes" in tables


class TestDownloadThumbnail:
    def test_download_thumbnail_empty_url_returns_none(self, tmp_path):
        assert _download_thumbnail("", 1, tmp_path, "http://localhost:8000") is None

    def test_download_thumbnail_non_string_url_returns_none(self, tmp_path):
        assert _download_thumbnail(None, 1, tmp_path, "http://localhost:8000") is None  # type: ignore

    def test_download_thumbnail_exception_returns_none(self, tmp_path):
        with mock.patch("urllib.request.urlopen", side_effect=OSError("network error")):
            result = _download_thumbnail(
                "http://example.com/t.jpg", 1, tmp_path, "http://localhost:8000"
            )
        assert result is None

    def test_download_thumbnail_png_content_type(self, tmp_path):
        body = b"\x89PNG\r\n\x1a\n"
        resp = mock.MagicMock()
        resp.read.return_value = body
        resp.headers = {"Content-Type": "image/png"}
        resp.__enter__ = mock.Mock(return_value=resp)
        resp.__exit__ = mock.Mock(return_value=None)
        with mock.patch("urllib.request.urlopen", return_value=resp):
            result = _download_thumbnail(
                "http://example.com/t.png", 99, tmp_path, "https://api.example.com"
            )
        assert result == "https://api.example.com/api/mock-thumbnails/99"
        assert (tmp_path / "99.png").exists()

    def test_download_thumbnail_gif_content_type(self, tmp_path):
        body = b"GIF89a"
        resp = mock.MagicMock()
        resp.read.return_value = body
        resp.headers = {"Content-Type": "image/gif"}
        resp.__enter__ = mock.Mock(return_value=resp)
        resp.__exit__ = mock.Mock(return_value=None)
        with mock.patch("urllib.request.urlopen", return_value=resp):
            result = _download_thumbnail(
                "http://example.com/t.gif", 7, tmp_path, "http://localhost:8000"
            )
        assert result == "http://localhost:8000/api/mock-thumbnails/7"
        assert (tmp_path / "7.gif").exists()

    def test_download_thumbnail_webp_content_type(self, tmp_path):
        body = b"RIFF\x00\x00\x00\x00WEBP"
        resp = mock.MagicMock()
        resp.read.return_value = body
        resp.headers = {"Content-Type": "image/webp"}
        resp.__enter__ = mock.Mock(return_value=resp)
        resp.__exit__ = mock.Mock(return_value=None)
        with mock.patch("urllib.request.urlopen", return_value=resp):
            result = _download_thumbnail(
                "http://example.com/t.webp", 3, tmp_path, "http://localhost:9000"
            )
        assert result == "http://localhost:9000/api/mock-thumbnails/3"
        assert (tmp_path / "3.webp").exists()

    def test_download_thumbnail_base_url_with_trailing_slash(self, tmp_path):
        body = b"\xff\xd8\xff"
        resp = mock.MagicMock()
        resp.read.return_value = body
        resp.headers = {"Content-Type": "image/jpeg"}
        resp.__enter__ = mock.Mock(return_value=resp)
        resp.__exit__ = mock.Mock(return_value=None)
        with mock.patch("urllib.request.urlopen", return_value=resp):
            result = _download_thumbnail(
                "http://example.com/t.jpg", 5, tmp_path, "http://localhost:8000/"
            )
        assert result == "http://localhost:8000/api/mock-thumbnails/5"


class TestExtractAndSeed:
    def test_extract_and_seed_project_not_found_raises(self, tmp_path):
        db_path = tmp_path / "mock.db"
        mock_sg_instance = mock.MagicMock()
        mock_sg_instance.find_one.return_value = None
        fake_sg_module = mock.MagicMock()
        fake_sg_module.Shotgun = mock.MagicMock(return_value=mock_sg_instance)
        with mock.patch.dict("sys.modules", {"shotgun_api3": fake_sg_module}):
            with pytest.raises(ValueError, match="Project 999 not found"):
                extract_and_seed(999, "https://x.com", "script", "key", db_path)

    def test_extract_and_seed_populates_db(self, tmp_path):
        db_path = tmp_path / "mock.db"
        mock_sg_instance = mock.MagicMock()
        mock_sg_instance.find_one.return_value = {
            "id": 1,
            "name": "Test Project",
            "users": [],
        }
        mock_sg_instance.find.return_value = []
        mock_sg_instance.schema_field_read.return_value = {
            "sg_status_list": {
                "properties": {
                    "valid_values": {"value": ["rev", "apr"]},
                    "display_values": {
                        "value": {"rev": "Revision", "apr": "Approved"},
                    },
                }
            },
        }
        fake_sg_module = mock.MagicMock()
        fake_sg_module.Shotgun = mock.MagicMock(return_value=mock_sg_instance)
        with mock.patch.dict("sys.modules", {"shotgun_api3": fake_sg_module}):
            counts = extract_and_seed(
                1, "https://x.com", "script", "key", db_path, skip_thumbnails=True
            )
        assert counts["projects"] == 1
        assert "shots" in counts
        assert "assets" in counts
        assert "versions" in counts
        assert "playlists" in counts
        assert "notes" in counts
        assert "users" in counts
        assert "version_statuses" in counts
        conn = sqlite3.connect(db_path)
        proj = conn.execute("SELECT id, name FROM projects WHERE id = 1").fetchone()
        conn.close()
        assert proj == (1, "Test Project")

    def test_extract_and_seed_with_versions_and_playlists(self, tmp_path):
        db_path = tmp_path / "mock.db"
        mock_sg_instance = mock.MagicMock()
        mock_sg_instance.find_one.return_value = {
            "id": 1,
            "name": "Test Project",
            "users": [],
        }
        one_user = [
            {"id": 10, "name": "User", "email": "u@example.com", "login": "user"},
        ]
        one_version = [
            {
                "id": 100,
                "code": "v1",
                "description": "d",
                "sg_status_list": "rev",
                "user": {"type": "HumanUser", "id": 10},
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-02T00:00:00",
                "sg_path_to_movie": None,
                "sg_path_to_frames": None,
                "image": {"url": "http://example.com/thumb.jpg", "name": "thumb"},
                "project": {"type": "Project", "id": 1},
                "entity": {"type": "Shot", "id": 1},
                "sg_task": {"type": "Task", "id": 1},
            },
        ]
        one_playlist = [
            {
                "id": 200,
                "code": "pl1",
                "description": "desc",
                "project": {"type": "Project", "id": 1},
                "created_at": "2024-01-01",
                "updated_at": "2024-01-01",
                "versions": [{"type": "Version", "id": 100}],
            },
        ]
        one_note = [
            {
                "id": 300,
                "subject": "subj",
                "content": "body",
                "project": {"type": "Project", "id": 1},
                "note_links": [{"type": "Version", "id": 100}],
                "created_by": {"type": "HumanUser", "id": 10},
            },
        ]
        mock_sg_instance.find.side_effect = [
            one_user,
            [],  # Shot
            [],  # Asset
            [],  # Task
            one_version,
            one_playlist,
            one_note,
            [],  # extra users
        ]
        mock_sg_instance.schema_field_read.return_value = {
            "sg_status_list": {
                "properties": {
                    "valid_values": {"value": ["rev"]},
                    "display_values": {"value": {"rev": "Revision"}},
                }
            },
        }
        fake_sg_module = mock.MagicMock()
        fake_sg_module.Shotgun = mock.MagicMock(return_value=mock_sg_instance)
        with mock.patch.dict("sys.modules", {"shotgun_api3": fake_sg_module}):
            with mock.patch(
                "dna.prodtrack_providers.mock_data.seed_db._download_thumbnail",
                return_value="http://localhost:8000/api/mock-thumbnails/100",
            ):
                counts = extract_and_seed(
                    1, "https://x.com", "script", "key", db_path, skip_thumbnails=False
                )
        assert counts["versions"] == 1
        assert counts["playlists"] == 1
        assert counts["notes"] == 1
        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT id, name, thumbnail FROM versions WHERE id = 100"
        ).fetchone()
        conn.close()
        assert row == (100, "v1", "http://localhost:8000/api/mock-thumbnails/100")
