"""Session Provider Base.

Defines the abstract base class for session providers. Session providers
supply an external catalog of review sessions. DNA stores its own Session
documents and syncs them by ``external_id``.
"""

import os
from abc import ABC, abstractmethod
from typing import Optional

from dna.models.session import ExternalSession


class SessionProviderBase(ABC):
    """Abstract base class for session providers (external catalog only)."""

    @abstractmethod
    def get_sessions_for_project(self, project_id: str) -> list[ExternalSession]:
        """Return external sessions belonging to a project."""

    @abstractmethod
    def get_session(self, session_id: str) -> Optional[ExternalSession]:
        """Return one external session, or None when it does not exist."""

    @abstractmethod
    def create_session(self, project_id: str, name: str) -> ExternalSession:
        """Create a session in the external system.

        Providers that cannot create sessions raise NotImplementedError.
        """


def get_session_provider() -> Optional[SessionProviderBase]:
    """Return the configured session provider.

    ``SESSION_PROVIDER`` selects the implementation:

    - ``none`` (default): no external catalog; DNA sessions still work.
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
