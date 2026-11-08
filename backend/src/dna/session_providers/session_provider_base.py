"""Session Provider Base.

Defines the abstract base class for session providers. Session providers
supply external review sessions that DNA links to playlists. Later providers
may also consume events from the session.
"""

import os
from abc import ABC, abstractmethod
from typing import Optional

from dna.models.session import Session


class SessionProviderBase(ABC):
    """Abstract base class for session providers."""

    @abstractmethod
    def get_sessions_for_project(self, project_id: str) -> list[Session]:
        """Return sessions belonging to a project."""

    @abstractmethod
    def get_session(self, session_id: str) -> Optional[Session]:
        """Return one session, or None when it does not exist."""

    @abstractmethod
    def create_session(self, project_id: str, name: str) -> Session:
        """Create a session in the external system.

        Providers that cannot create sessions raise NotImplementedError.
        """


def get_session_provider() -> Optional[SessionProviderBase]:
    """Return the configured session provider.

    ``SESSION_PROVIDER`` selects the implementation:

    - ``none`` (default): sessions are disabled and this returns None.
    - ``mock``: in-memory provider that seeds sample sessions.

    The mock import stays inside the branch so unused providers are not
    loaded, and so this module and the mock do not import each other at
    module scope.
    """
    provider = os.getenv("SESSION_PROVIDER", "none").lower()

    if provider == "none":
        return None
    if provider == "mock":
        from dna.session_providers.mock_session_provider import MockSessionProvider

        return MockSessionProvider()
    raise ValueError(f"Unknown session provider: {provider}")
