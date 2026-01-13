"""Tests for main FastAPI application."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_shotgrid_provider

client = TestClient(app)


def test_root():
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data
    assert data["message"] == "DNA Backend API"


def test_health():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


class TestCreateNoteEndpoint:
    """Tests for POST /note endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_create_note_returns_201(self, mock_provider):
        """Test that creating a note returns 201 status."""
        from dna.models.entity import Note

        mock_provider.add_entity.return_value = Note(
            id=123,
            subject="Test Note",
            content="Test content",
            project={"type": "Project", "id": 85},
        )

        app.dependency_overrides[get_shotgrid_provider] = lambda: mock_provider

        try:
            response = client.post(
                "/note",
                json={
                    "subject": "Test Note",
                    "content": "Test content",
                    "project": {"type": "Project", "id": 85},
                },
            )
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == 123
            assert data["subject"] == "Test Note"
        finally:
            app.dependency_overrides.clear()

    def test_create_note_with_links(self, mock_provider):
        """Test creating a note with linked entities."""
        from dna.models.entity import Note

        mock_provider.add_entity.return_value = Note(
            id=456,
            subject="Linked Note",
            content="Note with links",
            project={"type": "Project", "id": 85},
        )

        app.dependency_overrides[get_shotgrid_provider] = lambda: mock_provider

        try:
            response = client.post(
                "/note",
                json={
                    "subject": "Linked Note",
                    "content": "Note with links",
                    "project": {"type": "Project", "id": 85},
                    "note_links": [
                        {"type": "Version", "id": 6957},
                        {"type": "Playlist", "id": 6},
                    ],
                },
            )
            assert response.status_code == 201

            mock_provider.add_entity.assert_called_once()
            call_args = mock_provider.add_entity.call_args
            note = call_args[0][1]
            assert len(note.note_links) == 2
        finally:
            app.dependency_overrides.clear()

    def test_create_note_missing_project_returns_422(self, mock_provider):
        """Test that missing required project field returns 422."""
        app.dependency_overrides[get_shotgrid_provider] = lambda: mock_provider

        try:
            response = client.post(
                "/note",
                json={
                    "subject": "Test Note",
                    "content": "Test content",
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()
