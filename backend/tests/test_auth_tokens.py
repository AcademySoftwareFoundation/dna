"""Tests for DNA access token signing and verification."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from dna.auth.errors import AuthenticationError
from dna.auth.identity import CurrentUser
from dna.auth.tokens import (
    DEFAULT_EXPIRE_MINUTES,
    JWTSettings,
    create_access_token,
    decode_access_token,
    get_jwt_settings,
)

SECRET = "unit-test-secret-key-at-least-32-bytes"
USER = CurrentUser(sub="jdoe", email="jdoe@example.com", name="Jane Doe")


@pytest.fixture
def settings():
    return JWTSettings(secret_key=SECRET, expire_minutes=60)


class TestGetJwtSettings:
    def test_reads_environment(self, monkeypatch):
        monkeypatch.setenv("JWT_SECRET_KEY", SECRET)
        monkeypatch.setenv("JWT_EXPIRE_MINUTES", "15")
        monkeypatch.setenv("JWT_ALGORITHM", "HS512")

        result = get_jwt_settings()

        assert result == JWTSettings(
            secret_key=SECRET, algorithm="HS512", expire_minutes=15
        )

    def test_defaults(self, monkeypatch):
        monkeypatch.setenv("JWT_SECRET_KEY", SECRET)
        monkeypatch.delenv("JWT_EXPIRE_MINUTES", raising=False)
        monkeypatch.delenv("JWT_ALGORITHM", raising=False)

        result = get_jwt_settings()

        assert result.algorithm == "HS256"
        assert result.expire_minutes == DEFAULT_EXPIRE_MINUTES

    def test_missing_secret_raises(self, monkeypatch):
        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

        with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
            get_jwt_settings()

    @pytest.mark.parametrize("value", ["abc", "0", "-5"])
    def test_invalid_expire_minutes_raises(self, monkeypatch, value):
        monkeypatch.setenv("JWT_SECRET_KEY", SECRET)
        monkeypatch.setenv("JWT_EXPIRE_MINUTES", value)

        with pytest.raises(ValueError, match="JWT_EXPIRE_MINUTES"):
            get_jwt_settings()


class TestAccessTokens:
    def test_round_trip(self, settings):
        token, _ = create_access_token(USER, settings)

        assert decode_access_token(token, settings) == USER

    def test_expiry_uses_configured_lifetime(self, settings):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)

        token, expires_at = create_access_token(USER, settings, now=now)

        assert expires_at == now + timedelta(minutes=60)
        claims = jwt.decode(
            token, SECRET, algorithms=["HS256"], options={"verify_exp": False}
        )
        assert claims["exp"] == int(expires_at.timestamp())
        assert claims["iat"] == int(now.timestamp())
        assert claims["sub"] == "jdoe"

    def test_uses_environment_settings_by_default(self, monkeypatch):
        monkeypatch.setenv("JWT_SECRET_KEY", SECRET)

        token, _ = create_access_token(USER)

        assert decode_access_token(token) == USER

    def test_expired_token_rejected(self, settings):
        issued = datetime.now(timezone.utc) - timedelta(minutes=120)
        token, _ = create_access_token(USER, settings, now=issued)

        with pytest.raises(AuthenticationError, match="expired"):
            decode_access_token(token, settings)

    def test_wrong_secret_rejected(self, settings):
        token, _ = create_access_token(USER, settings)
        other = JWTSettings(secret_key="a-different-secret-key-of-32-bytes!!")

        with pytest.raises(AuthenticationError, match="Invalid token"):
            decode_access_token(token, other)

    def test_garbage_rejected(self, settings):
        with pytest.raises(AuthenticationError):
            decode_access_token("not-a-jwt", settings)

    def test_missing_email_claim_rejected(self, settings):
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {"sub": "jdoe", "iat": now, "exp": now + timedelta(minutes=5)},
            SECRET,
            algorithm="HS256",
        )

        with pytest.raises(AuthenticationError, match="email"):
            decode_access_token(token, settings)

    def test_unsigned_token_rejected(self, settings):
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {
                "sub": "jdoe",
                "email": "jdoe@example.com",
                "iat": now,
                "exp": now + timedelta(minutes=5),
            },
            None,
            algorithm="none",
        )

        with pytest.raises(AuthenticationError):
            decode_access_token(token, settings)
