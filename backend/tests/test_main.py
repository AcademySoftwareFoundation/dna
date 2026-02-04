"""Tests for main FastAPI application."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    get_llm_provider_cached,
    get_prodtrack_provider_cached,
    get_storage_provider_cached,
)

client = TestClient(app)


def test_root():
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data
    assert data["message"] == "DNA Backend API"


def test_health():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


class TestCreateNoteEndpoint:
    """Tests for POST /note endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_create_note_returns_201(self, mock_provider):
        """Test that creating a note returns 201 status."""
        from dna.models.entity import Note

        mock_provider.add_entity.return_value = Note(
            id=123,
            subject="Test Note",
            content="Test content",
            project={"type": "Project", "id": 85},
        )

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/note",
                json={
                    "subject": "Test Note",
                    "content": "Test content",
                    "project": {"type": "Project", "id": 85},
                },
            )
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == 123
            assert data["subject"] == "Test Note"
        finally:
            app.dependency_overrides.clear()

    def test_create_note_with_links(self, mock_provider):
        """Test creating a note with linked entities."""
        from dna.models.entity import Note

        mock_provider.add_entity.return_value = Note(
            id=456,
            subject="Linked Note",
            content="Note with links",
            project={"type": "Project", "id": 85},
        )

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/note",
                json={
                    "subject": "Linked Note",
                    "content": "Note with links",
                    "project": {"type": "Project", "id": 85},
                    "note_links": [
                        {"type": "Version", "id": 6957},
                        {"type": "Playlist", "id": 6},
                    ],
                },
            )
            assert response.status_code == 201

            mock_provider.add_entity.assert_called_once()
            call_args = mock_provider.add_entity.call_args
            note = call_args[0][1]
            assert len(note.note_links) == 2
        finally:
            app.dependency_overrides.clear()

    def test_create_note_missing_project_returns_422(self, mock_provider):
        """Test that missing required project field returns 422."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/note",
                json={
                    "subject": "Test Note",
                    "content": "Test content",
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()


class TestFindEndpoint:
    """Tests for POST /find endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_find_returns_200_with_results(self, mock_provider):
        """Test that find returns 200 with matching entities."""
        from dna.models.entity import Project

        mock_provider.find.return_value = [
            Project(id=1, name="Project One"),
            Project(id=2, name="Project Two"),
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "project",
                    "filters": [],
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["id"] == 1
            assert data[0]["type"] == "Project"
            assert data[1]["id"] == 2
            assert data[1]["type"] == "Project"
        finally:
            app.dependency_overrides.clear()

    def test_find_with_filters(self, mock_provider):
        """Test that find passes filters to the provider."""
        from dna.models.entity import Shot

        mock_provider.find.return_value = [Shot(id=100, name="shot_010")]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "shot",
                    "filters": [
                        {"field": "name", "operator": "contains", "value": "010"}
                    ],
                },
            )
            assert response.status_code == 200

            mock_provider.find.assert_called_once()
            call_args = mock_provider.find.call_args
            assert call_args[0][0] == "shot"
            assert call_args[0][1] == [
                {"field": "name", "operator": "contains", "value": "010"}
            ]
        finally:
            app.dependency_overrides.clear()

    def test_find_with_uppercase_entity_type(self, mock_provider):
        """Test that find normalizes entity type to lowercase."""
        from dna.models.entity import Project

        mock_provider.find.return_value = [Project(id=1, name="Test")]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "PROJECT",
                    "filters": [],
                },
            )
            assert response.status_code == 200

            mock_provider.find.assert_called_once_with("project", [])
        finally:
            app.dependency_overrides.clear()

    def test_find_unsupported_entity_type_returns_400(self, mock_provider):
        """Test that find returns 400 for unsupported entity types."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "unsupported_type",
                    "filters": [],
                },
            )
            assert response.status_code == 400
            data = response.json()
            assert "Unsupported entity type" in data["detail"]
            assert "unsupported_type" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_find_returns_empty_list_when_no_results(self, mock_provider):
        """Test that find returns empty list when no entities match."""
        mock_provider.find.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "project",
                    "filters": [
                        {"field": "name", "operator": "is", "value": "nonexistent"}
                    ],
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data == []
        finally:
            app.dependency_overrides.clear()

    def test_find_provider_error_returns_400(self, mock_provider):
        """Test that find returns 400 when provider raises ValueError."""
        mock_provider.find.side_effect = ValueError("Unknown field 'bad_field'")

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "project",
                    "filters": [
                        {"field": "bad_field", "operator": "is", "value": "test"}
                    ],
                },
            )
            assert response.status_code == 400
            data = response.json()
            assert "Unknown field" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_find_missing_entity_type_returns_422(self, mock_provider):
        """Test that find returns 422 when entity_type is missing."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "filters": [],
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_find_with_multiple_filters(self, mock_provider):
        """Test find with multiple filter conditions."""
        from dna.models.entity import Version

        mock_provider.find.return_value = [Version(id=1, name="v001", status="apr")]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "version",
                    "filters": [
                        {"field": "name", "operator": "contains", "value": "v001"},
                        {"field": "status", "operator": "is", "value": "apr"},
                    ],
                },
            )
            assert response.status_code == 200

            call_args = mock_provider.find.call_args
            filters = call_args[0][1]
            assert len(filters) == 2
        finally:
            app.dependency_overrides.clear()

    def test_find_default_filters_is_empty_list(self, mock_provider):
        """Test that filters defaults to empty list when not provided."""
        from dna.models.entity import Project

        mock_provider.find.return_value = [Project(id=1, name="Test")]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/find",
                json={
                    "entity_type": "project",
                },
            )
            assert response.status_code == 200
            mock_provider.find.assert_called_once_with("project", [])
        finally:
            app.dependency_overrides.clear()


class TestSearchEndpoint:
    """Tests for POST /search endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_search_returns_200_with_results(self, mock_provider):
        """Test that search returns 200 with matching entities."""
        mock_provider.search.return_value = [
            {
                "type": "User",
                "id": 1,
                "name": "John Smith",
                "email": "john@example.com",
            },
            {
                "type": "Shot",
                "id": 100,
                "name": "shot_010_0020",
                "description": "Hero enters frame",
                "project": {"type": "Project", "id": 85},
            },
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "john",
                    "entity_types": ["user", "shot"],
                    "project_id": 85,
                    "limit": 10,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert "results" in data
            assert len(data["results"]) == 2
            assert data["results"][0]["type"] == "User"
            assert data["results"][0]["name"] == "John Smith"
            assert data["results"][1]["type"] == "Shot"
        finally:
            app.dependency_overrides.clear()

    def test_search_calls_provider_with_correct_args(self, mock_provider):
        """Test that search passes correct arguments to provider."""
        mock_provider.search.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            client.post(
                "/search",
                json={
                    "query": "test",
                    "entity_types": ["user", "shot", "asset"],
                    "project_id": 123,
                    "limit": 5,
                },
            )

            mock_provider.search.assert_called_once_with(
                query="test",
                entity_types=["user", "shot", "asset"],
                project_id=123,
                limit=5,
            )
        finally:
            app.dependency_overrides.clear()

    def test_search_normalizes_entity_types_to_lowercase(self, mock_provider):
        """Test that search normalizes entity types to lowercase."""
        mock_provider.search.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            client.post(
                "/search",
                json={
                    "query": "test",
                    "entity_types": ["USER", "Shot", "ASSET"],
                },
            )

            mock_provider.search.assert_called_once()
            call_args = mock_provider.search.call_args
            assert call_args.kwargs["entity_types"] == ["user", "shot", "asset"]
        finally:
            app.dependency_overrides.clear()

    def test_search_without_project_id(self, mock_provider):
        """Test that search works without project_id (for global user search)."""
        mock_provider.search.return_value = [
            {
                "type": "User",
                "id": 1,
                "name": "John Smith",
                "email": "john@example.com",
            }
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "john",
                    "entity_types": ["user"],
                },
            )
            assert response.status_code == 200
            mock_provider.search.assert_called_once_with(
                query="john",
                entity_types=["user"],
                project_id=None,
                limit=10,
            )
        finally:
            app.dependency_overrides.clear()

    def test_search_uses_default_limit(self, mock_provider):
        """Test that search uses default limit of 10."""
        mock_provider.search.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            client.post(
                "/search",
                json={
                    "query": "test",
                    "entity_types": ["shot"],
                },
            )

            call_args = mock_provider.search.call_args
            assert call_args.kwargs["limit"] == 10
        finally:
            app.dependency_overrides.clear()

    def test_search_returns_empty_results_when_no_matches(self, mock_provider):
        """Test that search returns empty results when no entities match."""
        mock_provider.search.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "nonexistent",
                    "entity_types": ["user", "shot"],
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["results"] == []
        finally:
            app.dependency_overrides.clear()

    def test_search_unsupported_entity_type_returns_400(self, mock_provider):
        """Test that search returns 400 for unsupported entity types."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "test",
                    "entity_types": ["unsupported_type"],
                },
            )
            assert response.status_code == 400
            data = response.json()
            assert "Unsupported entity type" in data["detail"]
            assert "unsupported_type" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_search_partial_unsupported_entity_types_returns_400(self, mock_provider):
        """Test that search returns 400 if any entity type is unsupported."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "test",
                    "entity_types": ["user", "invalid_type", "shot"],
                },
            )
            assert response.status_code == 400
            data = response.json()
            assert "Unsupported entity type" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_search_provider_error_returns_400(self, mock_provider):
        """Test that search returns 400 when provider raises ValueError."""
        mock_provider.search.side_effect = ValueError("Search error")

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "test",
                    "entity_types": ["user"],
                },
            )
            assert response.status_code == 400
            data = response.json()
            assert "Search error" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_search_missing_query_returns_422(self, mock_provider):
        """Test that search returns 422 when query is missing."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "entity_types": ["user"],
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_search_missing_entity_types_returns_422(self, mock_provider):
        """Test that search returns 422 when entity_types is missing."""
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "test",
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_search_with_multiple_entity_types(self, mock_provider):
        """Test search across multiple entity types."""
        mock_provider.search.return_value = [
            {"type": "User", "id": 1, "name": "John", "email": "john@example.com"},
            {"type": "Shot", "id": 2, "name": "john_shot", "description": "Test"},
            {"type": "Asset", "id": 3, "name": "johnny_rig", "description": "Rig"},
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.post(
                "/search",
                json={
                    "query": "joh",
                    "entity_types": ["user", "shot", "asset", "version"],
                    "project_id": 123,
                    "limit": 5,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data["results"]) == 3

            types = [r["type"] for r in data["results"]]
            assert "User" in types
            assert "Shot" in types
            assert "Asset" in types
        finally:
            app.dependency_overrides.clear()


class TestRequestModels:
    """Tests for request model validation."""

    def test_filter_condition_validation(self):
        """Test that FilterCondition model validates correctly."""
        from dna.models.requests import FilterCondition

        filter_cond = FilterCondition(field="name", operator="is", value="test")
        assert filter_cond.field == "name"
        assert filter_cond.operator == "is"
        assert filter_cond.value == "test"

    def test_filter_condition_accepts_various_value_types(self):
        """Test that FilterCondition accepts various value types."""
        from dna.models.requests import FilterCondition

        filter_str = FilterCondition(field="name", operator="is", value="string")
        assert filter_str.value == "string"

        filter_int = FilterCondition(field="id", operator="greater_than", value=100)
        assert filter_int.value == 100

        filter_list = FilterCondition(field="id", operator="in", value=[1, 2, 3])
        assert filter_list.value == [1, 2, 3]

        filter_none = FilterCondition(field="name", operator="is", value=None)
        assert filter_none.value is None

    def test_find_request_validation(self):
        """Test that FindRequest model validates correctly."""
        from dna.models.requests import FilterCondition, FindRequest

        request = FindRequest(
            entity_type="project",
            filters=[FilterCondition(field="name", operator="is", value="test")],
        )
        assert request.entity_type == "project"
        assert len(request.filters) == 1

    def test_find_request_default_filters(self):
        """Test that FindRequest defaults filters to empty list."""
        from dna.models.requests import FindRequest

        request = FindRequest(entity_type="project")
        assert request.filters == []


class TestGetProjectsForUserEndpoint:
    """Tests for GET /projects/user/{user_name} endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_get_projects_for_user_returns_200_with_results(self, mock_provider):
        """Test that get_projects_for_user returns 200 with matching projects."""
        from dna.models.entity import Project

        mock_provider.get_projects_for_user.return_value = [
            Project(id=1, name="Project One"),
            Project(id=2, name="Project Two"),
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/projects/user/testuser")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["id"] == 1
            assert data[0]["type"] == "Project"
            assert data[1]["id"] == 2
            assert data[1]["type"] == "Project"
        finally:
            app.dependency_overrides.clear()

    def test_get_projects_for_user_calls_provider_with_email(self, mock_provider):
        """Test that the endpoint passes the email to the provider."""
        from dna.models.entity import Project

        mock_provider.get_projects_for_user.return_value = [
            Project(id=1, name="Test Project")
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            client.get("/projects/user/jsmith@example.com")
            mock_provider.get_projects_for_user.assert_called_once_with(
                "jsmith@example.com"
            )
        finally:
            app.dependency_overrides.clear()

    def test_get_projects_for_user_returns_empty_list(self, mock_provider):
        """Test that get_projects_for_user returns empty list when user has no projects."""
        mock_provider.get_projects_for_user.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/projects/user/newuser")
            assert response.status_code == 200
            data = response.json()
            assert data == []
        finally:
            app.dependency_overrides.clear()

    def test_get_projects_for_user_returns_404_when_user_not_found(self, mock_provider):
        """Test that get_projects_for_user returns 404 when user not found."""
        mock_provider.get_projects_for_user.side_effect = ValueError(
            "User not found: unknownuser"
        )

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/projects/user/unknownuser")
            assert response.status_code == 404
            data = response.json()
            assert "User not found" in data["detail"]
        finally:
            app.dependency_overrides.clear()


class TestGetPlaylistsForProjectEndpoint:
    """Tests for GET /projects/{project_id}/playlists endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_get_playlists_for_project_returns_200_with_results(self, mock_provider):
        """Test that get_playlists_for_project returns 200 with matching playlists."""
        from dna.models.entity import Playlist

        mock_provider.get_playlists_for_project.return_value = [
            Playlist(id=1, code="Dailies Review"),
            Playlist(id=2, code="Final Review"),
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/projects/42/playlists")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["id"] == 1
            assert data[0]["type"] == "Playlist"
            assert data[1]["id"] == 2
            assert data[1]["type"] == "Playlist"
        finally:
            app.dependency_overrides.clear()

    def test_get_playlists_for_project_calls_provider_with_project_id(
        self, mock_provider
    ):
        """Test that the endpoint passes the project_id to the provider."""
        from dna.models.entity import Playlist

        mock_provider.get_playlists_for_project.return_value = [
            Playlist(id=1, code="Test Playlist")
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            client.get("/projects/123/playlists")
            mock_provider.get_playlists_for_project.assert_called_once_with(123)
        finally:
            app.dependency_overrides.clear()

    def test_get_playlists_for_project_returns_empty_list(self, mock_provider):
        """Test that get_playlists_for_project returns empty list when no playlists."""
        mock_provider.get_playlists_for_project.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/projects/999/playlists")
            assert response.status_code == 200
            data = response.json()
            assert data == []
        finally:
            app.dependency_overrides.clear()

    def test_get_playlists_for_project_returns_404_on_error(self, mock_provider):
        """Test that get_playlists_for_project returns 404 on provider error."""
        mock_provider.get_playlists_for_project.side_effect = ValueError(
            "Project not found"
        )

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/projects/999/playlists")
            assert response.status_code == 404
            data = response.json()
            assert "Project not found" in data["detail"]
        finally:
            app.dependency_overrides.clear()


class TestGetVersionsForPlaylistEndpoint:
    """Tests for GET /playlists/{playlist_id}/versions endpoint."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock ShotGrid provider."""
        return mock.MagicMock()

    def test_get_versions_for_playlist_returns_200_with_results(self, mock_provider):
        """Test that get_versions_for_playlist returns 200 with matching versions."""
        from dna.models.entity import Version

        mock_provider.get_versions_for_playlist.return_value = [
            Version(id=1, name="shot_010_v001", status="rev"),
            Version(id=2, name="shot_020_v002", status="apr"),
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/playlists/42/versions")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["id"] == 1
            assert data[0]["type"] == "Version"
            assert data[1]["id"] == 2
            assert data[1]["type"] == "Version"
        finally:
            app.dependency_overrides.clear()

    def test_get_versions_for_playlist_calls_provider_with_playlist_id(
        self, mock_provider
    ):
        """Test that the endpoint passes the playlist_id to the provider."""
        from dna.models.entity import Version

        mock_provider.get_versions_for_playlist.return_value = [
            Version(id=1, name="v001")
        ]

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            client.get("/playlists/123/versions")
            mock_provider.get_versions_for_playlist.assert_called_once_with(123)
        finally:
            app.dependency_overrides.clear()

    def test_get_versions_for_playlist_returns_empty_list(self, mock_provider):
        """Test that get_versions_for_playlist returns empty list when no versions."""
        mock_provider.get_versions_for_playlist.return_value = []

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/playlists/999/versions")
            assert response.status_code == 200
            data = response.json()
            assert data == []
        finally:
            app.dependency_overrides.clear()

    def test_get_versions_for_playlist_returns_404_on_error(self, mock_provider):
        """Test that get_versions_for_playlist returns 404 on provider error."""
        mock_provider.get_versions_for_playlist.side_effect = ValueError(
            "Playlist not found"
        )

        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_provider

        try:
            response = client.get("/playlists/999/versions")
            assert response.status_code == 404
            data = response.json()
            assert "Playlist not found" in data["detail"]
        finally:
            app.dependency_overrides.clear()


class TestGenerateNoteEndpoint:
    """Tests for POST /generate-note endpoint."""

    @pytest.fixture
    def mock_storage_provider(self):
        """Create a mock storage provider."""
        provider = mock.AsyncMock()
        return provider

    @pytest.fixture
    def mock_prodtrack_provider(self):
        """Create a mock prodtrack provider."""
        provider = mock.MagicMock()
        return provider

    @pytest.fixture
    def mock_llm_provider(self):
        """Create a mock LLM provider."""
        provider = mock.AsyncMock()
        return provider

    def test_generate_note_returns_200(
        self, mock_storage_provider, mock_prodtrack_provider, mock_llm_provider
    ):
        """Test that generate_note returns 200 with valid request."""
        from datetime import datetime, timezone

        from dna.models.entity import Version
        from dna.models.user_settings import UserSettings

        mock_storage_provider.get_user_settings.return_value = UserSettings(
            _id="test-id",
            user_email="test@example.com",
            note_prompt="Test prompt {{ transcript }}",
            regenerate_on_version_change=False,
            regenerate_on_transcript_update=False,
            updated_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        mock_storage_provider.get_segments_for_version.return_value = []
        mock_storage_provider.get_draft_note.return_value = None

        mock_prodtrack_provider.get_entity.return_value = Version(
            id=1, name="shot_010_v001"
        )

        mock_llm_provider.generate_note.return_value = "Generated suggestion"

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )
        app.dependency_overrides[get_prodtrack_provider_cached] = (
            lambda: mock_prodtrack_provider
        )
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm_provider

        try:
            response = client.post(
                "/generate-note",
                json={
                    "playlist_id": 1,
                    "version_id": 1,
                    "user_email": "test@example.com",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["suggestion"] == "Generated suggestion"
        finally:
            app.dependency_overrides.clear()

    def test_generate_note_uses_default_prompt_when_no_user_settings(
        self, mock_storage_provider, mock_prodtrack_provider, mock_llm_provider
    ):
        """Test that generate_note uses default prompt when user has no settings."""
        from dna.models.entity import Version

        mock_storage_provider.get_user_settings.return_value = None
        mock_storage_provider.get_segments_for_version.return_value = []
        mock_storage_provider.get_draft_note.return_value = None

        mock_prodtrack_provider.get_entity.return_value = Version(
            id=1, name="shot_010_v001"
        )

        mock_llm_provider.generate_note.return_value = "Default prompt result"

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )
        app.dependency_overrides[get_prodtrack_provider_cached] = (
            lambda: mock_prodtrack_provider
        )
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm_provider

        try:
            response = client.post(
                "/generate-note",
                json={
                    "playlist_id": 1,
                    "version_id": 1,
                    "user_email": "test@example.com",
                },
            )
            assert response.status_code == 200
            mock_llm_provider.generate_note.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_generate_note_builds_transcript_from_segments(
        self, mock_storage_provider, mock_prodtrack_provider, mock_llm_provider
    ):
        """Test that generate_note builds transcript from segments."""
        from datetime import datetime, timezone

        from dna.models.entity import Version
        from dna.models.stored_segment import StoredSegment

        mock_storage_provider.get_user_settings.return_value = None
        mock_storage_provider.get_segments_for_version.return_value = [
            StoredSegment(
                id="seg1",
                segment_id="seg1",
                playlist_id=1,
                version_id=1,
                text="Hello world",
                speaker="Alice",
                absolute_start_time="2024-01-01T00:00:00Z",
                absolute_end_time="2024-01-01T00:00:05Z",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            ),
            StoredSegment(
                id="seg2",
                segment_id="seg2",
                playlist_id=1,
                version_id=1,
                text="How are you?",
                speaker="Bob",
                absolute_start_time="2024-01-01T00:00:05Z",
                absolute_end_time="2024-01-01T00:00:10Z",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            ),
        ]
        mock_storage_provider.get_draft_note.return_value = None

        mock_prodtrack_provider.get_entity.return_value = Version(
            id=1, name="shot_010_v001"
        )

        mock_llm_provider.generate_note.return_value = "Generated"

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )
        app.dependency_overrides[get_prodtrack_provider_cached] = (
            lambda: mock_prodtrack_provider
        )
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm_provider

        try:
            client.post(
                "/generate-note",
                json={
                    "playlist_id": 1,
                    "version_id": 1,
                    "user_email": "test@example.com",
                },
            )
            call_args = mock_llm_provider.generate_note.call_args
            transcript_arg = call_args.kwargs.get("transcript") or call_args[1].get(
                "transcript", call_args[0][1] if len(call_args[0]) > 1 else ""
            )
            assert "Alice: Hello world" in transcript_arg
            assert "Bob: How are you?" in transcript_arg
        finally:
            app.dependency_overrides.clear()

    def test_generate_note_returns_400_on_error(
        self, mock_storage_provider, mock_prodtrack_provider, mock_llm_provider
    ):
        """Test that generate_note returns 400 on error."""
        mock_storage_provider.get_user_settings.side_effect = Exception("DB Error")

        app.dependency_overrides[get_storage_provider_cached] = (
            lambda: mock_storage_provider
        )
        app.dependency_overrides[get_prodtrack_provider_cached] = (
            lambda: mock_prodtrack_provider
        )
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm_provider

        try:
            response = client.post(
                "/generate-note",
                json={
                    "playlist_id": 1,
                    "version_id": 1,
                    "user_email": "test@example.com",
                },
            )
            assert response.status_code == 400
            data = response.json()
            assert "DB Error" in data["detail"]
        finally:
            app.dependency_overrides.clear()
