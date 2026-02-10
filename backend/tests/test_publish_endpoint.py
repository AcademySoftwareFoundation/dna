"""Tests for publishing endpoints."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_prodtrack_provider_cached, get_storage_provider_cached

from dna.models.draft_note import DraftNote
from dna.models.requests import PublishNotesRequest


class TestPublishNotesEndpoint:
    """Tests for publishing endpoints."""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_storage(self):
        storage = mock.AsyncMock()
        return storage

    @pytest.fixture
    def mock_prodtrack(self):
        prodtrack = mock.Mock()
        return prodtrack

    @pytest.fixture
    def override_deps(self, mock_storage, mock_prodtrack):
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_prodtrack
        yield
        app.dependency_overrides.clear()

    def test_publish_notes_success(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Test successful publishing of notes."""
        # Setup mock data
        draft_note = DraftNote(
            _id="note1",
            user_email="user@example.com",
            playlist_id=100,
            version_id=101,
            content="Test note",
            subject="Test subject",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            published=False,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [draft_note]
        mock_prodtrack.publish_note.return_value = 500

        # Execute request
        response = client.post(
            "/playlists/100/publish-notes",
            json={"user_email": "user@example.com", "include_others": False},
        )

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["published_count"] == 1
        assert data["total"] == 1

        # Verify provider called
        mock_prodtrack.publish_note.assert_called_once()
        args = mock_prodtrack.publish_note.call_args[1]
        assert args["version_id"] == 101
        assert args["content"] == "Test note"
        assert args["author_email"] == "user@example.com"

        # Verify storage update
        mock_storage.upsert_draft_note.assert_called_once()
        call_args = mock_storage.upsert_draft_note.call_args
        assert call_args[1]["user_email"] == "user@example.com"
        assert call_args[1]["data"].published is True
        assert call_args[1]["data"].published_note_id == 500

    def test_publish_notes_skips_published(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Test skipping already published notes."""
        published_note = DraftNote(
            _id="note2",
            user_email="user@example.com",
            playlist_id=100,
            version_id=102,
            content="Already published",
            subject="Sub",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            published=True,  # ALREADY PUBLISHED
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [published_note]

        response = client.post(
            "/playlists/100/publish-notes",
            json={"user_email": "user@example.com", "include_others": False},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["published_count"] == 0
        assert data["total"] == 0  # because filtered out

        mock_prodtrack.publish_note.assert_not_called()

    def test_publish_notes_filters_users(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Test filtering users unless include_others is True."""
        other_note = DraftNote(
            _id="note3",
            user_email="other@example.com",
            playlist_id=100,
            version_id=103,
            content="Other note",
            subject="Sub",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [other_note]
        mock_prodtrack.publish_note.return_value = 500

        # 1. include_others = False
        response = client.post(
            "/playlists/100/publish-notes",
            json={"user_email": "user@example.com", "include_others": False},
        )
        data = response.json()
        assert data["published_count"] == 0

        # 2. include_others = True
        response = client.post(
            "/playlists/100/publish-notes",
            json={"user_email": "user@example.com", "include_others": True},
        )
        data = response.json()
        assert data["published_count"] == 1
        assert data["total"] == 1
