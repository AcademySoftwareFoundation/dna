"""No-op Auth Provider.

A pass-through auth provider for development/testing that doesn't validate tokens.
WARNING: Do not use in production!
"""

from __future__ import annotations

from typing import Optional

from dna.auth_providers.auth_provider_base import (
    AuthPrincipal,
    AuthProviderBase,
    AuthSession,
)


class NoopAuthProvider(AuthProviderBase):
    """No-op authentication provider that accepts any token.

    WARNING: This provider should only be used for local development
    or testing. It does not perform any actual token validation.
    """

    provider_name = "none"

    def _principal_from_token(self, token: str) -> AuthPrincipal:
        if "@" in token:
            email = token
        else:
            email = f"{token}@localhost"
        login = email.split("@", 1)[0]
        return AuthPrincipal(
            email=email,
            login=login,
            provider=self.provider_name,
            sub=token,
            claims={"email_verified": True},
        )

    def validate_token(self, token: str) -> AuthPrincipal:
        """Accept any token and return a principal derived from it."""
        return self._principal_from_token(token)

    def authenticate(
        self,
        username: str,
        password: str,
        auth_token: Optional[str] = None,
    ) -> AuthSession:
        """Treat the username as the identity; password is ignored."""
        del password, auth_token
        principal = self._principal_from_token(username)
        return AuthSession(token=principal.email, principal=principal)
