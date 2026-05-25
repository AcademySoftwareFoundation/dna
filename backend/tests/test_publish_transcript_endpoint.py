"""Tests for POST /playlists/{id}/publish-transcript."""

import os
from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_prodtrack_provider_cached, get_storage_provider_cached

from dna.models.playlist_metadata import PlaylistMetadata
from dna.models.published_transcript import PublishedTranscript
from dna.models.stored_segment import StoredSegment

ENABLE_FLAG = {"DNA_ENABLE_TRANSCRIPT_PUBLISH": "true"}


def _segment(start: str, text: str, speaker: str = "A") -> StoredSegment:
    now = datetime.now(timezone.utc)
    return StoredSegment(
        _id="mongo_" + start,
        segment_id="seg-" + start,
        playlist_id=42,
        version_id=101,
        text=text,
        speaker=speaker,
        language="en",
        absolute_start_time=start,
        absolute_end_time=start,
        vexa_updated_at=None,
        created_at=now,
        updated_at=now,
    )


def _metadata(
    meeting_id: str = "m-abc", platform: str = "google_meet"
) -> PlaylistMetadata:
    return PlaylistMetadata(
        _id="meta-id",
        playlist_id=42,
        meeting_id=meeting_id,
        platform=platform,
    )


def _published(body_hash: str) -> PublishedTranscript:
    now = datetime.now(timezone.utc)
    return PublishedTranscript(
        _id="pt-id",
        playlist_id=42,
        version_id=101,
        meeting_id="m-abc",
        entity_type="CustomEntity01",
        entity_id=9001,
        author_email="user@test.com",
        body_hash=body_hash,
        segments_count=1,
        created_at=now,
        updated_at=now,
    )


class TestPublishTranscriptEndpoint:
    """Behavior tests for POST /playlists/{id}/publish-transcript."""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_storage(self):
        return mock.AsyncMock()

    @pytest.fixture
    def mock_prodtrack(self):
        p = mock.Mock()
        version = mock.Mock()
        # Real ShotgridProvider returns Version.project as a dict, not an
        # object; an attribute-style mock here would hide typos like
        # version.project.id.
        version.project = {"type": "Project", "id": 1}
        p.get_entity.return_value = version
        return p

    @pytest.fixture
    def override_deps(self, mock_storage, mock_prodtrack):
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_prodtrack
        yield
        app.dependency_overrides.clear()

    def test_flag_off_returns_404(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Feature flag off: the endpoint must not be reachable."""
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_ENABLE_TRANSCRIPT_PUBLISH", None)
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 404

    def test_happy_create_path(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """First publish: create the row and persist the bookkeeping."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "hello")
        ]
        mock_storage.get_published_transcript.return_value = None
        mock_prodtrack.publish_transcript.return_value = 9001

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "created"
        assert data["transcript_entity_id"] == 9001
        assert data["segments_count"] == 1

        mock_prodtrack.publish_transcript.assert_called_once()
        kwargs = mock_prodtrack.publish_transcript.call_args.kwargs
        assert kwargs["project_id"] == 1
        assert kwargs["playlist_id"] == 42
        assert kwargs["version_id"] == 101
        assert kwargs["meeting_id"] == "m-abc"
        assert kwargs["platform"] == "google_meet"
        assert "A: hello" in kwargs["body"]

        mock_storage.upsert_published_transcript.assert_awaited_once()

    def test_republish_same_body_skips(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Unchanged body_hash: don't call the provider, return skipped."""
        # Compute the body_hash the endpoint will produce so the fixture matches.
        from dna.transcription_publish import build_transcript_payload

        seg = _segment("2026-04-15T10:00:00Z", "hello")
        payload = build_transcript_payload([seg])

        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [seg]
        mock_storage.get_published_transcript.return_value = _published(
            payload.body_hash
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "skipped"
        assert data["transcript_entity_id"] == 9001
        mock_prodtrack.publish_transcript.assert_not_called()
        mock_prodtrack.update_transcript.assert_not_called()

    def test_republish_with_changes_updates(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Changed body_hash: update the existing entity_id rather than create."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "new content")
        ]
        mock_storage.get_published_transcript.return_value = _published("old-hash")
        mock_prodtrack.update_transcript.return_value = True

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "updated"
        assert data["transcript_entity_id"] == 9001

        mock_prodtrack.publish_transcript.assert_not_called()
        mock_prodtrack.update_transcript.assert_called_once()
        kwargs = mock_prodtrack.update_transcript.call_args.kwargs
        assert kwargs["entity_id"] == 9001
        assert "A: new content" in kwargs["body"]

    def test_missing_playlist_metadata_is_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_playlist_metadata.return_value = None

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 422

    def test_no_segments_is_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = []

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 422

    def test_mock_provider_returns_501(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Provider raises NotImplementedError → endpoint returns 501."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "hi")
        ]
        mock_storage.get_published_transcript.return_value = None
        mock_prodtrack.publish_transcript.side_effect = NotImplementedError(
            "Transcript publishing requires a live ShotGrid connection."
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 501
        assert "ShotGrid" in response.json()["detail"]

    def test_version_without_project_is_404(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "hi")
        ]
        mock_storage.get_published_transcript.return_value = None
        version = mock.Mock()
        version.project = None
        mock_prodtrack.get_entity.return_value = version

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 404

    def test_missing_version_returns_404(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """get_entity raises ValueError for an unknown version → mapped to 404."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "hi")
        ]
        mock_storage.get_published_transcript.return_value = None
        mock_prodtrack.get_entity.side_effect = ValueError(
            "Entity not found: version 101"
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 404

    def test_update_failure_does_not_advance_body_hash(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """On a False update result: raise, and don't persist the new body_hash."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "new content")
        ]
        mock_storage.get_published_transcript.return_value = _published("old-hash")
        mock_prodtrack.update_transcript.return_value = False

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 502
        mock_storage.upsert_published_transcript.assert_not_awaited()

    def test_metadata_without_platform_is_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Empty / None platform is rejected so we don't push an invalid value to SG."""
        mock_storage.get_playlist_metadata.return_value = _metadata(platform="")

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 422
        mock_prodtrack.publish_transcript.assert_not_called()

    def test_update_path_uses_stored_entity_type_not_current_env(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """After env changes, update must still target the originally-created entity type."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "changed")
        ]
        # Bookkeeping row was created against CustomEntity01.
        mock_storage.get_published_transcript.return_value = PublishedTranscript(
            _id="pt-id",
            playlist_id=42,
            version_id=101,
            meeting_id="m-abc",
            entity_type="CustomEntity01",
            entity_id=9001,
            author_email="user@test.com",
            body_hash="old-hash",
            segments_count=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        mock_prodtrack.update_transcript.return_value = True

        # Flip the env to CustomEntity05; id 9001 still belongs to CustomEntity01.
        with mock.patch.dict(
            os.environ,
            {**ENABLE_FLAG, "SHOTGRID_TRANSCRIPT_ENTITY": "CustomEntity05"},
        ):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 200
        kwargs = mock_prodtrack.update_transcript.call_args.kwargs
        # Must target the original CustomEntity01, ignoring the new env value.
        assert kwargs.get("entity_type") == "CustomEntity01"

    def test_all_segments_whitespace_is_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """Segments exist but are all whitespace; once build filters them out, refuse to publish."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "   "),
            _segment("2026-04-15T10:00:05Z", ""),
        ]

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 422
        mock_prodtrack.publish_transcript.assert_not_called()
        mock_prodtrack.update_transcript.assert_not_called()

    def test_bookkeeping_failure_after_sg_create_is_surfaced(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """SG create succeeded but Mongo upsert failed: surface 500 with the
        entity_id so an operator can reconcile, and signal no blind retry."""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "hi")
        ]
        mock_storage.get_published_transcript.return_value = None
        mock_prodtrack.publish_transcript.return_value = 9001
        mock_storage.upsert_published_transcript.side_effect = RuntimeError(
            "mongo connection lost"
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            response = client.post(
                "/playlists/42/publish-transcript",
                json={"version_id": 101},
            )

        assert response.status_code == 500
        # entity_id must be in the message so the operator can find the SG row.
        assert "9001" in response.json()["detail"]
