"""Base Auth Provider.

Defines the abstract base class for authentication providers. An auth
provider only verifies credentials and describes who the user is; it is
independent of the production tracking provider, so any AUTH_PROVIDER can be
paired with any PRODTRACK_PROVIDER.
"""

import os
from abc import ABC, abstractmethod

from dna.auth.identity import CurrentUser


class AuthProviderBase(ABC):
    """Abstract base class for authentication providers."""

    @abstractmethod
    def authenticate(self, username: str, password: str) -> CurrentUser:
        """Verify a username and password.

        Args:
            username: The username the user signed in with.
            password: The user's password.

        Returns:
            The verified identity, which DNA embeds in its access token.

        Raises:
            AuthenticationError: If the credentials are rejected.
        """


def get_auth_provider() -> AuthProviderBase:
    """Factory function to get the configured auth provider.

    Returns:
        An AuthProviderBase instance selected by the AUTH_PROVIDER env var
        (``mock`` or ``shotgrid``).

    Raises:
        ValueError: If AUTH_PROVIDER is unset or unknown.
    """
    provider = os.getenv("AUTH_PROVIDER", "").lower()

    if provider == "mock":
        from dna.auth_providers.mock_auth_provider import MockAuthProvider

        return MockAuthProvider()
    if provider == "shotgrid":
        from dna.auth_providers.shotgrid_auth_provider import ShotgridAuthProvider

        return ShotgridAuthProvider()
    raise ValueError(
        f"Unknown auth provider: {provider!r}. Set AUTH_PROVIDER to 'mock' or 'shotgrid'."
    )
