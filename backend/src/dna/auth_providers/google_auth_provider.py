"""Google Auth Provider.

Validates Google tokens (ID tokens or access tokens) using Google APIs.
"""

import os
from typing import Optional

import requests as http_requests
from google.auth.transport import requests
from google.oauth2 import id_token

from dna.auth_providers.auth_provider_base import AuthProviderBase


class GoogleAuthProvider(AuthProviderBase):
    """Google authentication provider that validates Google tokens."""

    def __init__(
        self,
        client_id: Optional[str] = None,
    ) -> None:
        """Initialize the Google auth provider.

        Args:
            client_id: The Google OAuth client ID for token validation.
                      If not provided, reads from GOOGLE_CLIENT_ID env var.
        """
        self.client_id = client_id or os.getenv("GOOGLE_CLIENT_ID")
        if not self.client_id:
            raise ValueError("Google client ID is required for token validation")
        self._request = requests.Request()

    def _validate_id_token(self, token: str) -> dict:
        """Validate a Google ID token (JWT format)."""
        claims = id_token.verify_oauth2_token(
            token,
            self._request,
            self.client_id,
        )
        if not claims.get("email_verified", False):
            raise ValueError("Email not verified")
        return claims

    def _validate_access_token(self, token: str) -> dict:
        """Validate a Google access token using tokeninfo endpoint."""
        response = http_requests.get(
            f"https://oauth2.googleapis.com/tokeninfo?access_token={token}"
        )
        if response.status_code != 200:
            raise ValueError(f"Invalid access token: {response.text}")

        token_info = response.json()

        if "error" in token_info:
            raise ValueError(f"Token error: {token_info['error']}")

        userinfo_response = http_requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token}"},
        )
        if userinfo_response.status_code != 200:
            raise ValueError("Failed to get user info")

        userinfo = userinfo_response.json()

        return {
            "sub": userinfo.get("sub"),
            "email": userinfo.get("email"),
            "email_verified": userinfo.get("email_verified", False),
            "name": userinfo.get("name"),
            "picture": userinfo.get("picture"),
        }

    def validate_token(self, token: str) -> dict:
        """Validate a Google token (ID token or access token).

        Automatically detects token type based on format:
        - JWT (3 dot-separated parts) -> ID token validation
        - Other -> Access token validation

        Args:
            token: The Google token to validate.

        Returns:
            A dictionary containing user info including:
            - email: The user's email address
            - sub: The user's unique Google ID
            - name: The user's display name (if available)
            - picture: URL to the user's profile picture (if available)

        Raises:
            ValueError: If the token is invalid or expired.
        """
        try:
            if token.count(".") == 2:
                return self._validate_id_token(token)
            else:
                return self._validate_access_token(token)
        except Exception as e:
            raise ValueError(f"Invalid token: {e}")
