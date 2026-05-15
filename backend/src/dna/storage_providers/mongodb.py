"""MongoDB Storage Provider.

MongoDB implementation of the storage provider interface using PyMongo's native async API.
"""

import os
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from pymongo import AsyncMongoClient, ReturnDocument

from dna.models.draft_note import DraftNote, DraftNoteUpdate
from dna.models.playlist_metadata import PlaylistMetadata, PlaylistMetadataUpdate
from dna.models.qc_check import (
    DEFAULT_ACTION_ITEM_CHECK,
    NoteQCCheck,
    NoteQCCheckCreate,
    NoteQCCheckUpdate,
)
from dna.models.stored_segment import StoredSegment, StoredSegmentCreate
from dna.models.user_settings import UserSettings, UserSettingsUpdate
from dna.storage_providers.storage_provider_base import StorageProviderBase


class MongoDBStorageProvider(StorageProviderBase):
    """MongoDB implementation of the storage provider."""

    def __init__(self) -> None:
        self._client: Optional[AsyncMongoClient[Any]] = None
        self._indexes_ensured = False

    async def ensure_indexes(self) -> None:
        """Create collection indexes. Idempotent; safe to call on every startup.

        The compound unique index on the `segments` upsert key makes
        `upsert_segment` O(log n) instead of a full-collection scan — at
        Vexa's refine-heavy write rate, scans become user-visible at ~100k
        segments and timeouts at ~1M.
        """
        if self._indexes_ensured:
            return
        await self.segments_collection.create_index(
            [("segment_id", 1), ("playlist_id", 1), ("version_id", 1)],
            unique=True,
            name="segments_upsert_key",
        )
        await self.segments_collection.create_index(
            [("playlist_id", 1), ("version_id", 1), ("absolute_start_time", 1)],
            name="segments_list_by_version",
        )
        await self.qc_checks_collection.create_index(
            [("user_email", 1)],
            name="qc_checks_by_user",
        )
        self._indexes_ensured = True

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

    @property
    def user_settings_collection(self) -> Any:
        return self.db.user_settings

    @property
    def qc_checks_collection(self) -> Any:
        return self.db.qc_checks

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

    async def get_draft_notes_for_playlist(self, playlist_id: int) -> list[DraftNote]:
        """Get all draft notes for a playlist (all users, all versions)."""
        query = {"playlist_id": playlist_id}
        cursor = self.draft_notes.find(query)
        results = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            results.append(DraftNote(**doc))
        return results

    async def get_draft_note(
        self, user_email: str, playlist_id: int, version_id: int
    ) -> Optional[DraftNote]:
        query = {
            **self._build_query(user_email, playlist_id, version_id),
        }
        doc = await self.draft_notes.find_one(query)
        if doc:
            doc["_id"] = str(doc["_id"])
            return DraftNote(**doc)
        return None

    async def upsert_draft_note(
        self, user_email: str, playlist_id: int, version_id: int, data: DraftNoteUpdate
    ) -> DraftNote:
        now = datetime.now(timezone.utc)
        query = {
            **self._build_query(user_email, playlist_id, version_id),
        }

        update_data = data.model_dump(exclude_none=True)
        set_on_insert = {
            "created_at": now,
            "user_email": user_email,
            "playlist_id": playlist_id,
            "version_id": version_id,
        }
        if "published" not in update_data:
            update_data["published"] = False

        update: dict[str, Any] = {
            "$set": {**update_data, "updated_at": now},
            "$setOnInsert": set_on_insert,
        }
        result = await self.draft_notes.find_one_and_update(
            query, update, upsert=True, return_document=ReturnDocument.AFTER
        )
        result["_id"] = str(result["_id"])
        return DraftNote(**result)

    async def upsert_published_note(
        self, user_email: str, playlist_id: int, version_id: int, data: DraftNoteUpdate
    ) -> DraftNote:
        now = datetime.now(timezone.utc)
        # Query for the note (same query as upsert_draft_note, no "published: True" filter)
        # This ensures we update the SAME record, not create a duplicate
        query = self._build_query(user_email, playlist_id, version_id)

        update_data = data.model_dump(exclude_none=True)
        set_on_insert = {
            "created_at": now,
            "user_email": user_email,
            "playlist_id": playlist_id,
            "version_id": version_id,
        }

        existing = await self.draft_notes.find_one(query)
        if existing:
            # If existing note has unpublished changes (published=False or edited=True),
            # do not overwrite it with the published version from sync.
            # This preserves local edits when re-fetching published notes.
            if not existing.get("published", True) or existing.get("edited", False):
                existing["_id"] = str(existing["_id"])
                return DraftNote(**existing)

        update: dict[str, Any] = {
            "$set": {**update_data, "updated_at": now},
            "$setOnInsert": set_on_insert,
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
        update_fields = {
            k: v
            for k, v in data.model_dump().items()
            if v is not None and k != "clear_resumed_at"
        }

        unset_fields: dict[str, Any] = {}

        if data.clear_resumed_at:
            unset_fields["transcription_resumed_at"] = ""
        elif data.transcription_paused is False:
            existing = await self.playlist_metadata_collection.find_one(query)
            if existing and existing.get("transcription_paused", False):
                update_fields["transcription_resumed_at"] = datetime.now(timezone.utc)

        update: dict[str, Any] = {
            "$set": update_fields,
            "$setOnInsert": {"playlist_id": playlist_id},
        }
        if unset_fields:
            update["$unset"] = unset_fields

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

        # `segment_id` is already in `data.model_dump()` — MongoDB rejects an
        # update that lists the same field in both `$set` and `$setOnInsert`.
        # `playlist_id`/`version_id` stay in `$setOnInsert` because they aren't
        # part of `StoredSegmentCreate` (they come from the enclosing context).
        update: dict[str, Any] = {
            "$set": {
                **data.model_dump(),
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
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

    async def get_user_settings(self, user_email: str) -> Optional[UserSettings]:
        """Get user settings by email."""
        query = {"user_email": user_email}
        doc = await self.user_settings_collection.find_one(query)
        if doc:
            doc["_id"] = str(doc["_id"])
            return UserSettings(**doc)
        return None

    async def upsert_user_settings(
        self, user_email: str, data: UserSettingsUpdate
    ) -> UserSettings:
        """Create or update user settings."""
        now = datetime.now(timezone.utc)
        query = {"user_email": user_email}
        update_fields = {
            k: v
            for k, v in data.model_dump(exclude_unset=True).items()
            if v is not None
        }
        defaults = {
            "note_prompt": "",
            "regenerate_on_version_change": False,
            "regenerate_on_transcript_update": False,
            "sync_prodtrack_tab_on_version_change": True,
        }
        set_on_insert = {
            "created_at": now,
            "user_email": user_email,
        }
        for key, value in defaults.items():
            if key not in update_fields:
                set_on_insert[key] = value
        update: dict[str, Any] = {
            "$set": {**update_fields, "updated_at": now},
            "$setOnInsert": set_on_insert,
        }
        result = await self.user_settings_collection.find_one_and_update(
            query, update, upsert=True, return_document=ReturnDocument.AFTER
        )
        result["_id"] = str(result["_id"])
        return UserSettings(**result)

    async def delete_user_settings(self, user_email: str) -> bool:
        """Delete user settings. Returns True if deleted."""
        query = {"user_email": user_email}
        result = await self.user_settings_collection.delete_one(query)
        return result.deleted_count > 0

    async def get_qc_checks(self, user_email: str) -> list[NoteQCCheck]:
        query = {"user_email": user_email}
        cursor = self.qc_checks_collection.find(query)
        results: list[NoteQCCheck] = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            results.append(NoteQCCheck(**doc))
        if results:
            return sorted(results, key=lambda c: (c.name.lower(), c.id))
        now = datetime.now(timezone.utc)
        default = DEFAULT_ACTION_ITEM_CHECK
        await self.qc_checks_collection.find_one_and_update(
            {"user_email": user_email, "name": default.name},
            {
                "$setOnInsert": {
                    "user_email": user_email,
                    "name": default.name,
                    "prompt": default.prompt,
                    "severity": default.severity,
                    "enabled": default.enabled,
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        cursor = self.qc_checks_collection.find(query)
        results = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            results.append(NoteQCCheck(**doc))
        return sorted(results, key=lambda c: (c.name.lower(), c.id))

    async def create_qc_check(
        self, user_email: str, data: NoteQCCheckCreate
    ) -> NoteQCCheck:
        now = datetime.now(timezone.utc)
        doc: dict[str, Any] = {
            "user_email": user_email,
            "name": data.name,
            "prompt": data.prompt,
            "severity": data.severity,
            "enabled": data.enabled,
            "created_at": now,
            "updated_at": now,
        }
        insert = await self.qc_checks_collection.insert_one(doc)
        stored = await self.qc_checks_collection.find_one({"_id": insert.inserted_id})
        assert stored is not None
        stored["_id"] = str(stored["_id"])
        return NoteQCCheck(**stored)

    async def update_qc_check(
        self, user_email: str, check_id: str, data: NoteQCCheckUpdate
    ) -> Optional[NoteQCCheck]:
        try:
            oid = ObjectId(check_id)
        except Exception:
            return None
        update_fields = {
            k: v
            for k, v in data.model_dump(exclude_unset=True).items()
            if v is not None
        }
        if not update_fields:
            doc = await self.qc_checks_collection.find_one(
                {"_id": oid, "user_email": user_email}
            )
        else:
            update_fields["updated_at"] = datetime.now(timezone.utc)
            doc = await self.qc_checks_collection.find_one_and_update(
                {"_id": oid, "user_email": user_email},
                {"$set": update_fields},
                return_document=ReturnDocument.AFTER,
            )
        if not doc:
            return None
        doc["_id"] = str(doc["_id"])
        return NoteQCCheck(**doc)

    async def delete_qc_check(self, user_email: str, check_id: str) -> bool:
        try:
            oid = ObjectId(check_id)
        except Exception:
            return False
        result = await self.qc_checks_collection.delete_one(
            {"_id": oid, "user_email": user_email}
        )
        return result.deleted_count > 0
