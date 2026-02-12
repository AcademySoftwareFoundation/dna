"""Tests for user settings functionality."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_storage_provider_cached

from dna.models.user_settings import (
    UserSettings,
    UserSettingsUpdate,
)

client = TestClient(app)


class TestUserSettingsModels:
    """Tests for UserSettings Pydantic models."""

    def test_user_settings_update_defaults(self):
        """Test UserSettingsUpdate default values."""
        update = UserSettingsUpdate()
        assert update.note_prompt is None
        assert update.regenerate_on_version_change is None
        assert update.regenerate_on_transcript_update is None

    def test_user_settings_update_with_values(self):
        """Test UserSettingsUpdate with values."""
        update = UserSettingsUpdate(
            note_prompt="Custom prompt for notes",
            regenerate_on_version_change=True,
            regenerate_on_transcript_update=False,
        )
        assert update.note_prompt == "Custom prompt for notes"
        assert update.regenerate_on_version_change is True
        assert update.regenerate_on_transcript_update is False

    def test_user_settings_full_model(self):
        """Test full UserSettings model with alias."""
        now = datetime.now(timezone.utc)
        settings = UserSettings(
            _id="abc123",
            user_email="user@example.com",
            note_prompt="My custom prompt",
            regenerate_on_version_change=True,
            regenerate_on_transcript_update=False,
            updated_at=now,
            created_at=now,
        )
        assert settings.id == "abc123"
        assert settings.user_email == "user@example.com"
        assert settings.note_prompt == "My custom prompt"
        assert settings.regenerate_on_version_change is True
        assert settings.regenerate_on_transcript_update is False

    def test_user_settings_defaults(self):
        """Test UserSettings default values."""
        now = datetime.now(timezone.utc)
        settings = UserSettings(
            _id="abc123",
            user_email="user@example.com",
            updated_at=now,
            created_at=now,
        )
        assert settings.note_prompt == ""
        assert settings.regenerate_on_version_change is False
        assert settings.regenerate_on_transcript_update is False


class TestUserSettingsEndpoints:
    """Tests for user settings API endpoints."""

    @pytest.fixture
    def mock_storage_provider(self):
        """Create a mock storage provider."""
        return mock.AsyncMock()

    def test_get_user_settings_returns_200(self, mock_storage_provider):
        """Test GET /users/{user_email}/settings returns settings."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.get_user_settings.return_value = UserSettings(
            _id="settings1",
            user_email="user@example.com",
            note_prompt="Custom prompt",
            regenerate_on_version_change=True,
            regenerate_on_transcript_update=False,
            updated_at=now,
            created_at=now,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/users/user@example.com/settings")
            assert response.status_code == 200
            data = response.json()
            assert data["user_email"] == "user@example.com"
            assert data["note_prompt"] == "Custom prompt"
            assert data["regenerate_on_version_change"] is True
            assert data["regenerate_on_transcript_update"] is False
            mock_storage_provider.get_user_settings.assert_called_once_with(
                "user@example.com"
            )
        finally:
            app.dependency_overrides.clear()

    def test_get_user_settings_returns_null(self, mock_storage_provider):
        """Test GET returns null when user has no settings."""
        mock_storage_provider.get_user_settings.return_value = None

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/users/user@example.com/settings")
            assert response.status_code == 200
            assert response.json() is None
        finally:
            app.dependency_overrides.clear()

    def test_upsert_user_settings_returns_200(self, mock_storage_provider):
        """Test PUT creates or updates user settings."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.upsert_user_settings.return_value = UserSettings(
            _id="settings1",
            user_email="user@example.com",
            note_prompt="Updated prompt",
            regenerate_on_version_change=True,
            regenerate_on_transcript_update=True,
            updated_at=now,
            created_at=now,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/users/user@example.com/settings",
                json={
                    "note_prompt": "Updated prompt",
                    "regenerate_on_version_change": True,
                    "regenerate_on_transcript_update": True,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["note_prompt"] == "Updated prompt"
            assert data["regenerate_on_version_change"] is True
            assert data["regenerate_on_transcript_update"] is True
            mock_storage_provider.upsert_user_settings.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_upsert_user_settings_partial_update(self, mock_storage_provider):
        """Test PUT with partial settings update."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.upsert_user_settings.return_value = UserSettings(
            _id="settings1",
            user_email="user@example.com",
            note_prompt="",
            regenerate_on_version_change=True,
            regenerate_on_transcript_update=False,
            updated_at=now,
            created_at=now,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/users/user@example.com/settings",
                json={
                    "regenerate_on_version_change": True,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["regenerate_on_version_change"] is True
            mock_storage_provider.upsert_user_settings.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_delete_user_settings_returns_true(self, mock_storage_provider):
        """Test DELETE returns true when settings are deleted."""
        mock_storage_provider.delete_user_settings.return_value = True

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete("/users/user@example.com/settings")
            assert response.status_code == 200
            assert response.json() is True
            mock_storage_provider.delete_user_settings.assert_called_once_with(
                "user@example.com"
            )
        finally:
            app.dependency_overrides.clear()

    def test_delete_user_settings_returns_404(self, mock_storage_provider):
        """Test DELETE returns 404 when settings not found."""
        mock_storage_provider.delete_user_settings.return_value = False

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete("/users/user@example.com/settings")
            assert response.status_code == 404
            data = response.json()
            assert "User settings not found" in data["detail"]
        finally:
            app.dependency_overrides.clear()


class TestStorageProviderUserSettings:
    """Tests for StorageProviderBase user settings methods."""

    @pytest.mark.asyncio
    async def test_base_class_user_settings_methods_raise_not_implemented(self):
        """Test that base class user settings methods raise NotImplementedError."""
        from dna.storage_providers.storage_provider_base import StorageProviderBase

        provider = StorageProviderBase()

        with pytest.raises(NotImplementedError):
            await provider.get_user_settings("user@example.com")

        with pytest.raises(NotImplementedError):
            await provider.upsert_user_settings(
                "user@example.com", UserSettingsUpdate()
            )

        with pytest.raises(NotImplementedError):
            await provider.delete_user_settings("user@example.com")


class TestMongoDBUserSettingsProvider:
    """Tests for MongoDBStorageProvider user settings implementation."""

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
        mock_db.user_settings = mock_collection
        mock_client.dna = mock_db
        provider._client = mock_client
        return provider

    @pytest.mark.asyncio
    async def test_get_user_settings_returns_settings(
        self, provider_with_mock, mock_collection
    ):
        """Test get_user_settings returns settings when found."""
        from bson import ObjectId

        now = datetime.now(timezone.utc)
        mock_doc = {
            "_id": ObjectId(),
            "user_email": "user@example.com",
            "note_prompt": "Custom prompt",
            "regenerate_on_version_change": True,
            "regenerate_on_transcript_update": False,
            "updated_at": now,
            "created_at": now,
        }
        mock_collection.find_one.return_value = mock_doc

        result = await provider_with_mock.get_user_settings("user@example.com")

        assert result is not None
        assert result.user_email == "user@example.com"
        assert result.note_prompt == "Custom prompt"
        assert result.regenerate_on_version_change is True
        assert result.regenerate_on_transcript_update is False

    @pytest.mark.asyncio
    async def test_get_user_settings_returns_none(
        self, provider_with_mock, mock_collection
    ):
        """Test get_user_settings returns None when not found."""
        mock_collection.find_one.return_value = None

        result = await provider_with_mock.get_user_settings("user@example.com")

        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_user_settings(self, provider_with_mock, mock_collection):
        """Test upsert_user_settings creates or updates settings."""
        from bson import ObjectId

        now = datetime.now(timezone.utc)
        mock_result = {
            "_id": ObjectId(),
            "user_email": "user@example.com",
            "note_prompt": "Updated prompt",
            "regenerate_on_version_change": True,
            "regenerate_on_transcript_update": True,
            "updated_at": now,
            "created_at": now,
        }
        mock_collection.find_one_and_update.return_value = mock_result

        update_data = UserSettingsUpdate(
            note_prompt="Updated prompt",
            regenerate_on_version_change=True,
            regenerate_on_transcript_update=True,
        )
        result = await provider_with_mock.upsert_user_settings(
            "user@example.com", update_data
        )

        assert result.note_prompt == "Updated prompt"
        assert result.regenerate_on_version_change is True
        assert result.regenerate_on_transcript_update is True
        mock_collection.find_one_and_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_user_settings_returns_true(
        self, provider_with_mock, mock_collection
    ):
        """Test delete_user_settings returns True when deleted."""
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 1
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_user_settings("user@example.com")

        assert result is True

    @pytest.mark.asyncio
    async def test_delete_user_settings_returns_false(
        self, provider_with_mock, mock_collection
    ):
        """Test delete_user_settings returns False when not found."""
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 0
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_user_settings("user@example.com")

        assert result is False
