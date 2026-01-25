"""Tests for Storage Providers."""

from datetime import datetime, timezone
from unittest import mock

import pytest

from dna.models.draft_note import DraftNote, DraftNoteUpdate
from dna.models.playlist_metadata import PlaylistMetadata, PlaylistMetadataUpdate
from dna.models.stored_segment import StoredSegment, StoredSegmentCreate
from dna.storage_providers.mongodb import MongoDBStorageProvider
from dna.storage_providers.storage_provider_base import (
    StorageProviderBase,
    get_storage_provider,
)


class TestStorageProviderBase:
    """Tests for StorageProviderBase class."""

    @pytest.mark.asyncio
    async def test_get_draft_notes_for_version_raises_not_implemented(self):
        """Test that get_draft_notes_for_version raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_draft_notes_for_version(1, 1)

    @pytest.mark.asyncio
    async def test_get_draft_note_raises_not_implemented(self):
        """Test that get_draft_note raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_draft_note("user@test.com", 1, 1)

    @pytest.mark.asyncio
    async def test_upsert_draft_note_raises_not_implemented(self):
        """Test that upsert_draft_note raises NotImplementedError."""
        provider = StorageProviderBase()
        data = DraftNoteUpdate(content="test")
        with pytest.raises(NotImplementedError):
            await provider.upsert_draft_note("user@test.com", 1, 1, data)

    @pytest.mark.asyncio
    async def test_delete_draft_note_raises_not_implemented(self):
        """Test that delete_draft_note raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.delete_draft_note("user@test.com", 1, 1)

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_raises_not_implemented(self):
        """Test that get_playlist_metadata raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_playlist_metadata(1)

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_by_meeting_id_raises_not_implemented(self):
        """Test that get_playlist_metadata_by_meeting_id raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_playlist_metadata_by_meeting_id("meeting-123")

    @pytest.mark.asyncio
    async def test_upsert_playlist_metadata_raises_not_implemented(self):
        """Test that upsert_playlist_metadata raises NotImplementedError."""
        provider = StorageProviderBase()
        data = PlaylistMetadataUpdate(meeting_id="abc-123")
        with pytest.raises(NotImplementedError):
            await provider.upsert_playlist_metadata(1, data)

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_raises_not_implemented(self):
        """Test that delete_playlist_metadata raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.delete_playlist_metadata(1)

    @pytest.mark.asyncio
    async def test_upsert_segment_raises_not_implemented(self):
        """Test that upsert_segment raises NotImplementedError."""
        provider = StorageProviderBase()
        data = StoredSegmentCreate(
            text="Hello",
            speaker="John",
            absolute_start_time="2024-01-01T00:00:00Z",
            absolute_end_time="2024-01-01T00:00:01Z",
        )
        with pytest.raises(NotImplementedError):
            await provider.upsert_segment(1, 1, "seg-1", data)

    @pytest.mark.asyncio
    async def test_get_segments_for_version_raises_not_implemented(self):
        """Test that get_segments_for_version raises NotImplementedError."""
        provider = StorageProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_segments_for_version(1, 1)


class TestGetStorageProvider:
    """Tests for get_storage_provider factory function."""

    def test_returns_mongodb_provider_by_default(self):
        """Test that factory returns MongoDBStorageProvider by default."""
        with mock.patch.dict("os.environ", {}, clear=True):
            provider = get_storage_provider()
            assert isinstance(provider, MongoDBStorageProvider)

    def test_returns_mongodb_provider_when_configured(self):
        """Test that factory returns MongoDBStorageProvider when configured."""
        with mock.patch.dict("os.environ", {"STORAGE_PROVIDER": "mongodb"}):
            provider = get_storage_provider()
            assert isinstance(provider, MongoDBStorageProvider)

    def test_raises_error_for_unknown_provider(self):
        """Test that factory raises ValueError for unknown provider."""
        with mock.patch.dict("os.environ", {"STORAGE_PROVIDER": "unknown"}):
            with pytest.raises(ValueError, match="Unknown storage provider"):
                get_storage_provider()


class TestMongoDBStorageProvider:
    """Tests for MongoDBStorageProvider class."""

    @pytest.fixture
    def provider(self):
        """Create a MongoDBStorageProvider with mocked client."""
        with mock.patch.dict(
            "os.environ", {"MONGODB_URL": "mongodb://localhost:27017"}
        ):
            p = MongoDBStorageProvider()
            yield p

    def test_init(self, provider):
        """Test initialization."""
        assert provider._client is None

    def test_client_creates_client_on_first_access(self, provider):
        """Test that client is created on first access."""
        with mock.patch(
            "dna.storage_providers.mongodb.AsyncMongoClient"
        ) as mock_client_class:
            mock_client_instance = mock.MagicMock()
            mock_client_class.return_value = mock_client_instance

            client = provider.client

            assert client is mock_client_instance
            mock_client_class.assert_called_once()

    def test_client_returns_same_instance(self, provider):
        """Test that same client is returned."""
        mock_client = mock.MagicMock()
        provider._client = mock_client

        assert provider.client is mock_client

    def test_db_property(self, provider):
        """Test db property returns dna database."""
        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        provider._client = mock_client

        assert provider.db is mock_db

    def test_draft_notes_property(self, provider):
        """Test draft_notes property returns collection."""
        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_collection = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        assert provider.draft_notes is mock_collection

    def test_playlist_metadata_collection_property(self, provider):
        """Test playlist_metadata_collection property returns collection."""
        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_collection = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        assert provider.playlist_metadata_collection is mock_collection

    def test_segments_collection_property(self, provider):
        """Test segments_collection property returns collection."""
        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_collection = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.segments = mock_collection
        provider._client = mock_client

        assert provider.segments_collection is mock_collection

    def test_build_query(self, provider):
        """Test _build_query builds correct query."""
        query = provider._build_query("user@test.com", 1, 2)

        assert query == {
            "user_email": "user@test.com",
            "playlist_id": 1,
            "version_id": 2,
        }

    @pytest.mark.asyncio
    async def test_get_draft_notes_for_version(self, provider):
        """Test getting all draft notes for a version."""
        mock_collection = mock.MagicMock()

        now = datetime.now(timezone.utc)
        docs = [
            {
                "_id": "abc123",
                "user_email": "user1@test.com",
                "playlist_id": 1,
                "version_id": 2,
                "content": "Note 1",
                "created_at": now,
                "updated_at": now,
            },
            {
                "_id": "def456",
                "user_email": "user2@test.com",
                "playlist_id": 1,
                "version_id": 2,
                "content": "Note 2",
                "created_at": now,
                "updated_at": now,
            },
        ]

        async def async_generator():
            for doc in docs:
                yield doc

        mock_cursor = mock.MagicMock()
        mock_cursor.__aiter__ = lambda self: async_generator()
        mock_collection.find.return_value = mock_cursor

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        result = await provider.get_draft_notes_for_version(1, 2)

        assert len(result) == 2
        assert result[0].content == "Note 1"
        assert result[1].content == "Note 2"
        mock_collection.find.assert_called_once_with(
            {"playlist_id": 1, "version_id": 2}
        )

    @pytest.mark.asyncio
    async def test_get_draft_note_found(self, provider):
        """Test getting a draft note when found."""
        mock_collection = mock.MagicMock()

        now = datetime.now(timezone.utc)
        doc = {
            "_id": "abc123",
            "user_email": "user@test.com",
            "playlist_id": 1,
            "version_id": 2,
            "content": "Test content",
            "created_at": now,
            "updated_at": now,
        }

        mock_collection.find_one = mock.AsyncMock(return_value=doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        result = await provider.get_draft_note("user@test.com", 1, 2)

        assert result is not None
        assert result.content == "Test content"
        assert result.id == "abc123"

    @pytest.mark.asyncio
    async def test_get_draft_note_not_found(self, provider):
        """Test getting a draft note when not found."""
        mock_collection = mock.MagicMock()
        mock_collection.find_one = mock.AsyncMock(return_value=None)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        result = await provider.get_draft_note("user@test.com", 1, 2)

        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_draft_note(self, provider):
        """Test upserting a draft note."""
        mock_collection = mock.MagicMock()

        now = datetime.now(timezone.utc)
        result_doc = {
            "_id": "abc123",
            "user_email": "user@test.com",
            "playlist_id": 1,
            "version_id": 2,
            "content": "Updated content",
            "created_at": now,
            "updated_at": now,
        }

        mock_collection.find_one_and_update = mock.AsyncMock(return_value=result_doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        data = DraftNoteUpdate(content="Updated content")
        result = await provider.upsert_draft_note("user@test.com", 1, 2, data)

        assert result.content == "Updated content"
        mock_collection.find_one_and_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_draft_note_success(self, provider):
        """Test deleting a draft note successfully."""
        mock_collection = mock.MagicMock()
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 1
        mock_collection.delete_one = mock.AsyncMock(return_value=mock_result)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        result = await provider.delete_draft_note("user@test.com", 1, 2)

        assert result is True

    @pytest.mark.asyncio
    async def test_delete_draft_note_not_found(self, provider):
        """Test deleting a draft note that doesn't exist."""
        mock_collection = mock.MagicMock()
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 0
        mock_collection.delete_one = mock.AsyncMock(return_value=mock_result)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.draft_notes = mock_collection
        provider._client = mock_client

        result = await provider.delete_draft_note("user@test.com", 1, 2)

        assert result is False

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_found(self, provider):
        """Test getting playlist metadata when found."""
        mock_collection = mock.MagicMock()

        doc = {
            "_id": "abc123",
            "playlist_id": 1,
            "meeting_id": "abc-123",
            "platform": "google_meet",
        }

        mock_collection.find_one = mock.AsyncMock(return_value=doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        result = await provider.get_playlist_metadata(1)

        assert result is not None
        assert result.meeting_id == "abc-123"

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_not_found(self, provider):
        """Test getting playlist metadata when not found."""
        mock_collection = mock.MagicMock()
        mock_collection.find_one = mock.AsyncMock(return_value=None)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        result = await provider.get_playlist_metadata(999)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_by_meeting_id_found(self, provider):
        """Test getting playlist metadata by meeting ID when found."""
        mock_collection = mock.MagicMock()

        doc = {
            "_id": "abc123",
            "playlist_id": 1,
            "meeting_id": "abc-123",
            "platform": "google_meet",
        }

        mock_collection.find_one = mock.AsyncMock(return_value=doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        result = await provider.get_playlist_metadata_by_meeting_id("abc-123")

        assert result is not None
        assert result.playlist_id == 1

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_by_meeting_id_not_found(self, provider):
        """Test getting playlist metadata by meeting ID when not found."""
        mock_collection = mock.MagicMock()
        mock_collection.find_one = mock.AsyncMock(return_value=None)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        result = await provider.get_playlist_metadata_by_meeting_id("unknown")

        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_playlist_metadata(self, provider):
        """Test upserting playlist metadata."""
        mock_collection = mock.MagicMock()

        result_doc = {
            "_id": "abc123",
            "playlist_id": 1,
            "meeting_id": "abc-123",
            "platform": "google_meet",
        }

        mock_collection.find_one_and_update = mock.AsyncMock(return_value=result_doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        data = PlaylistMetadataUpdate(meeting_id="abc-123", platform="google_meet")
        result = await provider.upsert_playlist_metadata(1, data)

        assert result.meeting_id == "abc-123"
        mock_collection.find_one_and_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_success(self, provider):
        """Test deleting playlist metadata successfully."""
        mock_collection = mock.MagicMock()
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 1
        mock_collection.delete_one = mock.AsyncMock(return_value=mock_result)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        result = await provider.delete_playlist_metadata(1)

        assert result is True

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_not_found(self, provider):
        """Test deleting playlist metadata that doesn't exist."""
        mock_collection = mock.MagicMock()
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 0
        mock_collection.delete_one = mock.AsyncMock(return_value=mock_result)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.playlist_metadata = mock_collection
        provider._client = mock_client

        result = await provider.delete_playlist_metadata(999)

        assert result is False

    @pytest.mark.asyncio
    async def test_upsert_segment_new(self, provider):
        """Test upserting a new segment."""
        mock_collection = mock.MagicMock()

        now = datetime.now(timezone.utc)
        result_doc = {
            "_id": "abc123",
            "segment_id": "seg-1",
            "playlist_id": 1,
            "version_id": 2,
            "text": "Hello",
            "speaker": "John",
            "absolute_start_time": "2024-01-01T00:00:00Z",
            "absolute_end_time": "2024-01-01T00:00:01Z",
            "created_at": now,
            "updated_at": now,
        }

        mock_collection.find_one = mock.AsyncMock(return_value=None)
        mock_collection.find_one_and_update = mock.AsyncMock(return_value=result_doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.segments = mock_collection
        provider._client = mock_client

        data = StoredSegmentCreate(
            text="Hello",
            speaker="John",
            absolute_start_time="2024-01-01T00:00:00Z",
            absolute_end_time="2024-01-01T00:00:01Z",
        )
        result, is_new = await provider.upsert_segment(1, 2, "seg-1", data)

        assert is_new is True
        assert result.text == "Hello"

    @pytest.mark.asyncio
    async def test_upsert_segment_existing(self, provider):
        """Test upserting an existing segment."""
        mock_collection = mock.MagicMock()

        now = datetime.now(timezone.utc)
        existing_doc = {
            "_id": "abc123",
            "segment_id": "seg-1",
            "playlist_id": 1,
            "version_id": 2,
            "text": "Old text",
        }
        result_doc = {
            "_id": "abc123",
            "segment_id": "seg-1",
            "playlist_id": 1,
            "version_id": 2,
            "text": "Updated text",
            "speaker": "John",
            "absolute_start_time": "2024-01-01T00:00:00Z",
            "absolute_end_time": "2024-01-01T00:00:01Z",
            "created_at": now,
            "updated_at": now,
        }

        mock_collection.find_one = mock.AsyncMock(return_value=existing_doc)
        mock_collection.find_one_and_update = mock.AsyncMock(return_value=result_doc)

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.segments = mock_collection
        provider._client = mock_client

        data = StoredSegmentCreate(
            text="Updated text",
            speaker="John",
            absolute_start_time="2024-01-01T00:00:00Z",
            absolute_end_time="2024-01-01T00:00:01Z",
        )
        result, is_new = await provider.upsert_segment(1, 2, "seg-1", data)

        assert is_new is False
        assert result.text == "Updated text"

    @pytest.mark.asyncio
    async def test_get_segments_for_version(self, provider):
        """Test getting all segments for a version."""
        mock_collection = mock.MagicMock()

        now = datetime.now(timezone.utc)
        docs = [
            {
                "_id": "abc123",
                "segment_id": "seg-1",
                "playlist_id": 1,
                "version_id": 2,
                "text": "Hello",
                "speaker": "John",
                "absolute_start_time": "2024-01-01T00:00:00Z",
                "absolute_end_time": "2024-01-01T00:00:01Z",
                "created_at": now,
                "updated_at": now,
            },
            {
                "_id": "def456",
                "segment_id": "seg-2",
                "playlist_id": 1,
                "version_id": 2,
                "text": "World",
                "speaker": "Jane",
                "absolute_start_time": "2024-01-01T00:00:01Z",
                "absolute_end_time": "2024-01-01T00:00:02Z",
                "created_at": now,
                "updated_at": now,
            },
        ]

        async def async_generator():
            for doc in docs:
                yield doc

        mock_cursor = mock.MagicMock()
        mock_cursor.sort = mock.MagicMock(return_value=mock_cursor)
        mock_cursor.__aiter__ = lambda self: async_generator()
        mock_collection.find.return_value = mock_cursor

        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_client.dna = mock_db
        mock_db.segments = mock_collection
        provider._client = mock_client

        result = await provider.get_segments_for_version(1, 2)

        assert len(result) == 2
        assert result[0].text == "Hello"
        assert result[1].text == "World"
        mock_cursor.sort.assert_called_once_with("absolute_start_time", 1)
