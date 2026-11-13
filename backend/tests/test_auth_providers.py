"""Unit tests for auth providers."""

from __future__ import annotations

from unittest import mock

import pytest
import requests

from dna.auth_providers.auth_provider_base import (
    AuthPrincipal,
    AuthProviderBase,
    AuthUpstreamError,
    IdentityMismatchError,
    get_auth_provider,
)
from dna.auth_providers.noop_auth_provider import NoopAuthProvider
from dna.auth_providers.shotgrid_auth_provider import ShotgridAuthProvider


def test_noop_validate_token_email():
    provider = NoopAuthProvider()
    principal = provider.validate_token("artist@studio.com")
    assert isinstance(principal, AuthPrincipal)
    assert principal.email == "artist@studio.com"
    assert principal.login == "artist"
    assert principal.provider == "none"


def test_noop_authenticate_returns_session():
    provider = NoopAuthProvider()
    session = provider.authenticate("artist@studio.com", "ignored")
    assert session.token == "artist@studio.com"
    assert session.principal.email == "artist@studio.com"


def test_assert_identity_mismatch():
    provider = NoopAuthProvider()
    principal = provider.validate_token("a@example.com")
    with pytest.raises(IdentityMismatchError):
        provider.assert_identity(principal, "b@example.com")


def test_assert_identity_missing():
    provider = NoopAuthProvider()
    principal = provider.validate_token("a@example.com")
    with pytest.raises(IdentityMismatchError):
        provider.assert_identity(principal, None)


def test_get_auth_provider_shotgrid(monkeypatch):
    monkeypatch.setenv("AUTH_PROVIDER", "shotgrid")
    monkeypatch.setenv("SHOTGRID_URL", "https://example.shotgunstudio.com")
    provider = get_auth_provider()
    assert isinstance(provider, ShotgridAuthProvider)


def test_get_auth_provider_unknown(monkeypatch):
    monkeypatch.setenv("AUTH_PROVIDER", "okta")
    with pytest.raises(ValueError, match="Unknown auth provider"):
        get_auth_provider()


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text or str(payload)

    def json(self):
        return self._payload


def test_shotgrid_authenticate_success():
    http = mock.Mock()
    http.post.return_value = _FakeResponse(
        200,
        {
            "access_token": "access-1",
            "refresh_token": "refresh-1",
            "expires_in": 600,
        },
    )
    http.get.return_value = _FakeResponse(
        200,
        {
            "data": {
                "id": 42,
                "attributes": {
                    "login": "artist",
                    "email": "artist@studio.com",
                    "name": "Artist",
                },
            }
        },
    )
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    session = provider.authenticate("artist", "secret")
    assert session.token == "access-1"
    assert session.refresh_token == "refresh-1"
    assert session.expires_in == 600
    assert session.principal.email == "artist@studio.com"
    assert session.principal.login == "artist"


def test_shotgrid_authenticate_bad_credentials():
    http = mock.Mock()
    http.post.return_value = _FakeResponse(
        400,
        {
            "errors": [
                {
                    "status": 400,
                    "code": 102,
                    "title": "Can't authenticate user 'artist'.",
                }
            ]
        },
    )
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    with pytest.raises(ValueError, match="Can't authenticate user 'artist'"):
        provider.authenticate("artist", "wrong")


def test_shotgrid_authenticate_upstream_error():
    http = mock.Mock()
    http.post.side_effect = requests.ConnectionError("down")
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    with pytest.raises(AuthUpstreamError):
        provider.authenticate("artist", "secret")


def test_shotgrid_validate_token_by_user_id():
    http = mock.Mock()
    # JWT-like token with user_id claim in middle segment.
    # {"user_id": 42} base64url
    token = "aaa." + "eyJ1c2VyX2lkIjo0Mn0." + "ccc"  # {"user_id":42}
    http.get.return_value = _FakeResponse(
        200,
        {
            "data": {
                "id": 42,
                "attributes": {
                    "login": "artist",
                    "email": "artist@studio.com",
                    "name": "Artist",
                },
            }
        },
    )
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    principal = provider.validate_token(token)
    assert principal.email == "artist@studio.com"
    assert principal.login == "artist"


def test_shotgrid_validate_token_by_nested_user_id():
    """Flow access tokens put the HumanUser id under user.id."""
    import base64
    import json

    http = mock.Mock()
    claims = {
        "iss": "example.shotgunstudio.com",
        "user": {"type": "HumanUser", "id": 90},
        "auth_type": "login",
    }
    payload = (
        base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8"))
        .decode("ascii")
        .rstrip("=")
    )
    token = f"aaa.{payload}.ccc"
    http.get.return_value = _FakeResponse(
        200,
        {
            "data": {
                "id": 90,
                "attributes": {
                    "login": "spadjv",
                    "email": "artist@studio.com",
                    "name": "Artist",
                },
            }
        },
    )
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    principal = provider.validate_token(token)
    assert principal.email == "artist@studio.com"
    assert principal.login == "spadjv"
    assert principal.sub == "90"
    http.get.assert_called_once()
    assert "/entity/human_users/90" in http.get.call_args.args[0]


def test_shotgrid_refresh_success():
    http = mock.Mock()
    http.post.return_value = _FakeResponse(
        200,
        {
            "access_token": "access-2",
            "refresh_token": "refresh-2",
            "expires_in": 600,
        },
    )
    http.get.return_value = _FakeResponse(
        200,
        {
            "data": {
                "id": 7,
                "attributes": {
                    "login": "artist",
                    "email": "artist@studio.com",
                    "name": "Artist",
                },
            }
        },
    )
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    session = provider.refresh("refresh-1")
    assert session.token == "access-2"
    assert session.refresh_token == "refresh-2"
    assert session.principal.email == "artist@studio.com"


def test_auth_principal_get_and_session_helpers():
    principal = AuthPrincipal(
        email="a@b.com",
        login="a",
        provider="none",
        name="A",
        sub="sub-1",
        claims={"picture": "x"},
    )
    assert principal.get("email") == "a@b.com"
    assert principal.get("login") == "a"
    assert principal.get("name") == "A"
    assert principal.get("sub") == "sub-1"
    assert principal.get("provider") == "none"
    assert principal.get("picture") == "x"
    assert principal.get("missing", "fallback") == "fallback"

    from dna.auth_providers.auth_provider_base import session_expires_at

    assert session_expires_at(None) is None
    assert session_expires_at(60) is not None


def test_base_authenticate_and_refresh_not_implemented():
    class _OnlyValidate(AuthProviderBase):
        provider_name = "only-validate"

        def validate_token(self, token: str) -> AuthPrincipal:
            return AuthPrincipal(email="a@b.com", login="a", provider="only-validate")

    provider = _OnlyValidate()
    with pytest.raises(NotImplementedError):
        provider.authenticate("a", "b")
    with pytest.raises(NotImplementedError):
        provider.refresh("r")
    assert provider.get_user_email("tok") == "a@b.com"


def test_get_auth_provider_google(monkeypatch):
    monkeypatch.setenv("AUTH_PROVIDER", "google")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client-id")
    with mock.patch(
        "dna.auth_providers.google_auth_provider.GoogleAuthProvider"
    ) as ctor:
        ctor.return_value = mock.Mock()
        provider = get_auth_provider()
        assert provider is ctor.return_value


def test_noop_token_without_at():
    provider = NoopAuthProvider()
    principal = provider.validate_token("artist")
    assert principal.email == "artist@localhost"


def test_shotgrid_requires_url(monkeypatch):
    monkeypatch.delenv("SHOTGRID_URL", raising=False)
    with pytest.raises(ValueError, match="SHOTGRID_URL"):
        ShotgridAuthProvider()


def test_shotgrid_validate_falls_back_to_current_user():
    http = mock.Mock()
    http.get.return_value = _FakeResponse(
        200,
        {
            "data": {
                "id": 9,
                "attributes": {
                    "login": "artist",
                    "email": "artist@studio.com",
                    "name": "Artist",
                },
            }
        },
    )
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    principal = provider.validate_token("opaque-token")
    assert principal.email == "artist@studio.com"
    assert "/entity/human_users/me" in http.get.call_args.args[0]


def test_shotgrid_validate_does_not_use_arbitrary_user_list():
    http = mock.Mock()
    http.get.return_value = _FakeResponse(404, {"errors": []})
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    with pytest.raises(ValueError, match="ShotGrid API request failed: 404"):
        provider.validate_token("opaque-token")
    assert http.get.call_count == 1
    assert "/entity/human_users/me" in http.get.call_args.args[0]


def test_shotgrid_token_request_server_error():
    http = mock.Mock()
    http.post.return_value = _FakeResponse(503, {"error": "down"})
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    with pytest.raises(AuthUpstreamError):
        provider.authenticate("artist", "secret")


def test_shotgrid_validate_invalid_token():
    http = mock.Mock()
    http.get.return_value = _FakeResponse(401, {"error": "unauthorized"})
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    with pytest.raises(ValueError, match="Invalid ShotGrid access token"):
        provider.validate_token("bad-token")


def test_shotgrid_authenticate_with_2fa_and_odd_failures():
    http = mock.Mock()
    http.post.side_effect = [
        _FakeResponse(400, {"error": "bad"}),
        _FakeResponse(200, {}),
        _FakeResponse(
            200,
            {
                "access_token": "access-1",
                "refresh_token": "refresh-1",
                "expires_in": 600,
            },
        ),
    ]
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    with pytest.raises(ValueError, match="Invalid ShotGrid credentials"):
        provider.authenticate("artist", "secret", auth_token="123456")
    with pytest.raises(ValueError, match="missing access_token"):
        provider.authenticate("artist", "secret")

    http.get.return_value = _FakeResponse(200, {"data": []})
    with pytest.raises(ValueError, match="user not found"):
        provider.authenticate("artist", "secret")


def test_shotgrid_get_json_upstream_and_bad_status():
    http = mock.Mock()
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )

    http.get.side_effect = requests.Timeout("slow")
    with pytest.raises(AuthUpstreamError):
        provider.validate_token("tok")

    http.get.side_effect = None
    http.get.return_value = _FakeResponse(500, {"error": "boom"})
    with pytest.raises(AuthUpstreamError):
        provider.validate_token("tok")

    http.get.return_value = _FakeResponse(418, {"error": "teapot"})
    with pytest.raises(ValueError, match="ShotGrid API request failed"):
        provider.validate_token("tok")


def test_shotgrid_jwt_user_lookup_falls_back():
    http = mock.Mock()
    token = "aaa.eyJ1c2VyX2lkIjo5OX0.ccc"
    http.get.side_effect = [
        _FakeResponse(404, {}),
        _FakeResponse(
            200,
            {
                "data": {
                    "id": 99,
                    "attributes": {
                        "login": "artist",
                        "email": "artist@studio.com",
                        "name": "Artist",
                    },
                }
            },
        ),
    ]
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=http
    )
    principal = provider.validate_token(token)
    assert principal.email == "artist@studio.com"
    assert "/entity/human_users/me" in http.get.call_args_list[1].args[0]


def test_shotgrid_malformed_jwt_payload():
    provider = ShotgridAuthProvider(
        site_url="https://example.shotgunstudio.com", http_client=mock.Mock()
    )
    assert provider._jwt_payload("not-a-jwt") is None
    assert provider._jwt_payload("a.!!!.c") is None
