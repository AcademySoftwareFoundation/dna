"""API tests for auth login/refresh/me and identity enforcement."""

from __future__ import annotations

from unittest import mock

import pytest
from fastapi.testclient import TestClient

from dna.auth_providers.auth_provider_base import (
    AuthPrincipal,
    AuthSession,
    AuthUpstreamError,
)
from dna.auth_providers.noop_auth_provider import NoopAuthProvider


@pytest.fixture
def client():
    from main import app, get_auth_provider_cached

    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.pop(get_auth_provider_cached, None)
    get_auth_provider_cached.cache_clear()


def test_auth_login_noop(client, monkeypatch):
    monkeypatch.setenv("AUTH_PROVIDER", "none")
    from main import get_auth_provider_cached

    get_auth_provider_cached.cache_clear()
    response = client.post(
        "/auth/login",
        json={"username": "artist@studio.com", "password": "x"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token"] == "artist@studio.com"
    assert body["principal"]["email"] == "artist@studio.com"


def test_auth_me_requires_auth_when_google(client, monkeypatch):
    monkeypatch.setenv("AUTH_PROVIDER", "google")
    from main import app, get_auth_provider_cached

    provider = mock.Mock()
    provider.validate_token.return_value = AuthPrincipal(
        email="artist@studio.com",
        login="artist",
        provider="google",
    )
    provider.assert_identity = NoopAuthProvider().assert_identity
    app.dependency_overrides[get_auth_provider_cached] = lambda: provider

    missing = client.get("/auth/me")
    assert missing.status_code == 401

    wrong = client.get(
        "/auth/me",
        headers={
            "Authorization": "Bearer token",
            "X-User-Id": "other@studio.com",
        },
    )
    assert wrong.status_code == 403

    ok = client.get(
        "/auth/me",
        headers={
            "Authorization": "Bearer token",
            "X-User-Id": "artist@studio.com",
        },
    )
    assert ok.status_code == 200
    assert ok.json()["email"] == "artist@studio.com"


def test_auth_login_upstream_maps_to_503(client):
    from main import app, get_auth_provider_cached

    provider = mock.Mock()
    provider.authenticate.side_effect = AuthUpstreamError("down")
    app.dependency_overrides[get_auth_provider_cached] = lambda: provider

    response = client.post(
        "/auth/login",
        json={"username": "artist", "password": "x"},
    )
    assert response.status_code == 503


def test_auth_refresh_success(client):
    from main import app, get_auth_provider_cached

    provider = mock.Mock()
    provider.refresh.return_value = AuthSession(
        token="access-2",
        refresh_token="refresh-2",
        expires_in=600,
        principal=AuthPrincipal(
            email="artist@studio.com",
            login="artist",
            provider="shotgrid",
        ),
    )
    app.dependency_overrides[get_auth_provider_cached] = lambda: provider

    response = client.post(
        "/auth/refresh",
        json={"refresh_token": "refresh-1"},
    )
    assert response.status_code == 200
    assert response.json()["token"] == "access-2"


def test_none_provider_allows_missing_identity_header(client, monkeypatch):
    monkeypatch.setenv("AUTH_PROVIDER", "none")
    from main import get_auth_provider_cached

    get_auth_provider_cached.cache_clear()
    response = client.get("/health")
    assert response.status_code == 200
