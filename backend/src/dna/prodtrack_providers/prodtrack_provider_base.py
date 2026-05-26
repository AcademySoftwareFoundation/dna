from __future__ import annotations

import os
from datetime import date
from typing import TYPE_CHECKING, Any
import os
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from dna.models.entity import EntityBase, Playlist, Project, User, Version


class UserNotFoundError(Exception):
    """Raised when a user is not found in the production tracking system."""
    pass


class ProdtrackProviderBase(ABC):
    """Abstract base for all production tracking providers.

    Subclasses must implement every ``@abstractmethod``.  Adding a new provider
    (e.g. Ftrack) means subclassing this and implementing all methods — no
    changes to callers or this base class are needed (Open/Closed Principle).
    """

    def __init__(self):
        pass

    @staticmethod
    def build_version_context(version: Version) -> str:
        """Format a Version entity as plain text for LLM prompts."""
        parts: list[str] = []
        if version.name:
            parts.append(f"Version: {version.name}")
        if version.entity:
            entity_type = version.entity.__class__.__name__
            parts.append(f"{entity_type}: {version.entity.name}")
        if version.task:
            if version.task.name:
                parts.append(f"Task: {version.task.name}")
            if version.task.pipeline_step and version.task.pipeline_step.get("name"):
                parts.append(f"Department: {version.task.pipeline_step['name']}")
        if version.status:
            parts.append(f"Status: {version.status}")
        if version.description:
            parts.append(f"Description: {version.description}")
        return "\n".join(parts) if parts else "No version context available."

    def _get_object_type(self, object_type: str) -> type["EntityBase"]:
        from dna.models.entity import ENTITY_MODELS, EntityBase
        return ENTITY_MODELS.get(object_type, EntityBase)

    @abstractmethod
    def get_entity(self, entity_type: str, entity_id: int, resolve_links: bool = True) -> "EntityBase":
        """Fetch a single entity by type and ID."""

    @abstractmethod
    def add_entity(self, entity_type: str, entity: "EntityBase") -> "EntityBase":
        """Create a new entity and return the persisted version."""

    @abstractmethod
    def find(self, entity_type: str, filters: list[dict[str, Any]], limit: int = 0) -> list["EntityBase"]:
        """Return entities matching the given filters."""

    @abstractmethod
    def search(self, query: str, entity_types: list[str], project_id: int | None = None, limit: int = 10) -> list[dict[str, Any]]:
        """Full-text search across one or more entity types."""

    @abstractmethod
    def get_user_by_email(self, user_email: str) -> "User":
        """Return the User record for the given email address."""

    @abstractmethod
    def get_projects_for_user(self, user_email: str) -> list["Project"]:
        """Return projects accessible by the given user."""

    @abstractmethod
    def get_playlists_for_project(self, project_id: int) -> list["Playlist"]:
        """Return all playlists belonging to the project."""

    @abstractmethod
    def get_versions_for_playlist(self, playlist_id: int) -> list["Version"]:
        """Return all versions in the playlist."""

    @abstractmethod
    def get_version_statuses(self, project_id: int | None = None) -> list[dict[str, str]]:
        """Return valid version status codes (optionally scoped to a project)."""

    @abstractmethod
    def publish_note(self, version_id: int, content: str, subject: str, to_users: list[int], cc_users: list[int], links: list["EntityBase"], author_email: str | None = None, version_status: str | None = None) -> int:
        """Create and publish a note; return the new note ID."""

    @abstractmethod
    def update_version_status(self, version_id: int, status: str) -> bool:
        """Update the status of a version. Returns True on success."""

    @abstractmethod
    def attach_file_to_note(self, note_id: int, file_path: str, display_name: str) -> bool:
        """Attach a local file to an existing note. Returns True on success."""

    def publish_transcript(
        self,
        *,
        project_id: int,
        playlist_id: int,
        version_id: int,
        meeting_id: str,
        meeting_date: date,
        platform: str,
        body: str,
    ) -> int:
        """Create a transcript row in the production tracking system.

        Returns the entity ID of the newly-created row.
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def update_transcript(
        self,
        *,
        entity_type: str,
        entity_id: int,
        body: str,
        meeting_date: date,
    ) -> bool:
        """Update body + meeting_date on an existing transcript entity.

        `entity_type` must come from the caller's bookkeeping (whichever
        custom-entity slot the row was originally created in). Reading the
        current env var here would misfire if studios migrate between slots.

        Only body and meeting_date are touched on purpose; summary and other
        fields are left alone so manual edits on the tracking-system side
        survive a re-publish.
        """
        raise NotImplementedError("Subclasses must implement this method.")


def get_prodtrack_provider(
    user_token: Optional[str] = None,
    session_id: Optional[str] = None,
) -> ProdtrackProviderBase:
    """Get the production tracking provider.

    Args:
        user_token:  ShotGrid session token from the user's MongoDB session.
                     When provided, queries run as this user and ShotGrid
                     enforces their native permissions.
        session_id:  The user's DNA session ID.  Used to retrieve a pooled
                     SG connection from ShotGridConnectionPool, avoiding a
                     new TCP handshake per request.

    Returns:
        Configured ProdtrackProviderBase instance.

    Raises:
        ValueError: Unknown provider or missing credentials.
    """
    provider_type = os.getenv("PRODTRACK_PROVIDER", "shotgrid")

    if provider_type == "mock":
        from dna.prodtrack_providers.mock_provider import MockProdtrackProvider
        return MockProdtrackProvider()

    if provider_type == "shotgrid":
        sg_url = os.getenv("SHOTGRID_URL")
        if not sg_url:
            raise ValueError(
                "SHOTGRID_URL is required. Use PRODTRACK_PROVIDER=mock for local dev."
            )
        from dna.prodtrack_providers.shotgrid import ShotgridProvider

        if user_token:
            # user_token is the ShotGrid Bearer token — used as a presence signal.
            # For login+password auth (PAT path), we retrieve username and password
            # from the session to build a shotgun_api3 connection.
            from dna.auth.session_store import get_session_store
            store = get_session_store()
            session = store.get_session(session_id) if session_id else None
            if session and session.sg_password and session.sg_username:
                return ShotgridProvider(
                    login=session.sg_username,     # ShotGrid login name (never Bearer token)
                    password=session.sg_password,  # legacy password stored server-side
                    session_id=session_id,
                )
            # Fallback: no stored password (e.g. future SSO path) — use sudo via script creds
            return ShotgridProvider(sudo_user=user_token, session_id=session_id)
        else:
            # Script-auth fallback: background jobs / non-SG-SSO auth providers.
            sg_script = os.getenv("SHOTGRID_SCRIPT_NAME")
            sg_key = os.getenv("SHOTGRID_API_KEY")
            if not all([sg_script, sg_key]):
                raise ValueError(
                    "Script credentials missing. Set SHOTGRID_SCRIPT_NAME and "
                    "SHOTGRID_API_KEY, or use PRODTRACK_PROVIDER=mock."
                )
            return ShotgridProvider()

    raise ValueError(f"Unknown PRODTRACK_PROVIDER: '{provider_type}'. Valid: mock, shotgrid.")
