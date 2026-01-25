"""Tests for creating entities in ShotGrid."""

from unittest import mock

import pytest

from dna.models.entity import Note, Playlist, Version
from dna.prodtrack_providers.shotgrid import ShotgridProvider


@pytest.fixture
def shotgrid_provider():
    """Create a ShotGrid provider with a mocked SG client."""
    sg_provider = ShotgridProvider(connect=False)

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
