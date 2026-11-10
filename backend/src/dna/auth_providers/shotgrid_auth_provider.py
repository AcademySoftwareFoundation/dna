"""ShotGrid Auth Provider.

Verifies a username and password against ShotGrid's HumanUser records. It
reuses ShotgridProvider for the script connection and user lookup, but is
configured separately from the production tracking provider so the two can
point at different sites (or the tracker can be something else entirely).

Configuration (environment variables), each falling back to the SHOTGRID_*
variable of the same suffix:
    AUTH_SHOTGRID_URL
    AUTH_SHOTGRID_SCRIPT_NAME
    AUTH_SHOTGRID_API_KEY
"""

import os
import threading
from typing import Optional

from dna.auth.errors import AuthenticationError
from dna.auth.identity import CurrentUser
from dna.auth_providers.auth_provider_base import AuthProviderBase
from dna.prodtrack_providers.shotgrid import ShotgridProvider


class ShotgridAuthProvider(AuthProviderBase):
    """Authenticate users with their ShotGrid login and password."""

    def __init__(self, sg_provider: Optional[ShotgridProvider] = None):
        """Create the provider.

        Args:
            sg_provider: ShotGrid connection to authenticate against. Defaults
                to a dedicated connection built from AUTH_SHOTGRID_* settings.
                It must not be shared with the production tracking provider:
                ``authenticate_human_user`` temporarily swaps the connection's
                credentials while it runs.
        """
        self._sg_provider = sg_provider or ShotgridProvider(
            url=os.getenv("AUTH_SHOTGRID_URL"),
            script_name=os.getenv("AUTH_SHOTGRID_SCRIPT_NAME"),
            api_key=os.getenv("AUTH_SHOTGRID_API_KEY"),
        )
        self._lock = threading.Lock()

    def authenticate(self, username: str, password: str) -> CurrentUser:
        """Check the credentials with ShotGrid and return the user's identity.

        Raises:
            AuthenticationError: If ShotGrid rejects the credentials or the
                user has no email address.
        """
        if not username or not password:
            raise AuthenticationError("Username and password are required")

        with self._lock:
            sg_user = self._sg_provider.sg.authenticate_human_user(username, password)
        if not sg_user:
            raise AuthenticationError("Invalid username or password")

        user = self._sg_provider.get_user_by_id(str(sg_user["id"]))
        if not user.email:
            raise AuthenticationError(
                f"ShotGrid user {sg_user['login']!r} has no email address"
            )
        return CurrentUser(sub=sg_user["login"], email=user.email, name=user.name)
