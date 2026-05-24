"""Tests for publishing endpoints."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_prodtrack_provider_cached, get_storage_provider_cached

from dna.models.draft_note import DraftNote


def _targets(*pairs: tuple[str, int]) -> list[dict[str, str | int]]:
    return [{"user_email": email, "version_id": vid} for email, vid in pairs]


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

        response = client.post(
            "/playlists/100/publish-notes",
            json={
                "user_email": "user@example.com",
                "targets": _targets(("user@example.com", 101)),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["published_count"] == 1
        assert data["total"] == 1

        mock_prodtrack.publish_note.assert_called_once()
        args = mock_prodtrack.publish_note.call_args[1]
        assert args["version_id"] == 101
        assert args["content"] == "Test note"
        assert args["author_email"] == "user@example.com"

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
            published=True,
            published_note_id=123,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [published_note]

        response = client.post(
            "/playlists/100/publish-notes",
            json={
                "user_email": "user@example.com",
                "targets": _targets(("user@example.com", 102)),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["published_count"] == 0
        assert data["skipped_count"] == 1
        assert data["total"] == 1

        mock_prodtrack.publish_note.assert_not_called()

    def test_publish_notes_only_targets_list_publish(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Only (user_email, version_id) pairs listed in targets are published."""
        now = datetime.now(timezone.utc)
        a = DraftNote(
            _id="a1",
            user_email="a@example.com",
            playlist_id=100,
            version_id=301,
            content="A",
            subject="S",
            created_at=now,
            updated_at=now,
            published=False,
        )
        b = DraftNote(
            _id="b1",
            user_email="b@example.com",
            playlist_id=100,
            version_id=302,
            content="B",
            subject="S",
            created_at=now,
            updated_at=now,
            published=False,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [a, b]
        mock_prodtrack.publish_note.return_value = 700

        response = client.post(
            "/playlists/100/publish-notes",
            json={
                "user_email": "viewer@example.com",
                "targets": _targets(("b@example.com", 302)),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["published_count"] == 1
        assert data["total"] == 1
        mock_prodtrack.publish_note.assert_called_once()
        args = mock_prodtrack.publish_note.call_args[1]
        assert args["author_email"] == "b@example.com"
        assert args["version_id"] == 302

    def test_publish_notes_republishes_edited(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Test that edited notes are republished even if already published."""
        edited_note = DraftNote(
            _id="note4",
            user_email="user@example.com",
            playlist_id=100,
            version_id=104,
            content="Edited content",
            subject="Sub",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            published=True,
            published_note_id=505,
            edited=True,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [edited_note]
        mock_prodtrack.update_note.return_value = True

        response = client.post(
            "/playlists/100/publish-notes",
            json={
                "user_email": "user@example.com",
                "targets": _targets(("user@example.com", 104)),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["republished_count"] == 1
        assert data["published_count"] == 0

        mock_prodtrack.update_note.assert_called_once()
        args = mock_prodtrack.update_note.call_args[1]
        assert args["note_id"] == 505
        assert args["content"] == "Edited content"

        mock_storage.upsert_draft_note.assert_called_once()
        call_args = mock_storage.upsert_draft_note.call_args
        assert call_args[1]["data"].published is True
        assert call_args[1]["data"].edited is False

    def test_publish_status_only_no_note(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Status-only notes (no body, no attachments) must update version status
        without creating a note and without marking the draft as published."""
        status_only_note = DraftNote(
            _id="note5",
            user_email="user@example.com",
            playlist_id=100,
            version_id=105,
            content="",
            subject="",
            version_status="rev",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            published=False,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [status_only_note]
        mock_prodtrack.update_version_status.return_value = True

        response = client.post(
            "/playlists/100/publish-notes",
            json={
                "user_email": "user@example.com",
                "targets": _targets(("user@example.com", 105)),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["published_count"] == 0
        mock_prodtrack.publish_note.assert_not_called()
        mock_prodtrack.update_version_status.assert_called_once_with(105, "rev")
        mock_storage.upsert_draft_note.assert_not_called()

    def test_publish_already_published_with_status_change(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """A published, unedited note with a pending version_status change should
        apply the status update without republishing the note."""
        published_with_status = DraftNote(
            _id="note6",
            user_email="user@example.com",
            playlist_id=100,
            version_id=106,
            content="Some note",
            subject="Sub",
            version_status="cmpt",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            published=True,
            edited=False,
            published_note_id=600,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [published_with_status]
        mock_prodtrack.update_version_status.return_value = True

        response = client.post(
            "/playlists/100/publish-notes",
            json={
                "user_email": "user@example.com",
                "targets": _targets(("user@example.com", 106)),
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["skipped_count"] == 1
        mock_prodtrack.publish_note.assert_not_called()
        mock_prodtrack.update_note.assert_not_called()
        mock_prodtrack.update_version_status.assert_called_once_with(106, "cmpt")

    def test_publish_notes_targets_empty_publishes_nothing(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Empty targets list means no notes are considered for publish."""
        now = datetime.now(timezone.utc)
        draft = DraftNote(
            _id="d1",
            user_email="user@example.com",
            playlist_id=100,
            version_id=203,
            content="Body",
            subject="S",
            created_at=now,
            updated_at=now,
            published=False,
        )
        mock_storage.get_draft_notes_for_playlist.return_value = [draft]

        response = client.post(
            "/playlists/100/publish-notes",
            json={"user_email": "user@example.com", "targets": []},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["published_count"] == 0
        mock_prodtrack.publish_note.assert_not_called()
