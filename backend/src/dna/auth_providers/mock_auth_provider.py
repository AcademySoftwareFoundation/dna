"""Mock Auth Provider.

Accepts any username and password. Intended for local development and tests.
WARNING: Do not use in production!
"""

from dna.auth.errors import AuthenticationError
from dna.auth.identity import CurrentUser
from dna.auth_providers.auth_provider_base import AuthProviderBase


class MockAuthProvider(AuthProviderBase):
    """Authentication provider that accepts any credentials.

    The identity is derived from the username alone: a username containing
    ``@`` is used as the email, otherwise ``<username>@localhost``. Paired
    with a real production tracking provider, signing in as a tracker user's
    email acts as that user without a password.
    """

    def authenticate(self, username: str, password: str) -> CurrentUser:
        """Accept any password and synthesize an identity from the username.

        Raises:
            AuthenticationError: If the username is blank.
        """
        username = username.strip()
        if not username:
            raise AuthenticationError("Username is required")
        email = username if "@" in username else f"{username}@localhost"
        return CurrentUser(sub=username, email=email, name=username)
