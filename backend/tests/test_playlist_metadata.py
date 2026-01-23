"""Tests for playlist metadata functionality."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_storage_provider_cached

from dna.models.playlist_metadata import (
    PlaylistMetadata,
    PlaylistMetadataUpdate,
)

client = TestClient(app)


class TestPlaylistMetadataModels:
    """Tests for PlaylistMetadata Pydantic models."""

    def test_playlist_metadata_update_defaults(self):
        """Test PlaylistMetadataUpdate default values."""
        update = PlaylistMetadataUpdate()
        assert update.in_review is None
        assert update.meeting_id is None

    def test_playlist_metadata_update_with_values(self):
        """Test PlaylistMetadataUpdate with values."""
        update = PlaylistMetadataUpdate(in_review=123, meeting_id="meeting-abc")
        assert update.in_review == 123
        assert update.meeting_id == "meeting-abc"

    def test_playlist_metadata_update_partial(self):
        """Test PlaylistMetadataUpdate with partial values."""
        update = PlaylistMetadataUpdate(in_review=456)
        assert update.in_review == 456
        assert update.meeting_id is None

        update2 = PlaylistMetadataUpdate(meeting_id="meeting-xyz")
        assert update2.in_review is None
        assert update2.meeting_id == "meeting-xyz"

    def test_playlist_metadata_full_model(self):
        """Test full PlaylistMetadata model with alias."""
        metadata = PlaylistMetadata(
            _id="abc123",
            playlist_id=10,
            in_review=100,
            meeting_id="meeting-123",
        )
        assert metadata.id == "abc123"
        assert metadata.playlist_id == 10
        assert metadata.in_review == 100
        assert metadata.meeting_id == "meeting-123"

    def test_playlist_metadata_optional_fields(self):
        """Test PlaylistMetadata with optional fields as None."""
        metadata = PlaylistMetadata(
            _id="def456",
            playlist_id=20,
            in_review=None,
            meeting_id=None,
        )
        assert metadata.id == "def456"
        assert metadata.playlist_id == 20
        assert metadata.in_review is None
        assert metadata.meeting_id is None


class TestPlaylistMetadataEndpoints:
    """Tests for playlist metadata API endpoints."""

    @pytest.fixture
    def mock_storage_provider(self):
        """Create a mock storage provider."""
        return mock.AsyncMock()

    def test_get_playlist_metadata_returns_200(self, mock_storage_provider):
        """Test GET /playlists/{playlist_id}/metadata returns metadata."""
        mock_storage_provider.get_playlist_metadata.return_value = PlaylistMetadata(
            _id="abc123",
            playlist_id=10,
            in_review=100,
            meeting_id="meeting-123",
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/playlists/10/metadata")
            assert response.status_code == 200
            data = response.json()
            assert data["playlist_id"] == 10
            assert data["in_review"] == 100
            assert data["meeting_id"] == "meeting-123"
            mock_storage_provider.get_playlist_metadata.assert_called_once_with(10)
        finally:
            app.dependency_overrides.clear()

    def test_get_playlist_metadata_returns_null(self, mock_storage_provider):
        """Test GET returns null when no metadata exists."""
        mock_storage_provider.get_playlist_metadata.return_value = None

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/playlists/999/metadata")
            assert response.status_code == 200
            assert response.json() is None
        finally:
            app.dependency_overrides.clear()

    def test_upsert_playlist_metadata_returns_200(self, mock_storage_provider):
        """Test PUT creates or updates playlist metadata."""
        mock_storage_provider.upsert_playlist_metadata.return_value = PlaylistMetadata(
            _id="abc123",
            playlist_id=10,
            in_review=200,
            meeting_id="meeting-updated",
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/playlists/10/metadata",
                json={
                    "in_review": 200,
                    "meeting_id": "meeting-updated",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["in_review"] == 200
            assert data["meeting_id"] == "meeting-updated"
            mock_storage_provider.upsert_playlist_metadata.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_upsert_playlist_metadata_partial_update(self, mock_storage_provider):
        """Test PUT with partial data (only in_review)."""
        mock_storage_provider.upsert_playlist_metadata.return_value = PlaylistMetadata(
            _id="abc123",
            playlist_id=10,
            in_review=300,
            meeting_id=None,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/playlists/10/metadata",
                json={"in_review": 300},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["in_review"] == 300
        finally:
            app.dependency_overrides.clear()

    def test_upsert_playlist_metadata_only_meeting_id(self, mock_storage_provider):
        """Test PUT with only meeting_id."""
        mock_storage_provider.upsert_playlist_metadata.return_value = PlaylistMetadata(
            _id="abc123",
            playlist_id=10,
            in_review=None,
            meeting_id="meeting-only",
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/playlists/10/metadata",
                json={"meeting_id": "meeting-only"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["meeting_id"] == "meeting-only"
        finally:
            app.dependency_overrides.clear()

    def test_delete_playlist_metadata_returns_true(self, mock_storage_provider):
        """Test DELETE returns true when metadata is deleted."""
        mock_storage_provider.delete_playlist_metadata.return_value = True

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete("/playlists/10/metadata")
            assert response.status_code == 200
            assert response.json() is True
            mock_storage_provider.delete_playlist_metadata.assert_called_once_with(10)
        finally:
            app.dependency_overrides.clear()

    def test_delete_playlist_metadata_returns_404(self, mock_storage_provider):
        """Test DELETE returns 404 when metadata not found."""
        mock_storage_provider.delete_playlist_metadata.return_value = False

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete("/playlists/999/metadata")
            assert response.status_code == 404
            data = response.json()
            assert "Playlist metadata not found" in data["detail"]
        finally:
            app.dependency_overrides.clear()


class TestMongoDBPlaylistMetadataProvider:
    """Tests for MongoDBStorageProvider playlist metadata implementation."""

    @pytest.fixture
    def mock_collection(self):
        """Create a mock MongoDB collection."""
        collection = mock.MagicMock()
        collection.find_one = mock.AsyncMock()
        collection.find_one_and_update = mock.AsyncMock()
        collection.delete_one = mock.AsyncMock()
        return collection

    @pytest.fixture
    def provider_with_mock(self, mock_collection):
        """Create a MongoDB provider with mocked collection."""
        pytest.importorskip("pymongo", reason="pymongo not installed")
        from dna.storage_providers.mongodb import MongoDBStorageProvider

        provider = MongoDBStorageProvider()
        mock_client = mock.MagicMock()
        mock_db = mock.MagicMock()
        mock_db.playlist_metadata = mock_collection
        mock_client.dna = mock_db
        provider._client = mock_client
        return provider

    def test_playlist_metadata_collection_property(self, provider_with_mock):
        """Test playlist_metadata_collection property returns collection."""
        collection = provider_with_mock.playlist_metadata_collection
        assert collection is provider_with_mock._client.dna.playlist_metadata

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_returns_metadata(
        self, provider_with_mock, mock_collection
    ):
        """Test get_playlist_metadata returns metadata when found."""
        from bson import ObjectId

        mock_doc = {
            "_id": ObjectId(),
            "playlist_id": 10,
            "in_review": 100,
            "meeting_id": "meeting-123",
        }
        mock_collection.find_one.return_value = mock_doc

        result = await provider_with_mock.get_playlist_metadata(10)

        assert result is not None
        assert result.playlist_id == 10
        assert result.in_review == 100
        assert result.meeting_id == "meeting-123"
        mock_collection.find_one.assert_called_once_with({"playlist_id": 10})

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_returns_none(
        self, provider_with_mock, mock_collection
    ):
        """Test get_playlist_metadata returns None when not found."""
        mock_collection.find_one.return_value = None

        result = await provider_with_mock.get_playlist_metadata(999)

        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_playlist_metadata(self, provider_with_mock, mock_collection):
        """Test upsert_playlist_metadata creates or updates metadata."""
        from bson import ObjectId

        mock_result = {
            "_id": ObjectId(),
            "playlist_id": 10,
            "in_review": 200,
            "meeting_id": "meeting-updated",
        }
        mock_collection.find_one_and_update.return_value = mock_result

        update_data = PlaylistMetadataUpdate(
            in_review=200, meeting_id="meeting-updated"
        )
        result = await provider_with_mock.upsert_playlist_metadata(10, update_data)

        assert result.playlist_id == 10
        assert result.in_review == 200
        assert result.meeting_id == "meeting-updated"
        mock_collection.find_one_and_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_upsert_playlist_metadata_partial(
        self, provider_with_mock, mock_collection
    ):
        """Test upsert_playlist_metadata with partial data."""
        from bson import ObjectId

        mock_result = {
            "_id": ObjectId(),
            "playlist_id": 10,
            "in_review": 300,
        }
        mock_collection.find_one_and_update.return_value = mock_result

        update_data = PlaylistMetadataUpdate(in_review=300)
        result = await provider_with_mock.upsert_playlist_metadata(10, update_data)

        assert result.in_review == 300
        call_args = mock_collection.find_one_and_update.call_args
        update_dict = call_args[0][1]
        assert "in_review" in update_dict["$set"]
        assert "meeting_id" not in update_dict["$set"]

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_returns_true(
        self, provider_with_mock, mock_collection
    ):
        """Test delete_playlist_metadata returns True when deleted."""
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 1
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_playlist_metadata(10)

        assert result is True
        mock_collection.delete_one.assert_called_once_with({"playlist_id": 10})

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_returns_false(
        self, provider_with_mock, mock_collection
    ):
        """Test delete_playlist_metadata returns False when not found."""
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 0
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_playlist_metadata(999)

        assert result is False


class TestStorageProviderBasePlaylistMetadata:
    """Tests for StorageProviderBase abstract methods for playlist metadata."""

    @pytest.mark.asyncio
    async def test_base_class_methods_raise_not_implemented(self):
        """Test that base class methods raise NotImplementedError."""
        from dna.storage_providers.storage_provider_base import StorageProviderBase

        provider = StorageProviderBase()

        with pytest.raises(NotImplementedError):
            await provider.get_playlist_metadata(1)

        with pytest.raises(NotImplementedError):
            await provider.upsert_playlist_metadata(1, PlaylistMetadataUpdate())

        with pytest.raises(NotImplementedError):
            await provider.delete_playlist_metadata(1)
