"""Tests for POST /playlists/{id}/publish-video-segments."""

import os
from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_prodtrack_provider_cached, get_storage_provider_cached

from dna.models.meeting_recording import MeetingRecording, RecordingClip
from dna.models.playlist_metadata import PlaylistMetadata
from dna.models.published_video_segments import PublishedVideoSegments

ENABLE_FLAG = {"DNA_ENABLE_VIDEO_SEGMENT_PUBLISH": "true"}
BODY_HASH = "hash-v101"


def _clip(version_id: int = 101, body_hash: str = BODY_HASH) -> RecordingClip:
    return RecordingClip(
        clip_id="clip-uuid",
        version_id=version_id,
        thumb_id="thumb-uuid",
        filename="clip-v101-0.mp4",
        duration_seconds=10.0,
        video_in_seconds=300.0,
        video_out_seconds=310.0,
        transcript_segment_ids=["a"],
        body_hash=body_hash,
    )


def _recording(
    *,
    recording_id: str = "rec-1",
    playlist_id: int = 42,
    meeting_id: str = "m-abc",
    clips=None,
) -> MeetingRecording:
    return MeetingRecording(
        _id="rec-mongo",
        recording_id=recording_id,
        playlist_id=playlist_id,
        meeting_id=meeting_id,
        folder_name="2026-05-27 06.44.49 Meeting",
        recording_t0=datetime(2026, 5, 27, 10, 44, 49, tzinfo=timezone.utc),
        duration_seconds=3600.0,
        clips=[_clip()] if clips is None else clips,
        created_at=datetime.now(timezone.utc),
    )


def _metadata(platform: str = "zoom") -> PlaylistMetadata:
    return PlaylistMetadata(
        _id="meta", playlist_id=42, meeting_id="m-abc", platform=platform
    )


def _published(
    body_hash: str, entity_type: str = "CustomEntity14"
) -> PublishedVideoSegments:
    now = datetime.now(timezone.utc)
    return PublishedVideoSegments(
        _id="pvs-id",
        playlist_id=42,
        version_id=101,
        meeting_id="m-abc",
        recording_id="rec-1",
        entity_type=entity_type,
        entity_id=7000,
        author_email="user@test.com",
        body_hash=body_hash,
        clips_count=1,
        created_at=now,
        updated_at=now,
    )


class TestPublishVideoSegmentsEndpoint:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_storage(self):
        s = mock.AsyncMock()
        s.get_meeting_recording.return_value = _recording()
        s.get_playlist_metadata.return_value = _metadata()
        s.get_published_video_segments.return_value = None
        return s

    @pytest.fixture
    def mock_prodtrack(self):
        p = mock.Mock()
        version = mock.Mock()
        version.project = {"type": "Project", "id": 1}
        p.get_entity.return_value = version
        p.publish_video_segments.return_value = 7000
        p.update_video_segments.return_value = True
        return p

    @pytest.fixture
    def override_deps(self, mock_storage, mock_prodtrack):
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_prodtrack
        yield
        app.dependency_overrides.clear()

    def _post(self, client):
        return client.post(
            "/playlists/42/publish-video-segments",
            json={"version_id": 101, "recording_id": "rec-1"},
        )

    def test_flag_off_returns_404(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_ENABLE_VIDEO_SEGMENT_PUBLISH", None)
            resp = self._post(client)
        assert resp.status_code == 404

    def test_happy_create_path(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["outcome"] == "created"
        assert data["video_segment_entity_id"] == 7000
        assert data["clips_count"] == 1

        mock_prodtrack.publish_video_segments.assert_called_once()
        kwargs = mock_prodtrack.publish_video_segments.call_args.kwargs
        assert kwargs["project_id"] == 1
        assert kwargs["playlist_id"] == 42
        assert kwargs["version_id"] == 101
        assert kwargs["meeting_id"] == "m-abc"
        assert kwargs["platform"] == "zoom"
        assert str(kwargs["meeting_date"]) == "2026-05-27"
        assert len(kwargs["clips"]) == 1
        assert kwargs["clips"][0].file_path.endswith("clip-uuid/clip-v101-0.mp4")

        mock_storage.upsert_published_video_segments.assert_awaited_once()
        saved = mock_storage.upsert_published_video_segments.call_args.args[0]
        assert saved.entity_id == 7000
        assert saved.entity_type == "CustomEntity14"
        assert saved.body_hash == BODY_HASH
        assert saved.recording_id == "rec-1"

    def test_republish_same_body_skips(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_published_video_segments.return_value = _published(BODY_HASH)

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 200
        data = resp.json()
        assert data["outcome"] == "skipped"
        assert data["video_segment_entity_id"] == 7000
        mock_prodtrack.publish_video_segments.assert_not_called()
        mock_prodtrack.update_video_segments.assert_not_called()
        mock_storage.upsert_published_video_segments.assert_not_called()

    def test_update_path_when_body_changed(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        # Existing row created in a different slot, with a stale hash.
        mock_storage.get_published_video_segments.return_value = _published(
            "stale-hash", entity_type="CustomEntity09"
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 200
        assert resp.json()["outcome"] == "updated"
        mock_prodtrack.update_video_segments.assert_called_once()
        kwargs = mock_prodtrack.update_video_segments.call_args.kwargs
        # entity_type pinned to the bookkeeping row, not env/default.
        assert kwargs["entity_type"] == "CustomEntity09"
        assert kwargs["entity_id"] == 7000
        saved = mock_storage.upsert_published_video_segments.call_args.args[0]
        assert saved.entity_type == "CustomEntity09"

    def test_update_failure_returns_502_and_skips_bookkeeping(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_published_video_segments.return_value = _published("stale")
        mock_prodtrack.update_video_segments.return_value = False

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 502
        mock_storage.upsert_published_video_segments.assert_not_called()

    def test_missing_recording_returns_404(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_meeting_recording.return_value = None

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 404

    def test_recording_for_other_playlist_returns_404(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_meeting_recording.return_value = _recording(playlist_id=999)

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 404

    def test_no_clips_for_version_returns_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_meeting_recording.return_value = _recording(
            clips=[_clip(version_id=202)]
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 422
        assert "nothing to publish" in resp.json()["detail"].lower()

    def test_no_platform_returns_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.get_playlist_metadata.return_value = _metadata(platform="")

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 422

    def test_mock_provider_returns_501(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_prodtrack.publish_video_segments.side_effect = NotImplementedError(
            "Video segment publishing requires a live ShotGrid connection."
        )

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 501
        assert "live ShotGrid connection" in resp.json()["detail"]

    def test_bookkeeping_failure_after_sg_create_returns_500(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        mock_storage.upsert_published_video_segments.side_effect = Exception("db down")

        with mock.patch.dict(os.environ, ENABLE_FLAG):
            resp = self._post(client)

        assert resp.status_code == 500
        # SG entity id surfaced so an operator can reconcile the duplicate risk.
        assert "7000" in resp.json()["detail"]
