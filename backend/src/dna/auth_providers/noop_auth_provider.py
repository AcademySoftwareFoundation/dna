"""No-op Auth Provider.

A pass-through auth provider for development/testing that doesn't validate tokens.
WARNING: Do not use in production!
"""

from dna.auth_providers.auth_provider_base import AuthProviderBase


class NoopAuthProvider(AuthProviderBase):
    """No-op authentication provider that accepts any token.

    WARNING: This provider should only be used for local development
    or testing. It does not perform any actual token validation.
    """

    def validate_token(self, token: str) -> dict:
        """Accept any token and return minimal claims.

        Args:
            token: Any string (treated as an email for development).

        Returns:
            A dictionary with the token as the email claim.
        """
        if "@" in token:
            return {"email": token, "sub": token, "email_verified": True}
        return {
            "email": f"{token}@localhost",
            "sub": token,
            "email_verified": True,
        }
