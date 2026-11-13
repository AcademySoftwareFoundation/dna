"""Helpers for DNA session ensure/sync flows."""

from typing import Optional

from dna.models.session import ExternalSession, Session
from dna.session_providers.session_provider_base import SessionProviderBase
from dna.storage_providers.storage_provider_base import StorageProviderBase


async def ensure_session_for_external(
    storage: StorageProviderBase,
    external: ExternalSession,
) -> Session:
    """Find or create a DNA session for an external catalog entry."""
    existing = await storage.get_session_by_external_id(external.id)
    if existing is not None:
        updates: dict = {}
        if external.name and existing.name != external.name:
            updates["name"] = external.name
        if existing.project_id != external.project_id:
            updates["project_id"] = external.project_id
        if updates:
            updated = await storage.update_session(existing.id, updates)
            return updated or existing
        return existing
    return await storage.create_session(
        {
            "external_id": external.id,
            "project_id": external.project_id,
            "name": external.name,
            "playlist_ids": [],
        }
    )


async def sync_project_sessions(
    storage: StorageProviderBase,
    provider: Optional[SessionProviderBase],
    project_id: str,
) -> list[Session]:
    """Sync external catalog into DNA sessions and return project sessions."""
    if provider is not None:
        for external in provider.get_sessions_for_project(project_id):
            await ensure_session_for_external(storage, external)
    return await storage.get_sessions_for_project(project_id)


async def ensure_implicit_session_for_playlist(
    storage: StorageProviderBase,
    project_id: str,
    playlist_id: str,
) -> Session:
    """Find or create an implicit DNA session for a single playlist."""
    existing = await storage.get_implicit_session_for_playlist(project_id, playlist_id)
    if existing is not None:
        return existing
    return await storage.create_session(
        {
            "external_id": None,
            "project_id": project_id,
            "name": f"Playlist {playlist_id}",
            "playlist_ids": [playlist_id],
        }
    )
