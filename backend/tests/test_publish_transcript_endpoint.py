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
        sg_entity_type="CustomEntity01",
        sg_entity_id=9001,
        author_email="user@test.com",
        body_hash=body_hash,
        segments_count=1,
        created_at=now,
        updated_at=now,
    )


class TestPublishTranscriptEndpoint:
    """POST /playlists/{id}/publish-transcript 行為測試。"""

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
        # 真實的 ShotgridProvider 回來的 Version.project 是 dict，不是物件。
        # 用物件 mock 會把下面 version.project.id 這種筆誤藏起來。
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
        """沒開 feature flag 時必須 404。這個 endpoint 不該露出來。"""
        # 完全不帶 DNA_ENABLE_TRANSCRIPT_PUBLISH
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
        """第一次推上去要 create，並且把 bookkeeping 寫回 storage。"""
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
        """body_hash 沒變就不要打 SG，回 skipped。"""
        # 先跑一次拿到 body_hash
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
        """body_hash 不同要走 update，並且沿用既有的 sg_entity_id。"""
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
        """用 mock prodtrack 時 provider 會丟 NotImplementedError，我們回 501。"""
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
        # version 沒有 project 的情況（通常是資料壞了）
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
        """get_entity 對不存在的 version 會 raise ValueError，要接住轉成 404。"""
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
        """update_transcript 回傳 False 時要報錯，且不能把新 body_hash 存起來。"""
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
        """platform 為 None / 空字串時拒絕，避免把空值丟到 SG 的 list field。"""
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
        """env var 改過以後，update 仍然要打到**原本** create 它那個 entity type。"""
        mock_storage.get_playlist_metadata.return_value = _metadata()
        mock_storage.get_segments_for_version.return_value = [
            _segment("2026-04-15T10:00:00Z", "changed")
        ]
        # 原本是在 CustomEntity01 那邊 create 的
        mock_storage.get_published_transcript.return_value = PublishedTranscript(
            _id="pt-id",
            playlist_id=42,
            version_id=101,
            meeting_id="m-abc",
            sg_entity_type="CustomEntity01",
            sg_entity_id=9001,
            author_email="user@test.com",
            body_hash="old-hash",
            segments_count=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        mock_prodtrack.update_transcript.return_value = True

        # 現在 env 被改成 CustomEntity05，但 9001 還是屬於 CustomEntity01
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
        # 必須指定原本的 CustomEntity01，不能跟著 env 走
        assert kwargs.get("entity_type") == "CustomEntity01"

    def test_all_segments_whitespace_is_422(
        self, client, mock_storage, mock_prodtrack, override_deps
    ):
        """通過原始 segments 的空檢查，但 build 完全被過濾掉 → 不該 publish 空 row。"""
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
        """SG 已經 create 但 Mongo upsert 爆炸時要 surface 500，並帶 entity_id
        讓 operator 知道 SG 側有 orphan 要善後，下次請求不可直接重試。"""
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
        # entity_id 必須在錯誤訊息裡，operator 才能去 SG 手動刪除
        assert "9001" in response.json()["detail"]
