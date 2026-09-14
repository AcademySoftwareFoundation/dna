"""Base Auth Provider.

Defines the abstract base class for authentication providers.
"""

import os
from abc import ABC, abstractmethod
from typing import Optional


class AuthProviderBase(ABC):
    """Abstract base class for authentication providers."""

    @abstractmethod
    def validate_token(self, token: str) -> dict:
        """Validate a token and return the claims.

        Args:
            token: The authentication token to validate.

        Returns:
            A dictionary containing the token claims including:
            - email: The user's email address
            - sub: The user's unique ID
            - name: The user's display name (if available)

        Raises:
            ValueError: If the token is invalid or expired.
        """
        pass

    def get_user_email(self, token: str) -> str:
        """Extract the user email from a token.

        Args:
            token: The authentication token.

        Returns:
            The user's email address.

        Raises:
            ValueError: If the token is invalid or doesn't contain an email.
        """
        claims = self.validate_token(token)
        email = claims.get("email")
        if not email:
            raise ValueError("Token does not contain an email claim")
        return email


def get_auth_provider() -> Optional[AuthProviderBase]:
    """Factory function to get the configured auth provider.

    Returns:
        An AuthProviderBase instance based on AUTH_PROVIDER env var,
        or None if AUTH_PROVIDER is 'none'.
    """
    provider = os.getenv("AUTH_PROVIDER", "none").lower()

    if provider == "none":
        from dna.auth_providers.noop_auth_provider import NoopAuthProvider

        return NoopAuthProvider()
    elif provider == "google":
        from dna.auth_providers.google_auth_provider import GoogleAuthProvider

        return GoogleAuthProvider()
    else:
        raise ValueError(f"Unknown auth provider: {provider}")
