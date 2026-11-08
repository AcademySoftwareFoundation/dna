"""In-memory session provider for local development and tests."""

from datetime import datetime, timezone
from itertools import count
from typing import Optional

from dna.models.session import Session
from dna.session_providers.session_provider_base import SessionProviderBase

_SAMPLE_NAMES = ("Morning dailies", "Afternoon review")


class MockSessionProvider(SessionProviderBase):
    """Session provider that keeps sessions in memory.

    The first time a project's sessions are listed, two sample sessions are
    created for that project. ``create_session`` appends to the same store.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._seeded_projects: set[str] = set()
        self._ids = count(1)

    def _new_id(self) -> str:
        return f"mock-session-{next(self._ids)}"

    def _seed(self, project_id: str) -> None:
        if project_id in self._seeded_projects:
            return
        self._seeded_projects.add(project_id)
        now = datetime.now(timezone.utc)
        for name in _SAMPLE_NAMES:
            session_id = self._new_id()
            self._sessions[session_id] = Session(
                id=session_id,
                name=name,
                project_id=project_id,
                created_at=now,
                updated_at=now,
            )

    def get_sessions_for_project(self, project_id: str) -> list[Session]:
        """Return this project's sessions, seeding samples on first list."""
        self._seed(project_id)
        return [
            session
            for session in self._sessions.values()
            if session.project_id == project_id
        ]

    def get_session(self, session_id: str) -> Optional[Session]:
        """Return one session, or None when it does not exist."""
        return self._sessions.get(session_id)

    def create_session(self, project_id: str, name: str) -> Session:
        """Append a session for the project."""
        now = datetime.now(timezone.utc)
        session = Session(
            id=self._new_id(),
            name=name,
            project_id=project_id,
            created_at=now,
            updated_at=now,
        )
        self._sessions[session.id] = session
        return session
