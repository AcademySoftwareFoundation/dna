"""Tests for the browser-extension transcription endpoints.

Covers:
- GET /transcription/extension/health (handshake, feature-flag gate)
- WS  /transcription/extension/ingest (auth, handshake, ingest, acks)
- helper functions _extension_transcription_enabled / _authenticate_ws_token
"""

import os
from unittest import mock

import main
import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from main import app

from dna.events import get_event_publisher, reset_event_publisher
from dna.models.playlist_metadata import PlaylistMetadata
from dna.transcription_service import (
    get_transcription_service,
    reset_transcription_service,
)

ENABLE = {"DNA_ENABLE_EXTENSION_TRANSCRIPTION": "true"}


def _seg(**overrides):
    seg = {
        "segment_id": "ext:speaker-0:1",
        "text": "hello from extension",
        "speaker": "Alice",
        "language": "en",
        "start_time": 0.0,
        "end_time": 1.0,
        "absolute_start_time": "2026-04-20T19:00:00.000Z",
        "absolute_end_time": "2026-04-20T19:00:01.000Z",
        "updated_at": "2026-04-20T19:00:01.500Z",
    }
    seg.update(overrides)
    return seg


class TestExtensionHealthEndpoint:
    def setup_method(self):
        self.client = TestClient(app)

    def test_health_404_when_disabled(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_ENABLE_EXTENSION_TRANSCRIPTION", None)
            resp = self.client.get("/transcription/extension/health")
        assert resp.status_code == 404

    def test_health_ok_when_enabled(self):
        with mock.patch.dict(os.environ, ENABLE):
            resp = self.client.get("/transcription/extension/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "enabled": True}


class TestExtensionIngestWebSocket:
    def setup_method(self):
        reset_event_publisher()
        reset_transcription_service()

    def teardown_method(self):
        reset_event_publisher()
        reset_transcription_service()

    def _prepare_service(self, metadata):
        svc = get_transcription_service()
        svc.event_publisher = get_event_publisher()
        storage = mock.AsyncMock()
        storage.get_playlist_metadata.return_value = metadata
        storage.upsert_segment = mock.AsyncMock()
        svc.storage_provider = storage
        return svc, storage

    def test_disabled_closes_connection(self):
        client = TestClient(app)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_ENABLE_EXTENSION_TRANSCRIPTION", None)
            with pytest.raises(WebSocketDisconnect):
                with client.websocket_connect("/transcription/extension/ingest") as ws:
                    ws.receive_json()

    def test_connect_sends_handshake_and_acks_and_broadcasts(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        _, storage = self._prepare_service(metadata)
        client = TestClient(app)

        with mock.patch.dict(os.environ, ENABLE):
            with client.websocket_connect("/ws") as ws_broadcast:
                with client.websocket_connect(
                    "/transcription/extension/ingest?token=user@test.com"
                ) as ingest:
                    hello = ingest.receive_json()
                    assert hello["type"] == "connected"
                    assert hello["user"] == "user@test.com"

                    ingest.send_json(
                        {
                            "type": "transcript",
                            "playlist_id": 42,
                            "speaker": "Alice",
                            "confirmed": [_seg()],
                            "pending": [],
                            "ts": "2026-04-20T19:00:00.000Z",
                        }
                    )
                    ack = ingest.receive_json()
                    assert ack["type"] == "ack"
                    assert ack["stored"] == 1

                    broadcast = ws_broadcast.receive_json()
                    assert broadcast["type"] == "transcript"
                    assert broadcast["playlist_id"] == 42
                    assert broadcast["version_id"] == 7

        storage.upsert_segment.assert_awaited_once()

    def test_ping_pong(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        self._prepare_service(metadata)
        client = TestClient(app)

        with mock.patch.dict(os.environ, ENABLE):
            with client.websocket_connect("/transcription/extension/ingest") as ingest:
                ingest.receive_json()  # connected
                ingest.send_json({"type": "ping", "ts": "t1"})
                pong = ingest.receive_json()
                assert pong == {"type": "pong", "ts": "t1"}

    def test_unknown_type_and_invalid_messages(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        self._prepare_service(metadata)
        client = TestClient(app)

        with mock.patch.dict(os.environ, ENABLE):
            with client.websocket_connect("/transcription/extension/ingest") as ingest:
                ingest.receive_json()  # connected

                ingest.send_json({"type": "nope"})
                assert ingest.receive_json()["error"] == "unknown_type"

                ingest.send_json([1, 2, 3])
                assert ingest.receive_json()["error"] == "invalid_message"

                ingest.send_text("not-json")
                assert ingest.receive_json()["error"] == "invalid_json"

    def test_missing_key_closes_when_key_required(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        self._prepare_service(metadata)
        client = TestClient(app)
        with mock.patch.dict(os.environ, {**ENABLE, "DNA_EXTENSION_KEY": "secret"}):
            with pytest.raises(WebSocketDisconnect):
                with client.websocket_connect(
                    "/transcription/extension/ingest?token=user@test.com"
                ) as ingest:
                    ingest.receive_json()

    def test_wrong_key_closes_when_key_required(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        self._prepare_service(metadata)
        client = TestClient(app)
        with mock.patch.dict(os.environ, {**ENABLE, "DNA_EXTENSION_KEY": "secret"}):
            with pytest.raises(WebSocketDisconnect):
                with client.websocket_connect(
                    "/transcription/extension/ingest?token=user@test.com&key=nope"
                ) as ingest:
                    ingest.receive_json()

    def test_correct_key_connects_when_key_required(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        self._prepare_service(metadata)
        client = TestClient(app)
        with mock.patch.dict(os.environ, {**ENABLE, "DNA_EXTENSION_KEY": "secret"}):
            with client.websocket_connect(
                "/transcription/extension/ingest?token=user@test.com&key=secret"
            ) as ingest:
                hello = ingest.receive_json()
                assert hello["type"] == "connected"

    def test_ingest_error_is_reported(self):
        metadata = PlaylistMetadata(_id="m", playlist_id=42, in_review=7)
        svc, storage = self._prepare_service(metadata)
        storage.upsert_segment.side_effect = None
        # Force the service call to raise.
        svc.ingest_extension_transcript = mock.AsyncMock(
            side_effect=RuntimeError("boom")
        )
        client = TestClient(app)

        with mock.patch.dict(os.environ, ENABLE):
            with client.websocket_connect("/transcription/extension/ingest") as ingest:
                ingest.receive_json()  # connected
                ingest.send_json({"type": "transcript", "playlist_id": 42})
                err = ingest.receive_json()
                assert err["type"] == "error"
                assert "boom" in err["error"]


class TestExtensionHelpers:
    def test_enabled_flag(self):
        with mock.patch.dict(os.environ, ENABLE):
            assert main._extension_transcription_enabled() is True
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_ENABLE_EXTENSION_TRANSCRIPTION", None)
            assert main._extension_transcription_enabled() is False

    def test_extension_key_valid_no_env_allows_any(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DNA_EXTENSION_KEY", None)
            assert main._extension_key_valid(None) is True
            assert main._extension_key_valid("whatever") is True

    def test_extension_key_valid_enforced_when_set(self):
        with mock.patch.dict(os.environ, {"DNA_EXTENSION_KEY": "secret"}):
            assert main._extension_key_valid("secret") is True
            assert main._extension_key_valid("nope") is False
            assert main._extension_key_valid(None) is False

    def test_auth_none_without_token_is_anonymous(self):
        with mock.patch.dict(os.environ, {"AUTH_PROVIDER": "none"}):
            assert main._authenticate_ws_token(None) == "anonymous@localhost"

    def test_auth_none_with_token_uses_provider_email(self):
        provider = mock.Mock()
        provider.get_user_email.return_value = "who@test.com"
        with (
            mock.patch.dict(os.environ, {"AUTH_PROVIDER": "none"}),
            mock.patch.object(main, "get_auth_provider_cached", return_value=provider),
        ):
            assert main._authenticate_ws_token("tok") == "who@test.com"

    def test_auth_google_valid_token(self):
        provider = mock.Mock()
        provider.validate_token.return_value = {"email": "g@test.com"}
        with (
            mock.patch.dict(os.environ, {"AUTH_PROVIDER": "google"}),
            mock.patch.object(main, "get_auth_provider_cached", return_value=provider),
        ):
            assert main._authenticate_ws_token("tok") == "g@test.com"

    def test_auth_google_missing_token(self):
        provider = mock.Mock()
        with (
            mock.patch.dict(os.environ, {"AUTH_PROVIDER": "google"}),
            mock.patch.object(main, "get_auth_provider_cached", return_value=provider),
        ):
            assert main._authenticate_ws_token(None) is None

    def test_auth_google_invalid_token(self):
        provider = mock.Mock()
        provider.validate_token.side_effect = ValueError("bad token")
        with (
            mock.patch.dict(os.environ, {"AUTH_PROVIDER": "google"}),
            mock.patch.object(main, "get_auth_provider_cached", return_value=provider),
        ):
            assert main._authenticate_ws_token("tok") is None

    def test_auth_google_missing_email_claim(self):
        provider = mock.Mock()
        provider.validate_token.return_value = {"sub": "123"}
        with (
            mock.patch.dict(os.environ, {"AUTH_PROVIDER": "google"}),
            mock.patch.object(main, "get_auth_provider_cached", return_value=provider),
        ):
            assert main._authenticate_ws_token("tok") is None
