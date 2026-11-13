"""Base Auth Provider.

Defines the abstract base class for authentication providers.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Optional

from dna.auth.email import emails_match


class IdentityMismatchError(ValueError):
    """Raised when the requested identity does not match the token principal."""


class AuthUpstreamError(RuntimeError):
    """Raised when the upstream identity provider is unreachable or failing."""


@dataclass(frozen=True)
class AuthPrincipal:
    """Authenticated caller identity."""

    email: str
    login: str
    provider: str
    name: Optional[str] = None
    sub: Optional[str] = None
    claims: Mapping[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-like access for callers that historically read token claims."""
        if key == "email":
            return self.email
        if key == "login":
            return self.login
        if key == "name":
            return self.name
        if key == "sub":
            return self.sub
        if key == "provider":
            return self.provider
        return self.claims.get(key, default)


@dataclass(frozen=True)
class AuthSession:
    """Credentials returned by a password or refresh login."""

    token: str
    principal: AuthPrincipal
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    expires_at: Optional[datetime] = None


class AuthProviderBase(ABC):
    """Abstract base class for authentication providers."""

    provider_name: str = "base"

    @abstractmethod
    def validate_token(self, token: str) -> AuthPrincipal:
        """Validate a token and return the authenticated principal.

        Raises:
            ValueError: If the token is invalid or expired.
            AuthUpstreamError: If the upstream provider cannot be reached.
        """

    def authenticate(
        self,
        username: str,
        password: str,
        auth_token: Optional[str] = None,
    ) -> AuthSession:
        """Exchange credentials for a session.

        Providers that perform login in the browser (e.g. Google) raise
        ``NotImplementedError``.
        """
        raise NotImplementedError(
            f"{self.provider_name} does not support password authentication"
        )

    def refresh(self, refresh_token: str) -> AuthSession:
        """Exchange a refresh token for a new session.

        Providers that do not support refresh raise ``NotImplementedError``.
        """
        raise NotImplementedError(
            f"{self.provider_name} does not support token refresh"
        )

    def assert_identity(
        self, principal: AuthPrincipal, requested_identity: Optional[str]
    ) -> None:
        """Require that the requested identity matches the token principal.

        Raises:
            IdentityMismatchError: If the identity is missing or does not match.
        """
        if not requested_identity or not requested_identity.strip():
            raise IdentityMismatchError("Missing identity header")
        if not emails_match(principal.email, requested_identity):
            raise IdentityMismatchError("Identity does not match authenticated user")

    def get_user_email(self, token: str) -> str:
        """Extract the user email from a token."""
        principal = self.validate_token(token)
        if not principal.email:
            raise ValueError("Token does not contain an email claim")
        return principal.email


def session_expires_at(expires_in: Optional[int]) -> Optional[datetime]:
    """Convert an expires_in seconds value to a UTC datetime."""
    if expires_in is None:
        return None
    return datetime.now(timezone.utc).replace(microsecond=0) + timedelta(
        seconds=int(expires_in)
    )


def get_auth_provider() -> AuthProviderBase:
    """Factory function to get the configured auth provider."""
    provider = os.getenv("AUTH_PROVIDER", "none").lower()

    if provider == "none":
        from dna.auth_providers.noop_auth_provider import NoopAuthProvider

        return NoopAuthProvider()
    if provider == "google":
        from dna.auth_providers.google_auth_provider import GoogleAuthProvider

        return GoogleAuthProvider()
    if provider == "shotgrid":
        from dna.auth_providers.shotgrid_auth_provider import ShotgridAuthProvider

        return ShotgridAuthProvider()
    raise ValueError(f"Unknown auth provider: {provider}")
