"""Tests for sign-in, token verification, and per-user prodtrack scoping."""

from datetime import datetime, timedelta, timezone
from unittest import mock

import main
import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    get_auth_provider_cached,
    get_prodtrack_provider_cached,
)

from dna.auth.errors import AuthenticationError
from dna.auth.identity import CurrentUser
from dna.auth.tokens import create_access_token, decode_access_token
from dna.models.entity import Project
from dna.prodtrack_providers.prodtrack_provider_base import UserNotFoundError
from tests.auth_helpers import TEST_USER, AuthenticatedTestClient, auth_header

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


class TestLogin:
    def test_mock_provider_issues_token_for_any_password(self):
        response = client.post(
            "/auth/login", data={"username": "jdoe@example.com", "password": "x"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert body["user"] == {
            "sub": "jdoe@example.com",
            "email": "jdoe@example.com",
            "name": "jdoe@example.com",
        }
        assert decode_access_token(body["access_token"]).email == "jdoe@example.com"
        expires_at = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
        assert expires_at > datetime.now(timezone.utc) + timedelta(hours=11)

    def test_rejected_credentials_return_401(self):
        provider = mock.Mock()
        provider.authenticate.side_effect = AuthenticationError("Invalid username")
        app.dependency_overrides[get_auth_provider_cached] = lambda: provider

        response = client.post(
            "/auth/login", data={"username": "jdoe", "password": "wrong"}
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid username"}
        provider.authenticate.assert_called_once_with("jdoe", "wrong")

    def test_missing_form_fields_return_422(self):
        response = client.post("/auth/login", data={"username": "jdoe"})

        assert response.status_code == 422


class TestTokenVerification:
    def test_me_returns_token_identity(self):
        response = client.get("/auth/me", headers=auth_header())

        assert response.status_code == 200
        assert CurrentUser(**response.json()) == TEST_USER

    def test_missing_token_returns_401(self):
        response = client.get("/auth/me")

        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"

    def test_invalid_token_returns_401(self):
        response = client.get(
            "/auth/me", headers={"Authorization": "Bearer test@example.com"}
        )

        assert response.status_code == 401

    def test_expired_token_returns_401(self):
        issued = datetime.now(timezone.utc) - timedelta(days=2)
        token, _ = create_access_token(TEST_USER, now=issued)

        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 401
        assert response.json() == {"detail": "Token has expired"}

    def test_protected_route_requires_token(self):
        response = client.get("/projects/user/test@example.com")

        assert response.status_code == 401

    async def test_startup_fails_without_jwt_secret(self, monkeypatch):
        monkeypatch.delenv("JWT_SECRET_KEY")

        with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
            await main.startup_event()


class TestProdtrackScoping:
    def test_routes_use_provider_scoped_to_token_user(self):
        scoped = mock.Mock()
        scoped.get_projects_for_user.return_value = [Project(id="1", name="P")]
        provider = mock.Mock()
        provider.for_user.return_value = scoped
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: provider

        response = AuthenticatedTestClient(app).get("/projects/user/test@example.com")

        assert response.status_code == 200
        provider.for_user.assert_called_once_with(TEST_USER)
        scoped.get_projects_for_user.assert_called_once_with("test@example.com")
        provider.get_projects_for_user.assert_not_called()

    def test_user_unknown_to_tracker_returns_403(self):
        provider = mock.Mock()
        provider.for_user.side_effect = UserNotFoundError(
            "User not found in ShotGrid: test@example.com"
        )
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: provider

        response = AuthenticatedTestClient(app).get("/projects/user/test@example.com")

        assert response.status_code == 403
        assert response.json() == {
            "detail": "User not found in ShotGrid: test@example.com"
        }

    def test_version_statuses_use_script_provider_without_token(self):
        provider = mock.Mock()
        provider.get_version_statuses.return_value = [{"code": "rev", "name": "Rev"}]
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: provider

        response = client.get("/version-statuses")

        assert response.status_code == 200
        provider.for_user.assert_not_called()
