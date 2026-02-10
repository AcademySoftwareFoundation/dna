"""Tests for draft note functionality."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_storage_provider_cached

from dna.models.draft_note import (
    DraftNote,
    DraftNoteBase,
    DraftNoteCreate,
    DraftNoteLink,
    DraftNoteUpdate,
)

client = TestClient(app)


class TestDraftNoteModels:
    """Tests for DraftNote Pydantic models."""

    def test_draft_note_link_model(self):
        """Test DraftNoteLink model creation."""
        link = DraftNoteLink(entity_type="Shot", entity_id=123)
        assert link.entity_type == "Shot"
        assert link.entity_id == 123

    def test_draft_note_base_defaults(self):
        """Test DraftNoteBase default values."""
        base = DraftNoteBase()
        assert base.content == ""
        assert base.subject == ""
        assert base.to == ""
        assert base.cc == ""
        assert base.links == []
        assert base.version_status == ""

    def test_draft_note_base_with_links(self):
        """Test DraftNoteBase with links."""
        links = [
            DraftNoteLink(entity_type="Shot", entity_id=1),
            DraftNoteLink(entity_type="Asset", entity_id=2),
        ]
        base = DraftNoteBase(
            content="Test content",
            subject="Test subject",
            links=links,
        )
        assert len(base.links) == 2
        assert base.links[0].entity_type == "Shot"
        assert base.links[1].entity_type == "Asset"

    def test_draft_note_create_model(self):
        """Test DraftNoteCreate model."""
        create = DraftNoteCreate(
            user_email="user@example.com",
            playlist_id=10,
            version_id=100,
            content="Draft content",
        )
        assert create.user_email == "user@example.com"
        assert create.playlist_id == 10
        assert create.version_id == 100
        assert create.content == "Draft content"

    def test_draft_note_update_model(self):
        """Test DraftNoteUpdate model."""
        update = DraftNoteUpdate(
            content="Updated content",
            subject="Updated subject",
            to="recipient@example.com",
        )
        assert update.content == "Updated content"
        assert update.subject == "Updated subject"
        assert update.to == "recipient@example.com"

    def test_draft_note_full_model(self):
        """Test full DraftNote model with alias."""
        now = datetime.now(timezone.utc)
        note = DraftNote(
            _id="abc123",
            user_email="user@example.com",
            playlist_id=10,
            version_id=100,
            content="Test content",
            subject="Test subject",
            to="recipient@example.com",
            cc="cc@example.com",
            links=[DraftNoteLink(entity_type="Shot", entity_id=1)],
            version_status="pending",
            updated_at=now,
            created_at=now,
        )
        assert note.id == "abc123"
        assert note.user_email == "user@example.com"
        assert note.playlist_id == 10
        assert note.version_id == 100


class TestDraftNoteEndpoints:
    """Tests for draft note API endpoints."""

    @pytest.fixture
    def mock_storage_provider(self):
        """Create a mock storage provider."""
        return mock.AsyncMock()

    def test_get_all_draft_notes_returns_200(self, mock_storage_provider):
        """Test GET /playlists/{playlist_id}/versions/{version_id}/draft-notes."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.get_draft_notes_for_version.return_value = [
            DraftNote(
                _id="note1",
                user_email="user1@example.com",
                playlist_id=10,
                version_id=100,
                content="Note 1",
                updated_at=now,
                created_at=now,
            ),
            DraftNote(
                _id="note2",
                user_email="user2@example.com",
                playlist_id=10,
                version_id=100,
                content="Note 2",
                updated_at=now,
                created_at=now,
            ),
        ]

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/playlists/10/versions/100/draft-notes")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["user_email"] == "user1@example.com"
            assert data[1]["user_email"] == "user2@example.com"
            mock_storage_provider.get_draft_notes_for_version.assert_called_once_with(
                10, 100
            )
        finally:
            app.dependency_overrides.clear()

    def test_get_all_draft_notes_returns_empty_list(self, mock_storage_provider):
        """Test GET returns empty list when no draft notes exist."""
        mock_storage_provider.get_draft_notes_for_version.return_value = []

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get("/playlists/10/versions/100/draft-notes")
            assert response.status_code == 200
            data = response.json()
            assert data == []
        finally:
            app.dependency_overrides.clear()

    def test_get_draft_note_for_user_returns_200(self, mock_storage_provider):
        """Test GET /playlists/.../draft-notes/{user_email} returns note."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.get_draft_note.return_value = DraftNote(
            _id="note1",
            user_email="user@example.com",
            playlist_id=10,
            version_id=100,
            content="User's note",
            subject="Test subject",
            updated_at=now,
            created_at=now,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get(
                "/playlists/10/versions/100/draft-notes/user@example.com"
            )
            assert response.status_code == 200
            data = response.json()
            assert data["user_email"] == "user@example.com"
            assert data["content"] == "User's note"
            mock_storage_provider.get_draft_note.assert_called_once_with(
                "user@example.com", 10, 100
            )
        finally:
            app.dependency_overrides.clear()

    def test_get_draft_note_for_user_returns_null(self, mock_storage_provider):
        """Test GET returns null when user has no draft note."""
        mock_storage_provider.get_draft_note.return_value = None

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.get(
                "/playlists/10/versions/100/draft-notes/user@example.com"
            )
            assert response.status_code == 200
            assert response.json() is None
        finally:
            app.dependency_overrides.clear()

    def test_upsert_draft_note_returns_200(self, mock_storage_provider):
        """Test PUT creates or updates a draft note."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.upsert_draft_note.return_value = DraftNote(
            _id="note1",
            user_email="user@example.com",
            playlist_id=10,
            version_id=100,
            content="Updated content",
            subject="Updated subject",
            updated_at=now,
            created_at=now,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/playlists/10/versions/100/draft-notes/user@example.com",
                json={
                    "content": "Updated content",
                    "subject": "Updated subject",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "Updated content"
            assert data["subject"] == "Updated subject"
            mock_storage_provider.upsert_draft_note.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_upsert_draft_note_with_links(self, mock_storage_provider):
        """Test PUT with entity links."""
        now = datetime.now(timezone.utc)
        mock_storage_provider.upsert_draft_note.return_value = DraftNote(
            _id="note1",
            user_email="user@example.com",
            playlist_id=10,
            version_id=100,
            content="Note with links",
            links=[
                DraftNoteLink(entity_type="Shot", entity_id=123),
                DraftNoteLink(entity_type="Asset", entity_id=456),
            ],
            updated_at=now,
            created_at=now,
        )

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.put(
                "/playlists/10/versions/100/draft-notes/user@example.com",
                json={
                    "content": "Note with links",
                    "links": [
                        {"entity_type": "Shot", "entity_id": 123},
                        {"entity_type": "Asset", "entity_id": 456},
                    ],
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data["links"]) == 2
            assert data["links"][0]["entity_type"] == "Shot"
        finally:
            app.dependency_overrides.clear()

    def test_delete_draft_note_returns_true(self, mock_storage_provider):
        """Test DELETE returns true when note is deleted."""
        mock_storage_provider.delete_draft_note.return_value = True

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete(
                "/playlists/10/versions/100/draft-notes/user@example.com"
            )
            assert response.status_code == 200
            assert response.json() is True
            mock_storage_provider.delete_draft_note.assert_called_once_with(
                "user@example.com", 10, 100
            )
        finally:
            app.dependency_overrides.clear()

    def test_delete_draft_note_returns_404(self, mock_storage_provider):
        """Test DELETE returns 404 when note not found."""
        mock_storage_provider.delete_draft_note.return_value = False

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )

        try:
            response = client.delete(
                "/playlists/10/versions/100/draft-notes/user@example.com"
            )
            assert response.status_code == 404
            data = response.json()
            assert "Draft note not found" in data["detail"]
        finally:
            app.dependency_overrides.clear()


class TestStorageProviderBase:
    """Tests for StorageProviderBase abstract class."""

    def test_get_storage_provider_returns_mongodb_by_default(self):
        """Test that get_storage_provider returns MongoDB provider by default."""
        pytest.importorskip("pymongo", reason="pymongo not installed")
        from dna.storage_providers.mongodb import MongoDBStorageProvider
        from dna.storage_providers.storage_provider_base import get_storage_provider

        with mock.patch.dict("os.environ", {"STORAGE_PROVIDER": "mongodb"}):
            provider = get_storage_provider()
            assert isinstance(provider, MongoDBStorageProvider)

    def test_get_storage_provider_raises_for_unknown_provider(self):
        """Test that get_storage_provider raises for unknown provider."""
        from dna.storage_providers.storage_provider_base import get_storage_provider

        with mock.patch.dict("os.environ", {"STORAGE_PROVIDER": "unknown"}):
            with pytest.raises(ValueError, match="Unknown storage provider"):
                get_storage_provider()

    @pytest.mark.anyio
    async def test_base_class_methods_raise_not_implemented(self):
        """Test that base class methods raise NotImplementedError."""
        from dna.storage_providers.storage_provider_base import StorageProviderBase

        provider = StorageProviderBase()

        with pytest.raises(NotImplementedError):
            await provider.get_draft_notes_for_version(1, 2)

        with pytest.raises(NotImplementedError):
            await provider.get_draft_note("user@example.com", 1, 2)

        with pytest.raises(NotImplementedError):
            await provider.upsert_draft_note(
                "user@example.com", 1, 2, DraftNoteUpdate()
            )

        with pytest.raises(NotImplementedError):
            await provider.delete_draft_note("user@example.com", 1, 2)


class TestMongoDBStorageProvider:
    """Tests for MongoDBStorageProvider implementation."""

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
        mock_db.draft_notes = mock_collection
        mock_client.dna = mock_db
        provider._client = mock_client
        return provider

    def test_build_query(self, provider_with_mock):
        """Test _build_query returns correct composite key."""
        query = provider_with_mock._build_query("user@example.com", 10, 100)
        assert query == {
            "user_email": "user@example.com",
            "playlist_id": 10,
            "version_id": 100,
        }

    def test_client_property_creates_client(self):
        """Test client property creates AsyncMongoClient on first access."""
        pytest.importorskip("pymongo", reason="pymongo not installed")
        from dna.storage_providers.mongodb import MongoDBStorageProvider

        with mock.patch(
            "dna.storage_providers.mongodb.AsyncMongoClient"
        ) as mock_client:
            provider = MongoDBStorageProvider()
            with mock.patch.dict("os.environ", {"MONGODB_URL": "mongodb://test:27017"}):
                _ = provider.client
                mock_client.assert_called_once_with("mongodb://test:27017")

    def test_client_property_returns_cached_client(self):
        """Test client property returns cached client on subsequent access."""
        pytest.importorskip("pymongo", reason="pymongo not installed")
        from dna.storage_providers.mongodb import MongoDBStorageProvider

        provider = MongoDBStorageProvider()
        mock_client = mock.MagicMock()
        provider._client = mock_client
        assert provider.client is mock_client

    def test_db_property(self, provider_with_mock):
        """Test db property returns dna database."""
        db = provider_with_mock.db
        assert db is provider_with_mock._client.dna

    def test_draft_notes_property(self, provider_with_mock, mock_collection):
        """Test draft_notes property returns collection."""
        collection = provider_with_mock.draft_notes
        assert collection is mock_collection

    @pytest.mark.anyio
    async def test_get_draft_notes_for_version(
        self, provider_with_mock, mock_collection
    ):
        """Test get_draft_notes_for_version returns list of notes."""
        from bson import ObjectId

        now = datetime.now(timezone.utc)
        mock_docs = [
            {
                "_id": ObjectId(),
                "user_email": "user1@example.com",
                "playlist_id": 10,
                "version_id": 100,
                "content": "Note 1",
                "subject": "",
                "to": "",
                "cc": "",
                "links": [],
                "version_status": "",
                "updated_at": now,
                "created_at": now,
            },
            {
                "_id": ObjectId(),
                "user_email": "user2@example.com",
                "playlist_id": 10,
                "version_id": 100,
                "content": "Note 2",
                "subject": "",
                "to": "",
                "cc": "",
                "links": [],
                "version_status": "",
                "updated_at": now,
                "created_at": now,
            },
        ]

        class MockAsyncCursor:
            def __init__(self, docs):
                self.docs = docs
                self.index = 0

            def __aiter__(self):
                return self

            async def __anext__(self):
                if self.index >= len(self.docs):
                    raise StopAsyncIteration
                doc = self.docs[self.index]
                self.index += 1
                return doc

        mock_collection.find.return_value = MockAsyncCursor(mock_docs)

        result = await provider_with_mock.get_draft_notes_for_version(10, 100)

        assert len(result) == 2
        assert result[0].user_email == "user1@example.com"
        assert result[1].user_email == "user2@example.com"
        mock_collection.find.assert_called_once_with(
            {"playlist_id": 10, "version_id": 100}
        )

    @pytest.mark.anyio
    async def test_get_draft_note_returns_note(
        self, provider_with_mock, mock_collection
    ):
        """Test get_draft_note returns note when found."""
        from bson import ObjectId

        now = datetime.now(timezone.utc)
        mock_doc = {
            "_id": ObjectId(),
            "user_email": "user@example.com",
            "playlist_id": 10,
            "version_id": 100,
            "content": "Test note",
            "subject": "",
            "to": "",
            "cc": "",
            "links": [],
            "version_status": "",
            "updated_at": now,
            "created_at": now,
        }
        mock_collection.find_one.return_value = mock_doc

        result = await provider_with_mock.get_draft_note("user@example.com", 10, 100)

        assert result is not None
        assert result.user_email == "user@example.com"
        assert result.content == "Test note"

    @pytest.mark.anyio
    async def test_get_draft_note_returns_none(
        self, provider_with_mock, mock_collection
    ):
        """Test get_draft_note returns None when not found."""
        mock_collection.find_one.return_value = None

        result = await provider_with_mock.get_draft_note("user@example.com", 10, 100)

        assert result is None

    @pytest.mark.anyio
    async def test_upsert_draft_note(self, provider_with_mock, mock_collection):
        """Test upsert_draft_note creates or updates note."""
        from bson import ObjectId

        now = datetime.now(timezone.utc)
        mock_result = {
            "_id": ObjectId(),
            "user_email": "user@example.com",
            "playlist_id": 10,
            "version_id": 100,
            "content": "Updated content",
            "subject": "Updated subject",
            "to": "",
            "cc": "",
            "links": [],
            "version_status": "",
            "updated_at": now,
            "created_at": now,
        }
        mock_collection.find_one_and_update.return_value = mock_result

        update_data = DraftNoteUpdate(
            content="Updated content", subject="Updated subject"
        )
        result = await provider_with_mock.upsert_draft_note(
            "user@example.com", 10, 100, update_data
        )

        assert result.content == "Updated content"
        assert result.subject == "Updated subject"
        mock_collection.find_one_and_update.assert_called_once()

    @pytest.mark.anyio
    async def test_delete_draft_note_returns_true(
        self, provider_with_mock, mock_collection
    ):
        """Test delete_draft_note returns True when deleted."""
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 1
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_draft_note("user@example.com", 10, 100)

        assert result is True

    @pytest.mark.anyio
    async def test_delete_draft_note_returns_false(
        self, provider_with_mock, mock_collection
    ):
        """Test delete_draft_note returns False when not found."""
        mock_result = mock.MagicMock()
        mock_result.deleted_count = 0
        mock_collection.delete_one.return_value = mock_result

        result = await provider_with_mock.delete_draft_note("user@example.com", 10, 100)

        assert result is False

    @pytest.mark.anyio
    async def test_upsert_draft_note_resets_published_flag(
        self, provider_with_mock, mock_collection
    ):
        """Test that updating a note resets the published flag to False."""
        from bson import ObjectId

        now = datetime.now(timezone.utc)
        mock_result = {
            "_id": ObjectId(),
            "user_email": "user@example.com",
            "playlist_id": 10,
            "version_id": 100,
            "content": "New content",
            "subject": "",
            "to": "",
            "cc": "",
            "links": [],
            "version_status": "",
            "published": False,  # Expect it to be false
            "updated_at": now,
            "created_at": now,
        }
        mock_collection.find_one_and_update.return_value = mock_result

        # Update without specifying published status
        update_data = DraftNoteUpdate(content="New content")

        await provider_with_mock.upsert_draft_note(
            "user@example.com", 10, 100, update_data
        )

        # Check the update call arguments
        call_args = mock_collection.find_one_and_update.call_args
        _, update_arg = call_args[0]  # query is first arg, update is second

        # Verify published: False is in the $set dictionary
        assert "published" in update_arg["$set"]
        assert update_arg["$set"]["published"] is False
