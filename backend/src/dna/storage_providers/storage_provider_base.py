"""Storage Provider Base.

Abstract base class for storage providers and factory function.
"""

import os
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from dna.models.draft_note import DraftNote, DraftNoteUpdate
    from dna.models.playlist_metadata import PlaylistMetadata, PlaylistMetadataUpdate
    from dna.models.stored_segment import StoredSegment, StoredSegmentCreate
    from dna.models.user_settings import UserSettings, UserSettingsUpdate


class StorageProviderBase:
    """Abstract base class for storage providers."""

    async def get_draft_notes_for_version(
        self, playlist_id: int, version_id: int
    ) -> list["DraftNote"]:
        """Get all draft notes for a playlist/version (all users)."""
        raise NotImplementedError()

    async def get_draft_note(
        self, user_email: str, playlist_id: int, version_id: int
    ) -> Optional["DraftNote"]:
        """Get a draft note by composite key (user_email, playlist_id, version_id)."""
        raise NotImplementedError()

    async def upsert_draft_note(
        self,
        user_email: str,
        playlist_id: int,
        version_id: int,
        data: "DraftNoteUpdate",
    ) -> "DraftNote":
        """Create or update a draft note."""
        raise NotImplementedError()

    async def delete_draft_note(
        self, user_email: str, playlist_id: int, version_id: int
    ) -> bool:
        """Delete a draft note. Returns True if deleted."""
        raise NotImplementedError()

    async def get_playlist_metadata(
        self, playlist_id: int
    ) -> Optional["PlaylistMetadata"]:
        """Get playlist metadata by playlist ID."""
        raise NotImplementedError()

    async def get_playlist_metadata_by_meeting_id(
        self, meeting_id: str
    ) -> Optional["PlaylistMetadata"]:
        """Get playlist metadata by meeting ID (reverse lookup)."""
        raise NotImplementedError()

    async def upsert_playlist_metadata(
        self, playlist_id: int, data: "PlaylistMetadataUpdate"
    ) -> "PlaylistMetadata":
        """Create or update playlist metadata."""
        raise NotImplementedError()

    async def delete_playlist_metadata(self, playlist_id: int) -> bool:
        """Delete playlist metadata. Returns True if deleted."""
        raise NotImplementedError()

    async def upsert_segment(
        self,
        playlist_id: int,
        version_id: int,
        segment_id: str,
        data: "StoredSegmentCreate",
    ) -> tuple["StoredSegment", bool]:
        """Create or update a segment. Returns (segment, is_new)."""
        raise NotImplementedError()

    async def get_segments_for_version(
        self, playlist_id: int, version_id: int
    ) -> list["StoredSegment"]:
        """Get all segments for a version, ordered by start time."""
        raise NotImplementedError()

    async def get_user_settings(self, user_email: str) -> Optional["UserSettings"]:
        """Get user settings by email."""
        raise NotImplementedError()

    async def upsert_user_settings(
        self, user_email: str, data: "UserSettingsUpdate"
    ) -> "UserSettings":
        """Create or update user settings."""
        raise NotImplementedError()

    async def delete_user_settings(self, user_email: str) -> bool:
        """Delete user settings. Returns True if deleted."""
        raise NotImplementedError()


def get_storage_provider() -> StorageProviderBase:
    """Factory function to get the configured storage provider."""
    provider_type = os.getenv("STORAGE_PROVIDER", "mongodb")

    if provider_type == "mongodb":
        from dna.storage_providers.mongodb import MongoDBStorageProvider

        return MongoDBStorageProvider()

    raise ValueError(f"Unknown storage provider: {provider_type}")
