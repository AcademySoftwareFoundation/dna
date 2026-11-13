"""Tests for DNA Session API routes and helpers."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_session_provider_cached, get_storage_provider_cached

from dna.events import EventType, reset_event_publisher
from dna.models.session import ExternalSession, Session
from dna.session_providers.mock_session_provider import MockSessionProvider
from dna.session_service import (
    ensure_implicit_session_for_playlist,
    ensure_session_for_external,
    sync_project_sessions,
)

client = TestClient(app)

SESSION_ID = "507f1f77bcf86cd799439011"


def make_session(**overrides) -> Session:
    data = {
        "_id": SESSION_ID,
        "external_id": None,
        "project_id": "124",
        "name": "Morning dailies",
        "playlist_ids": ["45"],
        "in_review_playlist_id": None,
        "in_review_version_id": None,
        "in_review_pinned": False,
        "meeting_id": None,
        "platform": None,
        "vexa_meeting_id": None,
        "transcription_paused": False,
        "transcription_resumed_at": None,
    }
    data.update(overrides)
    return Session(**data)


class TestSessionRoutes:
    """Session-first CRUD and ensure/in-review/transcription routes."""

    def teardown_method(self):
        reset_event_publisher()
        app.dependency_overrides.clear()

    def test_list_sessions_without_provider_reads_storage(self):
        storage = mock.AsyncMock()
        storage.get_sessions_for_project.return_value = [
            make_session(name="Local only")
        ]
        app.dependency_overrides[get_session_provider_cached] = lambda: None
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.get("/projects/124/sessions")

        assert response.status_code == 200
        assert response.json()[0]["name"] == "Local only"
        storage.get_sessions_for_project.assert_awaited_once_with("124")

    def test_list_sessions_syncs_external_catalog(self):
        provider = MockSessionProvider()
        storage = mock.AsyncMock()
        storage.get_session_by_external_id.return_value = None
        created = make_session(
            external_id="mock-session-1", name="Morning dailies", playlist_ids=[]
        )
        storage.create_session.return_value = created
        storage.get_sessions_for_project.return_value = [created]
        app.dependency_overrides[get_session_provider_cached] = lambda: provider
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.get("/projects/124/sessions")

        assert response.status_code == 200
        assert storage.create_session.await_count >= 1
        storage.get_sessions_for_project.assert_awaited_once_with("124")

    def test_create_session_via_provider(self):
        provider = MockSessionProvider()
        storage = mock.AsyncMock()
        storage.get_session_by_external_id.return_value = None
        storage.create_session.side_effect = lambda data: make_session(
            external_id=data["external_id"],
            name=data["name"],
            project_id=data["project_id"],
            playlist_ids=[],
        )
        app.dependency_overrides[get_session_provider_cached] = lambda: provider
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.post(
            "/projects/124/sessions", json={"name": "  Lighting review  "}
        )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Lighting review"
        assert body["project_id"] == "124"
        assert body["external_id"] is not None

    def test_create_session_without_provider(self):
        storage = mock.AsyncMock()
        storage.create_session.side_effect = lambda data: make_session(
            external_id=None,
            name=data["name"],
            project_id=data["project_id"],
            playlist_ids=[],
        )
        app.dependency_overrides[get_session_provider_cached] = lambda: None
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.post("/projects/124/sessions", json={"name": "Ad-hoc"})

        assert response.status_code == 201
        assert response.json()["name"] == "Ad-hoc"
        assert response.json()["external_id"] is None

    def test_create_session_rejects_blank_name(self):
        app.dependency_overrides[get_session_provider_cached] = (
            lambda: MockSessionProvider()
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock.AsyncMock()

        response = client.post("/projects/124/sessions", json={"name": "   "})

        assert response.status_code == 400
        assert response.json()["detail"] == "Session name is required"

    def test_create_session_501_when_provider_cannot_create(self):
        provider = mock.Mock()
        provider.create_session.side_effect = NotImplementedError(
            "This provider cannot create sessions"
        )
        app.dependency_overrides[get_session_provider_cached] = lambda: provider
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock.AsyncMock()

        response = client.post("/projects/124/sessions", json={"name": "Morning"})

        assert response.status_code == 501
        assert "cannot create" in response.json()["detail"]

    def test_ensure_for_playlist_creates_implicit_session(self):
        storage = mock.AsyncMock()
        storage.get_implicit_session_for_playlist.return_value = None
        storage.create_session.return_value = make_session(
            name="Playlist 45", playlist_ids=["45"]
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.post(
            "/sessions/ensure-for-playlist",
            json={"project_id": "124", "playlist_id": "45"},
        )

        assert response.status_code == 200
        assert response.json()["playlist_ids"] == ["45"]
        storage.create_session.assert_awaited_once()

    def test_ensure_for_playlist_returns_existing(self):
        existing = make_session(name="Playlist 45", playlist_ids=["45"])
        storage = mock.AsyncMock()
        storage.get_implicit_session_for_playlist.return_value = existing
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.post(
            "/sessions/ensure-for-playlist",
            json={"project_id": "124", "playlist_id": "45"},
        )

        assert response.status_code == 200
        assert response.json()["_id"] == SESSION_ID
        storage.create_session.assert_not_awaited()

    def test_get_session_returns_session(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session(name="Lighting")
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.get(f"/sessions/{SESSION_ID}")

        assert response.status_code == 200
        assert response.json()["name"] == "Lighting"

    def test_get_session_404_when_missing(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = None
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.get("/sessions/missing")

        assert response.status_code == 404
        assert response.json()["detail"] == "Session not found"

    def test_update_session_playlists(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session()
        storage.update_session.return_value = make_session(playlist_ids=["45", "46"])
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.put(
            f"/sessions/{SESSION_ID}/playlists",
            json={"playlist_ids": ["45", "46"]},
        )

        assert response.status_code == 200
        assert response.json()["playlist_ids"] == ["45", "46"]
        storage.update_session.assert_awaited_once_with(
            SESSION_ID, {"playlist_ids": ["45", "46"]}
        )

    def test_update_in_review_sets_version_and_broadcasts(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session()
        updated = make_session(
            in_review_playlist_id="45",
            in_review_version_id="6990",
            in_review_pinned=False,
        )
        storage.update_session.return_value = updated
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        with client.websocket_connect("/ws") as ws:
            response = client.put(
                f"/sessions/{SESSION_ID}/in-review",
                json={
                    "in_review_playlist_id": "45",
                    "in_review_version_id": "6990",
                },
            )
            assert response.status_code == 200
            event = ws.receive_json()

        assert event["type"] == EventType.SESSION_IN_REVIEW_CHANGED.value
        assert event["payload"]["session_id"] == SESSION_ID
        assert event["payload"]["in_review_version_id"] == "6990"

    def test_update_in_review_pinned_rejects_move(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session(
            in_review_playlist_id="45",
            in_review_version_id="200",
            in_review_pinned=True,
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.put(
            f"/sessions/{SESSION_ID}/in-review",
            json={"in_review_playlist_id": "45", "in_review_version_id": "300"},
        )

        assert response.status_code == 409
        storage.update_session.assert_not_awaited()

    def test_update_in_review_pinned_allows_move_when_unpinning(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session(
            in_review_playlist_id="45",
            in_review_version_id="200",
            in_review_pinned=True,
        )
        storage.update_session.return_value = make_session(
            in_review_playlist_id="45",
            in_review_version_id="300",
            in_review_pinned=False,
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.put(
            f"/sessions/{SESSION_ID}/in-review",
            json={
                "in_review_playlist_id": "45",
                "in_review_version_id": "300",
                "in_review_pinned": False,
            },
        )

        assert response.status_code == 200
        storage.update_session.assert_awaited_once()

    def test_clear_in_review_unpins(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session(
            in_review_playlist_id="45",
            in_review_version_id="200",
            in_review_pinned=False,
        )
        storage.update_session.return_value = make_session(
            in_review_playlist_id=None,
            in_review_version_id=None,
            in_review_pinned=False,
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.put(
            f"/sessions/{SESSION_ID}/in-review",
            json={"clear_in_review": True},
        )

        assert response.status_code == 200
        fields = storage.update_session.await_args.args[1]
        assert fields["in_review_playlist_id"] is None
        assert fields["in_review_version_id"] is None
        assert fields["in_review_pinned"] is False

    def test_update_transcription_sets_resumed_at_on_unpause(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session(transcription_paused=True)
        storage.update_session.return_value = make_session(
            transcription_paused=False,
            transcription_resumed_at=datetime.now(timezone.utc),
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.put(
            f"/sessions/{SESSION_ID}/transcription",
            json={"transcription_paused": False},
        )

        assert response.status_code == 200
        fields = storage.update_session.await_args.args[1]
        assert fields["transcription_paused"] is False
        assert "transcription_resumed_at" in fields

    def test_update_transcription_clear_meeting(self):
        storage = mock.AsyncMock()
        storage.get_session.return_value = make_session(
            meeting_id="abc", platform="google_meet", vexa_meeting_id=1
        )
        storage.update_session.return_value = make_session()
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.put(
            f"/sessions/{SESSION_ID}/transcription",
            json={"clear_meeting": True},
        )

        assert response.status_code == 200
        fields = storage.update_session.await_args.args[1]
        assert fields["meeting_id"] is None
        assert fields["platform"] is None
        assert fields["vexa_meeting_id"] is None


class TestSessionServiceHelpers:
    """Unit tests for ensure/sync helpers."""

    @pytest.mark.asyncio
    async def test_ensure_session_for_external_creates(self):
        storage = mock.AsyncMock()
        storage.get_session_by_external_id.return_value = None
        storage.create_session.return_value = make_session(
            external_id="ext-1", name="Ext", playlist_ids=[]
        )
        external = ExternalSession(id="ext-1", name="Ext", project_id="124")

        result = await ensure_session_for_external(storage, external)

        assert result.external_id == "ext-1"
        storage.create_session.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_ensure_session_for_external_updates_stale_name(self):
        storage = mock.AsyncMock()
        existing = make_session(external_id="ext-1", name="Old")
        updated = make_session(external_id="ext-1", name="New")
        storage.get_session_by_external_id.return_value = existing
        storage.update_session.return_value = updated
        external = ExternalSession(id="ext-1", name="New", project_id="124")

        result = await ensure_session_for_external(storage, external)

        assert result.name == "New"
        storage.update_session.assert_awaited_once_with(SESSION_ID, {"name": "New"})

    @pytest.mark.asyncio
    async def test_sync_project_sessions_without_provider(self):
        storage = mock.AsyncMock()
        storage.get_sessions_for_project.return_value = [make_session()]

        result = await sync_project_sessions(storage, None, "124")

        assert len(result) == 1
        storage.get_sessions_for_project.assert_awaited_once_with("124")

    @pytest.mark.asyncio
    async def test_ensure_implicit_session_for_playlist(self):
        storage = mock.AsyncMock()
        storage.get_implicit_session_for_playlist.return_value = None
        storage.create_session.return_value = make_session(playlist_ids=["45"])

        result = await ensure_implicit_session_for_playlist(storage, "124", "45")

        assert result.playlist_ids == ["45"]
        create_data = storage.create_session.await_args.args[0]
        assert create_data["external_id"] is None
        assert create_data["playlist_ids"] == ["45"]
