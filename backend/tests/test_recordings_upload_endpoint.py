"""Tests for POST /api/recordings/upload.

ffmpeg is stubbed so these stay fast and don't need a real video; the actual
ffmpeg cut/thumbnail path is exercised in test_video_render.py.
"""

import os
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

import main
import pytest
from fastapi.testclient import TestClient
from main import app, get_storage_provider_cached

from dna.models.playlist_metadata import PlaylistMetadata
from dna.models.stored_segment import StoredSegment

ENABLE_ENV = {
    "DNA_ENABLE_VIDEO_SEGMENT_PUBLISH": "true",
    "ZOOM_RECORDING_TIMEZONE": "America/New_York",
}

# Folder name -> recording_t0 = 2026-05-27T10:44:49Z (EDT, UTC-4).
FOLDER = "2026-05-27 06.44.49 Cameron Target's Zoom Meeting"
T0 = datetime(2026, 5, 27, 10, 44, 49, tzinfo=timezone.utc)


def _segment(
    *, version_id: int, segment_id: str, start: str, end: str
) -> StoredSegment:
    now = datetime.now(timezone.utc)
    return StoredSegment(
        _id="mongo_" + segment_id,
        segment_id=segment_id,
        playlist_id=42,
        version_id=version_id,
        text="hello",
        speaker="A",
        language="en",
        absolute_start_time=start,
        absolute_end_time=end,
        vexa_updated_at=None,
        created_at=now,
        updated_at=now,
    )


def _metadata() -> PlaylistMetadata:
    return PlaylistMetadata(
        _id="meta", playlist_id=42, meeting_id="m-abc", platform="zoom"
    )


# Meeting ended at 11:00:00Z; with a 3600s recording, t0 works back to 10:00:00Z.
ENDED_AT = datetime(2026, 5, 27, 11, 0, 0, tzinfo=timezone.utc)
MEETING_END_T0 = datetime(2026, 5, 27, 10, 0, 0, tzinfo=timezone.utc)


def _metadata_with_end() -> PlaylistMetadata:
    return PlaylistMetadata(
        _id="meta",
        playlist_id=42,
        meeting_id="m-abc",
        platform="google_meet",
        transcription_ended_at=ENDED_AT,
    )


def _fake_render(source, dest, *, start_seconds, end_seconds):
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    Path(dest).write_bytes(b"fake-clip")


def _fake_thumb(source, dest, *, at_seconds=0.0):
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    Path(dest).write_bytes(b"fake-jpg")


class TestUploadRecordingEndpoint:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_storage(self):
        s = mock.AsyncMock()
        s.get_playlist_metadata.return_value = _metadata()
        return s

    @pytest.fixture
    def override_deps(self, mock_storage):
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        yield
        app.dependency_overrides.clear()

    @pytest.fixture
    def store_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(main, "ATTACHMENT_STORE_DIR", tmp_path)
        return tmp_path

    @pytest.fixture
    def stub_ffmpeg(self, monkeypatch):
        monkeypatch.setattr(main, "probe_duration_seconds", lambda *_a, **_k: 3600.0)
        monkeypatch.setattr(main, "render_clip", _fake_render)
        monkeypatch.setattr(main, "extract_thumbnail", _fake_thumb)

    def _post(self, client):
        return client.post(
            "/api/recordings/upload",
            files={"file": ("zoom_0.mp4", b"not-a-real-video", "video/mp4")},
            data={"playlist_id": "42", "folder_name": FOLDER},
        )

    def test_flag_off_returns_404(self, client, override_deps, store_dir, stub_ffmpeg):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_ENABLE_VIDEO_SEGMENT_PUBLISH", None)
            resp = self._post(client)
        assert resp.status_code == 404

    def test_happy_path_renders_one_clip_per_cut(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        # v10: one run (1 cut). v20: two runs split by a 2-min gap (2 cuts).
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="a",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:10Z",
            ),
            _segment(
                version_id=20,
                segment_id="b",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:05Z",
            ),
            _segment(
                version_id=20,
                segment_id="c",
                start="2026-05-27T10:52:00Z",
                end="2026-05-27T10:52:05Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["recording_id"]
        clips = body["clips"]
        assert len(clips) == 3
        # one clip for v10, two for v20
        by_version = {}
        for c in clips:
            by_version.setdefault(c["version_id"], []).append(c)
        assert len(by_version[10]) == 1
        assert len(by_version[20]) == 2
        # v10 cut: 10:50:00 - 10:44:49 = 311s in, 321s out.
        v10 = by_version[10][0]
        assert v10["video_in_seconds"] == pytest.approx(311.0)
        assert v10["video_out_seconds"] == pytest.approx(321.0)
        assert v10["duration_seconds"] == pytest.approx(10.0)

    def test_source_and_clip_and_thumb_files_persisted(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="a",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:10Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 200
        body = resp.json()
        recording_id = body["recording_id"]
        clip = body["clips"][0]

        assert (store_dir / recording_id / "source.mp4").exists()
        clip_dir = store_dir / clip["clip_id"]
        assert clip_dir.exists() and any(clip_dir.iterdir())
        assert (store_dir / clip["thumb_id"] / "thumb.jpg").exists()

    def test_persists_recording_with_t0_and_clips(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="a",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:10Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 200
        mock_storage.create_meeting_recording.assert_awaited_once()
        saved = mock_storage.create_meeting_recording.call_args.args[0]
        assert saved.recording_t0 == T0
        assert saved.meeting_id == "m-abc"
        assert saved.duration_seconds == 3600.0
        assert len(saved.clips) == 1
        assert saved.clips[0].version_id == 10
        assert saved.clips[0].transcript_segment_ids == ["a"]
        assert saved.clips[0].body_hash

    def test_out_of_bounds_run_is_dropped(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        # v10 has one run before t0 (dropped) and one inside (kept) -> 1 clip.
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="early",
                start="2026-05-27T09:00:00Z",
                end="2026-05-27T09:00:10Z",
            ),
            _segment(
                version_id=10,
                segment_id="ok",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:10Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 200
        clips = resp.json()["clips"]
        assert len(clips) == 1

    def test_no_segments_returns_422_and_cleans_up(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        mock_storage.get_segments_for_playlist.return_value = []

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 422
        assert "nothing to render" in resp.json()["detail"].lower()
        mock_storage.create_meeting_recording.assert_not_called()
        # Source dir for the aborted recording was removed.
        assert list(store_dir.iterdir()) == []

    def test_all_segments_out_of_bounds_returns_422(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="a",
                start="2026-05-27T09:00:00Z",
                end="2026-05-27T09:00:10Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 422

    def test_unparseable_folder_name_returns_422(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = client.post(
                "/api/recordings/upload",
                files={"file": ("zoom_0.mp4", b"x", "video/mp4")},
                data={"playlist_id": "42", "folder_name": "not a zoom folder"},
            )

        assert resp.status_code == 422
        mock_storage.get_segments_for_playlist.assert_not_called()

    def test_probe_failure_returns_422_and_cleans_up(
        self, client, mock_storage, override_deps, store_dir, monkeypatch
    ):
        from dna.video_render import FfmpegError

        def _boom(*_a, **_k):
            raise FfmpegError("bad video")

        monkeypatch.setattr(main, "probe_duration_seconds", _boom)

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = self._post(client)

        assert resp.status_code == 422
        assert list(store_dir.iterdir()) == []

    def test_uses_meeting_end_anchor_without_folder_name(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        mock_storage.get_playlist_metadata.return_value = _metadata_with_end()
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="a",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:10Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = client.post(
                "/api/recordings/upload",
                files={"file": ("meet.mp4", b"x", "video/mp4")},
                data={"playlist_id": "42"},  # no folder_name
            )

        assert resp.status_code == 200, resp.text
        saved = mock_storage.create_meeting_recording.call_args.args[0]
        assert saved.recording_t0_source == "meeting_end"
        assert saved.recording_t0 == MEETING_END_T0
        # 10:50:00 - 10:00:00 = 3000s in.
        assert saved.clips[0].video_in_seconds == pytest.approx(3000.0)

    def test_offset_seconds_shifts_t0(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        mock_storage.get_playlist_metadata.return_value = _metadata_with_end()
        mock_storage.get_segments_for_playlist.return_value = [
            _segment(
                version_id=10,
                segment_id="a",
                start="2026-05-27T10:50:00Z",
                end="2026-05-27T10:50:10Z",
            ),
        ]

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = client.post(
                "/api/recordings/upload",
                files={"file": ("meet.mp4", b"x", "video/mp4")},
                data={"playlist_id": "42", "offset_seconds": "5"},
            )

        assert resp.status_code == 200
        saved = mock_storage.create_meeting_recording.call_args.args[0]
        # t0 shifted 5s later -> segment offset 5s smaller.
        assert saved.recording_t0 == datetime(
            2026, 5, 27, 10, 0, 5, tzinfo=timezone.utc
        )
        assert saved.clips[0].video_in_seconds == pytest.approx(2995.0)

    def test_no_anchor_returns_422(
        self, client, mock_storage, override_deps, store_dir, stub_ffmpeg
    ):
        # No meeting end recorded and no folder name -> cannot align.
        mock_storage.get_playlist_metadata.return_value = _metadata()

        with mock.patch.dict(os.environ, ENABLE_ENV):
            resp = client.post(
                "/api/recordings/upload",
                files={"file": ("meet.mp4", b"x", "video/mp4")},
                data={"playlist_id": "42"},
            )

        assert resp.status_code == 422
        assert "align" in resp.json()["detail"].lower()
        assert list(store_dir.iterdir()) == []
