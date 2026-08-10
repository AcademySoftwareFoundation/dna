"""Tests for creating entities in ShotGrid."""

from unittest import mock

import pytest

from dna.models.entity import Note, Playlist, Version
from dna.prodtrack_providers.shotgrid import ShotgridProvider


@pytest.fixture
def shotgrid_provider():
    """Create a ShotGrid provider with a mocked SG client."""
    sg_provider = ShotgridProvider(
        url="https://test.shotgunstudio.com",
        script_name="test_script",
        api_key="test_key",
        connect=False,
    )

    mock_sg = mock.MagicMock()
    sg_provider.sg = mock_sg

    return sg_provider


class TestCreateNoteMocked:
    """Mocked unit tests for creating Notes."""

    def test_create_note_calls_sg_create_with_correct_data(self, shotgrid_provider):
        """Test that add_entity calls SG create with properly mapped fields."""
        shotgrid_provider.sg.reset_mock()

        shotgrid_provider.sg.create.return_value = {
            "type": "Note",
            "id": 1234,
            "subject": "Test Note",
            "content": "Test content",
            "project": {"type": "Project", "id": 85},
        }

        version = Version(id=6957, name="test_version")
        playlist = Playlist(id=6, code="test_playlist")

        note = Note(
            id=0,
            subject="Test Note",
            content="Test content",
            project={"type": "Project", "id": 85},
            note_links=[version, playlist],
        )

        created_note = shotgrid_provider.add_entity("note", note)

        shotgrid_provider.sg.create.assert_called_once()
        call_args = shotgrid_provider.sg.create.call_args
        assert call_args[0][0] == "Note"

        sg_data = call_args[0][1]
        assert sg_data["subject"] == "Test Note"
        assert sg_data["content"] == "Test content"
        assert sg_data["project"] == {"type": "Project", "id": 85}
        assert sg_data["note_links"] == [
            {"type": "Version", "id": 6957},
            {"type": "Playlist", "id": 6},
        ]
        assert "id" not in sg_data

        assert created_note.id == 1234
        assert created_note.subject == "Test Note"
        assert len(created_note.note_links) == 2
        assert created_note.note_links[0].id == 6957
        assert created_note.note_links[1].id == 6

    def test_create_note_without_links(self, shotgrid_provider):
        """Test creating a note without any linked entities."""
        shotgrid_provider.sg.reset_mock()

        shotgrid_provider.sg.create.return_value = {
            "type": "Note",
            "id": 5678,
            "subject": "Simple Note",
            "content": "Just a note",
            "project": {"type": "Project", "id": 1},
        }

        note = Note(
            id=0,
            subject="Simple Note",
            content="Just a note",
            project={"type": "Project", "id": 1},
        )

        created_note = shotgrid_provider.add_entity("note", note)

        assert created_note.id == 5678
        assert created_note.subject == "Simple Note"
        assert created_note.content == "Just a note"

    def test_create_note_skips_none_values(self, shotgrid_provider):
        """Test that None values are not sent to ShotGrid."""
        shotgrid_provider.sg.reset_mock()

        shotgrid_provider.sg.create.return_value = {
            "type": "Note",
            "id": 9999,
            "subject": "Minimal Note",
            "project": {"type": "Project", "id": 1},
        }

        note = Note(
            id=0,
            subject="Minimal Note",
            content=None,
            project={"type": "Project", "id": 1},
        )

        shotgrid_provider.add_entity("note", note)

        call_args = shotgrid_provider.sg.create.call_args
        sg_data = call_args[0][1]
        assert "content" not in sg_data


class TestCreateNoteOnVersion:
    """Tests for creating notes linked to versions."""

    def test_create_note_on_version(self, shotgrid_provider):
        """Test creating a note linked to a version and playlist."""
        shotgrid_provider.sg.reset_mock()

        shotgrid_provider.sg.create.return_value = {
            "type": "Note",
            "id": 7890,
            "subject": "Test Note from DNA Integration Test",
            "content": "This note was created by the DNA integration test suite.",
            "project": {"type": "Project", "id": 85},
            "note_links": [
                {"type": "Version", "id": 6957, "name": "test_version"},
                {"type": "Playlist", "id": 6, "code": "test_playlist"},
            ],
        }

        version = Version(id=6957, name="test_version")
        playlist = Playlist(id=6, code="test_playlist")

        note = Note(
            id=0,
            subject="Test Note from DNA Integration Test",
            content="This note was created by the DNA integration test suite.",
            project={"type": "Project", "id": 85},
            note_links=[version, playlist],
        )

        created_note = shotgrid_provider.add_entity("note", note)

        shotgrid_provider.sg.create.assert_called_once()
        assert created_note is not None
        assert created_note.id == 7890
        assert created_note.subject == "Test Note from DNA Integration Test"
        assert (
            created_note.content
            == "This note was created by the DNA integration test suite."
        )


class TestCreateVersionMocked:
    """Mocked unit tests for create_version."""

    def test_create_version_calls_sg_create(self, shotgrid_provider):
        shotgrid_provider.sg.create.return_value = {
            "type": "Version",
            "id": 9001,
            "code": "shot_v001",
            "project": {"type": "Project", "id": 85},
        }

        version = shotgrid_provider.create_version(85, "shot_v001")

        shotgrid_provider.sg.create.assert_called_once_with(
            "Version",
            {
                "code": "shot_v001",
                "project": {"type": "Project", "id": 85},
            },
        )
        assert version.id == 9001
        assert version.name == "shot_v001"
        assert version.prodtrack_detail_url == (
            "https://test.shotgunstudio.com/detail/Version/9001"
        )

    def test_create_version_with_entity_link(self, shotgrid_provider):
        shotgrid_provider.sg.create.return_value = {
            "type": "Version",
            "id": 9002,
            "code": "shot_v002",
            "project": {"type": "Project", "id": 85},
        }
        shotgrid_provider.sg.find_one.return_value = {
            "type": "Shot",
            "id": 42,
            "code": "s_001",
            "description": None,
            "project": {"type": "Project", "id": 85},
        }

        version = shotgrid_provider.create_version(
            85, "shot_v002", entity_type="shot", entity_id=42
        )

        sg_data = shotgrid_provider.sg.create.call_args[0][1]
        assert sg_data["entity"] == {"type": "Shot", "id": 42}
        assert version.entity is not None
        assert version.entity.id == 42
        assert version.prodtrack_entity_detail_url == (
            "https://test.shotgunstudio.com/detail/Shot/42"
        )

    def test_create_version_unknown_entity_type_raises(self, shotgrid_provider):
        with pytest.raises(ValueError, match="Unknown entity type"):
            shotgrid_provider.create_version(85, "v", entity_type="bogus", entity_id=1)

    def test_create_version_not_connected_raises(self):
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.create_version(85, "v")


class TestCreateEntityMocked:
    """Mocked unit tests for create_entity."""

    def test_create_shot(self, shotgrid_provider):
        shotgrid_provider.sg.create.return_value = {
            "type": "Shot",
            "id": 43,
            "code": "s_010",
            "description": None,
            "project": {"type": "Project", "id": 85},
        }

        shot = shotgrid_provider.create_entity(85, "shot", "s_010")

        shotgrid_provider.sg.create.assert_called_once_with(
            "Shot",
            {
                "code": "s_010",
                "project": {"type": "Project", "id": 85},
            },
        )
        assert shot.id == 43
        assert shot.name == "s_010"

    def test_create_asset(self, shotgrid_provider):
        shotgrid_provider.sg.create.return_value = {
            "type": "Asset",
            "id": 44,
            "code": "prop_chair",
            "description": None,
            "project": {"type": "Project", "id": 85},
        }

        asset = shotgrid_provider.create_entity(85, "Asset", "prop_chair")

        assert shotgrid_provider.sg.create.call_args[0][0] == "Asset"
        assert asset.id == 44

    def test_create_entity_unsupported_type_raises(self, shotgrid_provider):
        with pytest.raises(ValueError, match="Unsupported entity type"):
            shotgrid_provider.create_entity(85, "task", "nope")


class TestCreatePlaylistMocked:
    """Mocked unit tests for create_playlist."""

    def test_create_playlist_calls_sg_create(self, shotgrid_provider):
        shotgrid_provider.sg.create.return_value = {
            "type": "Playlist",
            "id": 77,
            "code": "Dailies Monday",
            "project": {"type": "Project", "id": 85},
        }

        playlist = shotgrid_provider.create_playlist(85, "Dailies Monday")

        shotgrid_provider.sg.create.assert_called_once_with(
            "Playlist",
            {
                "code": "Dailies Monday",
                "project": {"type": "Project", "id": 85},
            },
        )
        assert playlist.id == 77
        assert playlist.code == "Dailies Monday"


class TestAddVersionToPlaylistMocked:
    """Mocked unit tests for add_version_to_playlist."""

    def test_appends_version_to_playlist(self, shotgrid_provider):
        shotgrid_provider.sg.find_one.return_value = {
            "type": "Playlist",
            "id": 6,
            "versions": [{"type": "Version", "id": 1}],
        }

        assert shotgrid_provider.add_version_to_playlist(6, 2) is True

        shotgrid_provider.sg.update.assert_called_once_with(
            "Playlist",
            6,
            {
                "versions": [
                    {"type": "Version", "id": 1},
                    {"type": "Version", "id": 2},
                ]
            },
        )

    def test_skips_update_when_version_already_present(self, shotgrid_provider):
        shotgrid_provider.sg.find_one.return_value = {
            "type": "Playlist",
            "id": 6,
            "versions": [{"type": "Version", "id": 2}],
        }

        assert shotgrid_provider.add_version_to_playlist(6, 2) is True
        shotgrid_provider.sg.update.assert_not_called()

    def test_handles_playlist_with_no_versions(self, shotgrid_provider):
        shotgrid_provider.sg.find_one.return_value = {
            "type": "Playlist",
            "id": 6,
            "versions": None,
        }

        assert shotgrid_provider.add_version_to_playlist(6, 2) is True
        updated = shotgrid_provider.sg.update.call_args[0][2]
        assert updated == {"versions": [{"type": "Version", "id": 2}]}

    def test_missing_playlist_raises(self, shotgrid_provider):
        shotgrid_provider.sg.find_one.return_value = None

        with pytest.raises(ValueError, match="Playlist 999 not found"):
            shotgrid_provider.add_version_to_playlist(999, 2)
