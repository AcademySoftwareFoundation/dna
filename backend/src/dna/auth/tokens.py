"""DNA access tokens.

DNA issues its own signed JWTs after an auth provider verifies a user's
credentials. Tokens are stateless: the identity is read back from the claims
and nothing is stored server-side.

Configuration (environment variables):
    JWT_SECRET_KEY: Required. Secret used to sign and verify tokens.
    JWT_ALGORITHM: Signing algorithm. Defaults to HS256.
    JWT_EXPIRE_MINUTES: Token lifetime in minutes. Defaults to 720 (12 hours).
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from dna.auth.errors import AuthenticationError
from dna.auth.identity import CurrentUser

DEFAULT_ALGORITHM = "HS256"
DEFAULT_EXPIRE_MINUTES = 720


@dataclass(frozen=True)
class JWTSettings:
    """Settings for signing and verifying DNA access tokens."""

    secret_key: str
    algorithm: str = DEFAULT_ALGORITHM
    expire_minutes: int = DEFAULT_EXPIRE_MINUTES


def get_jwt_settings() -> JWTSettings:
    """Read JWT settings from the environment.

    Raises:
        ValueError: If JWT_SECRET_KEY is unset or JWT_EXPIRE_MINUTES is not a
            positive integer.
    """
    secret_key = os.getenv("JWT_SECRET_KEY")
    if not secret_key:
        raise ValueError("JWT_SECRET_KEY must be set to sign DNA access tokens.")

    raw_minutes = os.getenv("JWT_EXPIRE_MINUTES", str(DEFAULT_EXPIRE_MINUTES))
    try:
        expire_minutes = int(raw_minutes)
    except ValueError:
        raise ValueError(
            f"JWT_EXPIRE_MINUTES must be an integer, got {raw_minutes!r}"
        ) from None
    if expire_minutes <= 0:
        raise ValueError("JWT_EXPIRE_MINUTES must be greater than zero.")

    return JWTSettings(
        secret_key=secret_key,
        algorithm=os.getenv("JWT_ALGORITHM", DEFAULT_ALGORITHM),
        expire_minutes=expire_minutes,
    )


def create_access_token(
    user: CurrentUser,
    settings: Optional[JWTSettings] = None,
    now: Optional[datetime] = None,
) -> tuple[str, datetime]:
    """Sign an access token for a user.

    Args:
        user: The identity to embed in the token.
        settings: Signing settings. Defaults to get_jwt_settings().
        now: Issue time. Defaults to the current UTC time.

    Returns:
        The encoded token and its expiry time (UTC).
    """
    settings = settings or get_jwt_settings()
    issued_at = now or datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=settings.expire_minutes)
    claims = {
        "sub": user.sub,
        "email": user.email,
        "name": user.name,
        "iat": issued_at,
        "exp": expires_at,
    }
    token = jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)
    return token, expires_at


def decode_access_token(
    token: str, settings: Optional[JWTSettings] = None
) -> CurrentUser:
    """Verify an access token and return the identity it carries.

    Args:
        token: The encoded token.
        settings: Verification settings. Defaults to get_jwt_settings().

    Raises:
        AuthenticationError: If the token is malformed, expired, signed with
            a different key, or missing required claims.
    """
    settings = settings or get_jwt_settings()
    try:
        claims = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"require": ["sub", "email", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired") from None
    except jwt.PyJWTError as e:
        raise AuthenticationError(f"Invalid token: {e}") from None

    return CurrentUser(
        sub=claims["sub"], email=claims["email"], name=claims.get("name")
    )
