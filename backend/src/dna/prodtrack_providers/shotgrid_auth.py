"""ShotGrid authentication provider implementation."""

import os
from typing import Any, Optional

from shotgun_api3 import Shotgun

from dna.prodtrack_providers.shotgrid import ShotgridProvider


class ShotgridAuthenticationProvider:
    """Provider for ShotGrid authentication."""

    @staticmethod
    def authenticate(
        username: str, password: str, provider_url: Optional[str] = None
    ) -> dict[str, Any]:
        """Authenticate a user with ShotGrid and return session token and user info.

        Args:
            username: User login/username
            password: User password
            provider_url: Optional ShotGrid URL. If not provided, uses SHOTGRID_URL env var.

        Returns:
            Dictionary containing 'token' and 'email'

        Raises:
            ValueError: If authentication fails
        """
        url = provider_url or os.getenv("SHOTGRID_URL")
        if not url:
            raise ValueError("SHOTGRID_URL not configured")

        try:
            sg = Shotgun(url, login=username, password=password)
            token = sg.get_session_token()
            user_data = sg.find_one(
                "HumanUser", filters=[["login", "is", username]], fields=["email"]
            )

            if not user_data:
                raise ValueError(f"User not found: {username}")

            email = user_data.get("email")
            if not email:
                raise ValueError("User has no email address configured")

            return {"token": token, "email": email}
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Authentication failed: {str(e)}") from e

    @staticmethod
    def authenticate_passwordless(username: str) -> dict[str, Any]:
        """Resolve user identity without password and without issuing a token."""
        provider = ShotgridProvider()

        try:
            if "@" in username:
                user = provider.get_user_by_email(username)
            else:
                user = provider.get_user_by_login(username)
        except ValueError as exc:
            raise ValueError(f"Authentication failed: {str(exc)}") from exc

        if not user.email:
            raise ValueError("User has no email address configured")

        return {"token": None, "email": user.email}
