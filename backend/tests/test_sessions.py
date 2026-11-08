"""Tests for session API routes."""

from unittest import mock

from fastapi.testclient import TestClient
from main import app, get_session_provider_cached, get_storage_provider_cached

from dna.models.playlist_metadata import PlaylistMetadata
from dna.session_providers.mock_session_provider import MockSessionProvider

client = TestClient(app)


class TestSessionRoutes:
    """Session routes proxy the provider and read playlist links from storage."""

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_routes_404_when_sessions_disabled(self):
        app.dependency_overrides[get_session_provider_cached] = lambda: None

        assert client.get("/projects/124/sessions").status_code == 404
        assert (
            client.post("/projects/124/sessions", json={"name": "Morning"}).status_code
            == 404
        )
        assert client.get("/sessions/sess-1").status_code == 404
        assert client.get("/sessions/sess-1/playlists").status_code == 404

    def test_list_sessions_returns_provider_sessions(self):
        provider = MockSessionProvider()
        app.dependency_overrides[get_session_provider_cached] = lambda: provider

        response = client.get("/projects/124/sessions")

        assert response.status_code == 200
        names = [session["name"] for session in response.json()]
        assert names == ["Morning dailies", "Afternoon review"]

    def test_create_session_returns_created_session(self):
        provider = MockSessionProvider()
        app.dependency_overrides[get_session_provider_cached] = lambda: provider

        response = client.post(
            "/projects/124/sessions", json={"name": "  Lighting review  "}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Lighting review"
        assert body["project_id"] == "124"
        assert provider.get_session(body["id"]) is not None

    def test_create_session_rejects_blank_name(self):
        provider = MockSessionProvider()
        app.dependency_overrides[get_session_provider_cached] = lambda: provider

        response = client.post("/projects/124/sessions", json={"name": "   "})

        assert response.status_code == 400
        assert response.json()["detail"] == "Session name is required"

    def test_create_session_501_when_provider_cannot_create(self):
        provider = mock.Mock()
        provider.create_session.side_effect = NotImplementedError(
            "This provider cannot create sessions"
        )
        app.dependency_overrides[get_session_provider_cached] = lambda: provider

        response = client.post("/projects/124/sessions", json={"name": "Morning"})

        assert response.status_code == 501
        assert "cannot create" in response.json()["detail"]

    def test_get_session_returns_session(self):
        provider = MockSessionProvider()
        created = provider.create_session("124", "Lighting")
        app.dependency_overrides[get_session_provider_cached] = lambda: provider

        response = client.get(f"/sessions/{created.id}")

        assert response.status_code == 200
        assert response.json()["name"] == "Lighting"

    def test_get_session_404_when_missing(self):
        app.dependency_overrides[get_session_provider_cached] = (
            lambda: MockSessionProvider()
        )

        response = client.get("/sessions/missing")

        assert response.status_code == 404
        assert response.json()["detail"] == "Session not found"

    def test_get_session_playlists_returns_linked_ids(self):
        provider = MockSessionProvider()
        created = provider.create_session("124", "Lighting")
        storage = mock.AsyncMock()
        storage.get_playlist_metadata_by_session.return_value = [
            PlaylistMetadata(_id="a", playlist_id="45", session_ids=[created.id]),
            PlaylistMetadata(_id="b", playlist_id="46", session_ids=[created.id]),
        ]
        app.dependency_overrides[get_session_provider_cached] = lambda: provider
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.get(f"/sessions/{created.id}/playlists")

        assert response.status_code == 200
        assert response.json() == {
            "session_id": created.id,
            "playlist_ids": ["45", "46"],
        }
        storage.get_playlist_metadata_by_session.assert_awaited_once_with(created.id)

    def test_get_session_playlists_404_when_session_missing(self):
        storage = mock.AsyncMock()
        app.dependency_overrides[get_session_provider_cached] = (
            lambda: MockSessionProvider()
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage

        response = client.get("/sessions/missing/playlists")

        assert response.status_code == 404
        storage.get_playlist_metadata_by_session.assert_not_awaited()
