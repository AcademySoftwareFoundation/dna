"""Tests for main FastAPI application."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app, get_prodtrack_provider_cached

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
