"""Tests for Chrome extension WebSocket endpoint."""

import asyncio
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    get_storage_provider_cached,
    get_transcription_provider_cached,
    get_transcription_service_cached,
)
from starlette.websockets import WebSocketDisconnect

from dna.events import get_event_publisher, reset_event_publisher
from dna.models.playlist_metadata import PlaylistMetadata
from dna.transcription_service import (
    get_transcription_service,
    reset_transcription_service,
)


def _init_transcription_service(mock_storage) -> None:
    service = get_transcription_service()
    service.transcription_provider = get_transcription_provider_cached()
    service.storage_provider = mock_storage
    service.event_publisher = get_event_publisher()


@pytest.fixture(autouse=True)
def reset_singletons():
    reset_event_publisher()
    reset_transcription_service()
    get_transcription_provider_cached.cache_clear()
    get_storage_provider_cached.cache_clear()
    yield
    reset_event_publisher()
    reset_transcription_service()
    get_transcription_provider_cached.cache_clear()
    get_storage_provider_cached.cache_clear()


@pytest.fixture
def mock_storage():
    storage = mock.AsyncMock()
    storage.upsert_playlist_metadata = mock.AsyncMock()
    storage.get_playlist_metadata = mock.AsyncMock(
        return_value=PlaylistMetadata(
            _id="meta-42",
            playlist_id=42,
            in_review=7,
            meeting_id="abc-def-ghi",
            platform="google_meet",
        )
    )
    storage.get_playlist_metadata_by_meeting_id = mock.AsyncMock(
        return_value=PlaylistMetadata(
            _id="meta-42",
            playlist_id=42,
            in_review=7,
            meeting_id="abc-def-ghi",
            platform="google_meet",
        )
    )
    storage.upsert_segment = mock.AsyncMock()
    storage.ensure_indexes = mock.AsyncMock()
    return storage


@pytest.fixture
def browser_extension_client(mock_storage, monkeypatch):
    monkeypatch.setattr(
        "dna.storage_providers.storage_provider_base.get_storage_provider",
        lambda: mock_storage,
    )

    async def fast_startup():
        _init_transcription_service(mock_storage)

    async def fast_shutdown():
        pass

    monkeypatch.setattr("main.startup_event", fast_startup)
    monkeypatch.setattr("main.shutdown_event", fast_shutdown)

    with mock.patch.dict("os.environ", {"TRANSCRIPTION_PROVIDER": "browser_extension"}):
        get_transcription_provider_cached.cache_clear()
        get_storage_provider_cached.cache_clear()
        reset_transcription_service()
        _init_transcription_service(mock_storage)
        service = get_transcription_service()

        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_transcription_service_cached] = lambda: service

        client = TestClient(app, raise_server_exceptions=True)
        yield client, mock_storage

        app.dependency_overrides.clear()


@pytest.fixture
def auth_token():
    return "test@example.com"


class TestExtensionWebSocketAuth:
    """Tests for extension WebSocket authentication."""

    def test_rejects_connection_without_token(self, browser_extension_client):
        client, _ = browser_extension_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/transcription/extension/ws"):
                pass

    def test_accepts_connection_with_bearer_header(
        self, browser_extension_client, auth_token
    ):
        client, _ = browser_extension_client
        with client.websocket_connect(
            "/transcription/extension/ws",
            headers={"Authorization": f"Bearer {auth_token}"},
        ):
            pass

    def test_accepts_connection_with_query_token(
        self, browser_extension_client, auth_token
    ):
        client, _ = browser_extension_client
        with client.websocket_connect(
            f"/transcription/extension/ws?token={auth_token}"
        ):
            pass


class TestExtensionWebSocketRegister:
    """Tests for extension registration flow."""

    def test_register_binds_session(self, browser_extension_client, auth_token):
        client, _ = browser_extension_client

        dispatch_response = client.post(
            "/transcription/bot",
            json={
                "platform": "google_meet",
                "meeting_id": "abc-def-ghi",
                "playlist_id": 42,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert dispatch_response.status_code == 201

        with client.websocket_connect(
            "/transcription/extension/ws",
            headers={"Authorization": f"Bearer {auth_token}"},
        ) as websocket:
            websocket.send_json(
                {
                    "action": "register",
                    "platform": "google_meet",
                    "meeting_id": "abc-def-ghi",
                }
            )
            response = websocket.receive_json()
            assert response["type"] == "registered"
            assert response["session_id"] == 1
            assert response["playlist_id"] == 42

    def test_register_unknown_session_returns_error(
        self, browser_extension_client, auth_token
    ):
        client, _ = browser_extension_client
        with client.websocket_connect(
            "/transcription/extension/ws",
            headers={"Authorization": f"Bearer {auth_token}"},
        ) as websocket:
            websocket.send_json(
                {
                    "action": "register",
                    "platform": "google_meet",
                    "meeting_id": "unknown-meeting",
                }
            )
            response = websocket.receive_json()
            assert response["type"] == "error"


class TestExtensionWebSocketTranscript:
    """Tests for transcript forwarding through TranscriptionService."""

    def test_transcript_broadcasts_to_frontend_ws(
        self, browser_extension_client, auth_token
    ):
        client, mock_storage = browser_extension_client

        client.post(
            "/transcription/bot",
            json={
                "platform": "google_meet",
                "meeting_id": "abc-def-ghi",
                "playlist_id": 42,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        with client.websocket_connect("/ws") as frontend_ws:
            with client.websocket_connect(
                "/transcription/extension/ws",
                headers={"Authorization": f"Bearer {auth_token}"},
            ) as ext_ws:
                ext_ws.send_json(
                    {
                        "action": "register",
                        "platform": "google_meet",
                        "meeting_id": "abc-def-ghi",
                    }
                )
                ext_ws.receive_json()

                ext_ws.send_json(
                    {
                        "type": "transcript",
                        "speaker": "Alice",
                        "confirmed": [
                            {
                                "segment_id": "sess:speaker-0:1",
                                "text": "hello world",
                                "absolute_start_time": "2026-04-20T19:00:00.000Z",
                                "absolute_end_time": "2026-04-20T19:00:01.000Z",
                            }
                        ],
                        "pending": [],
                        "ts": "2026-04-20T19:00:00.000Z",
                    }
                )

                data = frontend_ws.receive_json()
                assert data["type"] == "transcript"
                assert data["speaker"] == "Alice"
                assert data["playlist_id"] == 42
                assert data["version_id"] == 7
                assert len(data["confirmed"]) == 1

        mock_storage.upsert_segment.assert_called_once()
