"""Tests for playlist-local metadata (has_scratch only)."""

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
        update = PlaylistMetadataUpdate()
        assert update.has_scratch is None

    def test_playlist_metadata_update_with_values(self):
        update = PlaylistMetadataUpdate(has_scratch=True)
        assert update.has_scratch is True

    def test_playlist_metadata_full_model(self):
        metadata = PlaylistMetadata(
            _id="abc123",
            playlist_id="10",
            has_scratch=True,
        )
        assert metadata.id == "abc123"
        assert metadata.playlist_id == "10"
        assert metadata.has_scratch is True

    def test_playlist_metadata_has_scratch_default(self):
        metadata = PlaylistMetadata(_id="abc123", playlist_id="10")
        assert metadata.has_scratch is False


class TestPlaylistMetadataEndpoints:
    """Tests for playlist metadata API endpoints."""

    @pytest.fixture
    def mock_storage_provider(self):
        provider = mock.AsyncMock()
        provider.get_playlist_metadata.return_value = None
        return provider

    def test_get_playlist_metadata_returns_200(self, mock_storage_provider):
        mock_storage_provider.get_playlist_metadata.return_value = PlaylistMetadata(
            _id="abc123",
            playlist_id="10",
            has_scratch=True,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/playlists/10/metadata")
            assert response.status_code == 200
            data = response.json()
            assert data["playlist_id"] == "10"
            assert data["has_scratch"] is True
            mock_storage_provider.get_playlist_metadata.assert_called_once_with("10")
        finally:
            app.dependency_overrides.clear()

    def test_get_playlist_metadata_returns_null(self, mock_storage_provider):
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
        mock_storage_provider.upsert_playlist_metadata.return_value = PlaylistMetadata(
            _id="abc123",
            playlist_id="10",
            has_scratch=True,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/playlists/10/metadata",
                json={"has_scratch": True},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["has_scratch"] is True
            mock_storage_provider.upsert_playlist_metadata.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_delete_playlist_metadata_returns_true(self, mock_storage_provider):
        mock_storage_provider.delete_playlist_metadata.return_value = True

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete("/playlists/10/metadata")
            assert response.status_code == 200
            assert response.json() is True
            mock_storage_provider.delete_playlist_metadata.assert_called_once_with("10")
        finally:
            app.dependency_overrides.clear()

    def test_delete_playlist_metadata_returns_404(self, mock_storage_provider):
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
        collection = mock.MagicMock()
        collection.find_one = mock.AsyncMock()
        collection.find_one_and_update = mock.AsyncMock()
        collection.delete_one = mock.AsyncMock()
        return collection

    @pytest.fixture
    def provider_with_mock(self, mock_collection):
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
        collection = provider_with_mock.playlist_metadata_collection
        assert collection is provider_with_mock._client.dna.playlist_metadata

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_returns_metadata(
        self, provider_with_mock, mock_collection
    ):
        from bson import ObjectId

        mock_doc = {
            "_id": ObjectId(),
            "playlist_id": "10",
            "has_scratch": True,
        }
        mock_collection.find_one.return_value = mock_doc

        result = await provider_with_mock.get_playlist_metadata("10")

        assert result is not None
        assert result.playlist_id == "10"
        assert result.has_scratch is True
        mock_collection.find_one.assert_called_once_with({"playlist_id": "10"})

    @pytest.mark.asyncio
    async def test_get_playlist_metadata_returns_none(
        self, provider_with_mock, mock_collection
    ):
        mock_collection.find_one.return_value = None

        result = await provider_with_mock.get_playlist_metadata("999")

        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_playlist_metadata(self, provider_with_mock, mock_collection):
        from bson import ObjectId

        mock_result = {
            "_id": ObjectId(),
            "playlist_id": "10",
            "has_scratch": True,
        }
        mock_collection.find_one_and_update.return_value = mock_result

        update_data = PlaylistMetadataUpdate(has_scratch=True)
        result = await provider_with_mock.upsert_playlist_metadata("10", update_data)

        assert result.playlist_id == "10"
        assert result.has_scratch is True
        mock_collection.find_one_and_update.assert_called_once()
        update_dict = mock_collection.find_one_and_update.call_args[0][1]
        assert update_dict["$set"]["has_scratch"] is True

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_returns_true(
        self, provider_with_mock, mock_collection
    ):
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 1
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_playlist_metadata("10")

        assert result is True
        mock_collection.delete_one.assert_called_once_with({"playlist_id": "10"})

    @pytest.mark.asyncio
    async def test_delete_playlist_metadata_returns_false(
        self, provider_with_mock, mock_collection
    ):
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 0
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_playlist_metadata("999")

        assert result is False


class TestStorageProviderBasePlaylistMetadata:
    """Tests for StorageProviderBase abstract methods for playlist metadata."""

    @pytest.mark.asyncio
    async def test_base_class_methods_raise_not_implemented(self):
        from dna.storage_providers.storage_provider_base import StorageProviderBase

        provider = StorageProviderBase()

        with pytest.raises(NotImplementedError):
            await provider.get_playlist_metadata("1")

        with pytest.raises(NotImplementedError):
            await provider.upsert_playlist_metadata("1", PlaylistMetadataUpdate())

        with pytest.raises(NotImplementedError):
            await provider.delete_playlist_metadata("1")
