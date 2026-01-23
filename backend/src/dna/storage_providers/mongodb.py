"""MongoDB Storage Provider.

MongoDB implementation of the storage provider interface using PyMongo's native async API.
"""

import os
from datetime import datetime, timezone
from typing import Any, Optional

from pymongo import AsyncMongoClient, ReturnDocument

from dna.models.draft_note import DraftNote, DraftNoteUpdate
from dna.models.playlist_metadata import PlaylistMetadata, PlaylistMetadataUpdate
from dna.models.stored_segment import StoredSegment, StoredSegmentCreate
from dna.storage_providers.storage_provider_base import StorageProviderBase


class MongoDBStorageProvider(StorageProviderBase):
    """MongoDB implementation of the storage provider."""

    def __init__(self) -> None:
        self._client: Optional[AsyncMongoClient[Any]] = None

    @property
    def client(self) -> AsyncMongoClient[Any]:
        if self._client is None:
            mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
            self._client = AsyncMongoClient(mongo_url)
        return self._client

    @property
    def db(self) -> Any:
        return self.client.dna

    @property
    def draft_notes(self) -> Any:
        return self.db.draft_notes

    @property
    def playlist_metadata_collection(self) -> Any:
        return self.db.playlist_metadata

    @property
    def segments_collection(self) -> Any:
        return self.db.segments

    def _build_query(
        self, user_email: str, playlist_id: int, version_id: int
    ) -> dict[str, Any]:
        """Build the composite key query."""
        return {
            "user_email": user_email,
            "playlist_id": playlist_id,
            "version_id": version_id,
        }

    async def get_draft_notes_for_version(
        self, playlist_id: int, version_id: int
    ) -> list[DraftNote]:
        """Get all draft notes for a playlist/version (all users)."""
        query = {"playlist_id": playlist_id, "version_id": version_id}
        cursor = self.draft_notes.find(query)
        results = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            results.append(DraftNote(**doc))
        return results

    async def get_draft_note(
        self, user_email: str, playlist_id: int, version_id: int
    ) -> Optional[DraftNote]:
        query = self._build_query(user_email, playlist_id, version_id)
        doc = await self.draft_notes.find_one(query)
        if doc:
            doc["_id"] = str(doc["_id"])
            return DraftNote(**doc)
        return None

    async def upsert_draft_note(
        self, user_email: str, playlist_id: int, version_id: int, data: DraftNoteUpdate
    ) -> DraftNote:
        now = datetime.now(timezone.utc)
        query = self._build_query(user_email, playlist_id, version_id)

        update: dict[str, Any] = {
            "$set": {**data.model_dump(), "updated_at": now},
            "$setOnInsert": {
                "created_at": now,
                "user_email": user_email,
                "playlist_id": playlist_id,
                "version_id": version_id,
            },
        }
        result = await self.draft_notes.find_one_and_update(
            query, update, upsert=True, return_document=ReturnDocument.AFTER
        )
        result["_id"] = str(result["_id"])
        return DraftNote(**result)

    async def delete_draft_note(
        self, user_email: str, playlist_id: int, version_id: int
    ) -> bool:
        query = self._build_query(user_email, playlist_id, version_id)
        result = await self.draft_notes.delete_one(query)
        return result.deleted_count > 0

    async def get_playlist_metadata(
        self, playlist_id: int
    ) -> Optional[PlaylistMetadata]:
        query = {"playlist_id": playlist_id}
        doc = await self.playlist_metadata_collection.find_one(query)
        if doc:
            doc["_id"] = str(doc["_id"])
            return PlaylistMetadata(**doc)
        return None

    async def get_playlist_metadata_by_meeting_id(
        self, meeting_id: str
    ) -> Optional[PlaylistMetadata]:
        query = {"meeting_id": meeting_id}
        doc = await self.playlist_metadata_collection.find_one(query)
        if doc:
            doc["_id"] = str(doc["_id"])
            return PlaylistMetadata(**doc)
        return None

    async def upsert_playlist_metadata(
        self, playlist_id: int, data: PlaylistMetadataUpdate
    ) -> PlaylistMetadata:
        query = {"playlist_id": playlist_id}
        update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
        update: dict[str, Any] = {
            "$set": update_fields,
            "$setOnInsert": {"playlist_id": playlist_id},
        }
        result = await self.playlist_metadata_collection.find_one_and_update(
            query, update, upsert=True, return_document=ReturnDocument.AFTER
        )
        result["_id"] = str(result["_id"])
        return PlaylistMetadata(**result)

    async def delete_playlist_metadata(self, playlist_id: int) -> bool:
        query = {"playlist_id": playlist_id}
        result = await self.playlist_metadata_collection.delete_one(query)
        return result.deleted_count > 0

    async def upsert_segment(
        self,
        playlist_id: int,
        version_id: int,
        segment_id: str,
        data: StoredSegmentCreate,
    ) -> tuple[StoredSegment, bool]:
        """Create or update a segment. Returns (segment, is_new)."""
        now = datetime.now(timezone.utc)
        query = {
            "segment_id": segment_id,
            "playlist_id": playlist_id,
            "version_id": version_id,
        }

        existing = await self.segments_collection.find_one(query)
        is_new = existing is None

        update: dict[str, Any] = {
            "$set": {
                **data.model_dump(),
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
                "segment_id": segment_id,
                "playlist_id": playlist_id,
                "version_id": version_id,
            },
        }

        result = await self.segments_collection.find_one_and_update(
            query, update, upsert=True, return_document=ReturnDocument.AFTER
        )
        result["_id"] = str(result["_id"])
        return StoredSegment(**result), is_new

    async def get_segments_for_version(
        self, playlist_id: int, version_id: int
    ) -> list[StoredSegment]:
        """Get all segments for a version, ordered by start time."""
        query = {"playlist_id": playlist_id, "version_id": version_id}
        cursor = self.segments_collection.find(query).sort("absolute_start_time", 1)
        results = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            results.append(StoredSegment(**doc))
        return results
