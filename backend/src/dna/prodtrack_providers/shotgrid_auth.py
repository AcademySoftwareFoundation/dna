"""ShotGrid authentication provider implementation."""

import os
from typing import Any, Optional

from shotgun_api3 import Shotgun


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
            # Initialize connection to verify credentials and get token
            sg = Shotgun(url, login=username, password=password)
            token = sg.get_session_token()

            # We need to fetch the user details (email)
            # We can use the same connection object 'sg' if it supports find/find_one after auth
            # OR create a new connection with the token.
            # Using the existing 'sg' instance is more efficient as it's already authenticated/connected (presumably).
            # However, shotgun_api3 behaviour: 'sg' initialized with login/pass IS valid.

            # Implementation note: We need to find the user by login to get the email.
            user_data = sg.find_one(
                "HumanUser", filters=[["login", "is", username]], fields=["email"]
            )

            if not user_data:
                raise ValueError(f"User not found: {username}")

            email = user_data.get("email")
            if not email:
                raise ValueError("User has no email address configured")

            return {"token": token, "email": email}

        except Exception as e:
            raise ValueError(f"Authentication failed: {str(e)}")
