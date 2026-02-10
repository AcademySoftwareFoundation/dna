from datetime import datetime
from unittest import mock

import pytest

from dna.models.entity import Shot, Version
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    get_prodtrack_provider,
)
from dna.prodtrack_providers.shotgrid import ShotgridProvider, _get_dna_entity_type


@pytest.fixture
def shotgrid_provider():
    sg_provider = ShotgridProvider(connect=False)

    mock_sg = mock.MagicMock()
    sg_provider.sg = mock_sg

    return sg_provider


def test_get_version(shotgrid_provider):
    shotgrid_provider.sg.reset_mock()

    shotgrid_provider.sg.find_one.return_value = {
        "id": 1,
        "code": "V001",
        "description": "Version 1",
        "sg_status_list": "Completed",
        "entity": "Entity 1",
        "project": {"type": "Project", "id": 1, "name": "Project 1"},
        "user": "User 1",
        "created_at": "2021-01-01",
        "updated_at": "2021-01-01",
        "sg_path_to_movie": "path/to/movie",
        "sg_path_to_frames": "path/to/frames",
    }

    version = shotgrid_provider.get_entity("version", 1)
    assert version.id == 1
    assert version.name == "V001"
    assert version.description == "Version 1"
    assert version.status == "Completed"
    assert version.movie_path == "path/to/movie"
    assert version.frame_path == "path/to/frames"
    assert version.project == {"type": "Project", "id": 1, "name": "Project 1"}


def test_missing_credentials_raises_error():
    """Test that missing credentials raises ValueError."""
    with mock.patch.dict("os.environ", {}, clear=True):
        with pytest.raises(ValueError, match="ShotGrid credentials not provided"):
            ShotgridProvider(url=None, script_name=None, api_key=None, connect=False)


def test_connect_creates_shotgun_instance():
    """Test that _connect() creates a Shotgun instance."""
    with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun") as mock_shotgun:
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=True,
            sudo_user=None,
        )
        mock_shotgun.assert_called_once_with(
            "https://test.shotgunstudio.com",
            "test_script",
            "test_key",
            sudo_as_login=None,
        )
        assert provider.sg == mock_shotgun.return_value


def test_get_entity_when_not_connected():
    """Test that get_entity raises error when not connected."""
    provider = ShotgridProvider(
        url="https://test.shotgunstudio.com",
        script_name="test_script",
        api_key="test_key",
        connect=False,
    )
    # sg is None when connect=False and we don't set it
    with pytest.raises(ValueError, match="Not connected to ShotGrid"):
        provider.get_entity("version", 1)


def test_get_entity_not_found(shotgrid_provider):
    """Test that get_entity raises error when entity not found."""
    shotgrid_provider.sg.find_one.return_value = None

    with pytest.raises(ValueError, match="Entity not found: version 123"):
        shotgrid_provider.get_entity("version", 123)


def test_version_with_linked_shot_entity(shotgrid_provider):
    """Test that a version's linked entity (Shot) is populated correctly."""
    # ShotGrid returns linked entities as dicts with id, name, type
    version_data = {
        "type": "Version",
        "id": 673,
        "entity": {"id": 1002, "name": "bunny_080_0010", "type": "Shot"},
        "code": "bunny_080_0010_layout_v001",
        "description": "Test description",
        "sg_status_list": "rev",
        "user": {"id": 24, "name": "ShotGrid Support", "type": "HumanUser"},
        "created_at": "2015-12-01T16:43:43",
        "updated_at": "2017-04-19T15:13:05",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shot_data = {
        "type": "Shot",
        "id": 1002,
        "code": "bunny_080_0010",
        "description": "Shot description",
    }

    # Mock find_one to return version first, then shot when linked field is fetched
    shotgrid_provider.sg.find_one.side_effect = [version_data, shot_data]

    version = shotgrid_provider.get_entity("version", 673)

    assert version.id == 673
    assert version.name == "bunny_080_0010_layout_v001"
    # The linked entity should be a Shot object
    assert version.entity is not None
    assert version.entity.id == 1002
    assert version.entity.name == "bunny_080_0010"


def test_version_with_linked_asset_entity(shotgrid_provider):
    """Test that a version's linked entity (Asset) is populated correctly."""
    version_data = {
        "type": "Version",
        "id": 100,
        "entity": {"id": 500, "name": "hero_character", "type": "Asset"},
        "code": "hero_character_rig_v002",
        "description": "Rig update",
        "sg_status_list": "apr",
        "user": {"id": 10, "name": "Artist", "type": "HumanUser"},
        "created_at": "2021-01-01",
        "updated_at": "2021-01-02",
        "sg_path_to_movie": "/path/to/movie.mov",
        "sg_path_to_frames": "/path/to/frames",
    }

    asset_data = {
        "type": "Asset",
        "id": 500,
        "code": "hero_character",
        "description": "Main hero character asset",
    }

    shotgrid_provider.sg.find_one.side_effect = [version_data, asset_data]

    version = shotgrid_provider.get_entity("version", 100)

    assert version.entity is not None
    assert version.entity.id == 500
    assert version.entity.name == "hero_character"


def test_version_with_null_linked_entity(shotgrid_provider):
    """Test that a version with no linked entity handles None correctly."""
    version_data = {
        "type": "Version",
        "id": 200,
        "entity": None,
        "code": "standalone_version_v001",
        "description": "No entity linked",
        "sg_status_list": "wip",
        "user": None,
        "created_at": "2021-06-01",
        "updated_at": "2021-06-01",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.return_value = version_data

    version = shotgrid_provider.get_entity("version", 200)

    assert version.id == 200
    assert version.entity is None


def test_playlist_with_linked_versions_list(shotgrid_provider):
    """Test that a playlist's linked versions list is populated correctly."""
    playlist_data = {
        "type": "Playlist",
        "id": 50,
        "code": "dailies_review_2021",
        "description": "Daily review playlist",
        "project": {"id": 1, "name": "Test Project", "type": "Project"},
        "created_at": "2021-03-01",
        "updated_at": "2021-03-15",
        "versions": [
            {"id": 101, "name": "shot_010_anim_v001", "type": "Version"},
            {"id": 102, "name": "shot_020_anim_v002", "type": "Version"},
        ],
    }

    version_1_data = {
        "type": "Version",
        "id": 101,
        "code": "shot_010_anim_v001",
        "description": "Animation pass 1",
        "sg_status_list": "rev",
        "user": None,
        "entity": None,
        "created_at": "2021-03-01",
        "updated_at": "2021-03-01",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    version_2_data = {
        "type": "Version",
        "id": 102,
        "code": "shot_020_anim_v002",
        "description": "Animation pass 2",
        "sg_status_list": "apr",
        "user": None,
        "entity": None,
        "created_at": "2021-03-02",
        "updated_at": "2021-03-02",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.side_effect = [
        playlist_data,
        version_1_data,
        version_2_data,
    ]

    playlist = shotgrid_provider.get_entity("playlist", 50)

    assert playlist.id == 50
    assert playlist.code == "dailies_review_2021"
    assert playlist.versions is not None
    assert len(playlist.versions) == 2
    assert playlist.versions[0].id == 101
    assert playlist.versions[0].name == "shot_010_anim_v001"
    assert playlist.versions[1].id == 102
    assert playlist.versions[1].name == "shot_020_anim_v002"


def test_playlist_with_empty_versions_list(shotgrid_provider):
    """Test that a playlist with no versions handles empty list correctly."""
    playlist_data = {
        "type": "Playlist",
        "id": 60,
        "code": "empty_playlist",
        "description": "Empty playlist",
        "project": {"id": 1, "name": "Test Project", "type": "Project"},
        "created_at": "2021-04-01",
        "updated_at": "2021-04-01",
        "versions": [],
    }

    shotgrid_provider.sg.find_one.return_value = playlist_data

    playlist = shotgrid_provider.get_entity("playlist", 60)

    assert playlist.id == 60
    assert playlist.versions == []


# ============================================================================
# __to_dict__ serialization tests
# ============================================================================


def test_entity_to_dict_basic_attributes(shotgrid_provider):
    """Test that __to_dict__ serializes all basic attributes."""
    shotgrid_provider.sg.find_one.return_value = {
        "id": 1,
        "code": "V001",
        "description": "Version 1",
        "sg_status_list": "Completed",
        "user": "User 1",
        "created_at": "2021-01-01",
        "updated_at": "2021-01-01",
        "sg_path_to_movie": "path/to/movie",
        "sg_path_to_frames": "path/to/frames",
        "entity": None,
    }

    version = shotgrid_provider.get_entity("version", 1)
    result = version.__to_dict__()

    assert result["type"] == "Version"
    assert result["id"] == 1
    assert result["name"] == "V001"
    assert result["description"] == "Version 1"
    assert result["status"] == "Completed"
    assert result["movie_path"] == "path/to/movie"
    assert result["frame_path"] == "path/to/frames"
    # Internal attributes should be excluded
    assert "provider" not in result
    assert "_impl" not in result


def test_entity_to_dict_excludes_internal_attributes(shotgrid_provider):
    """Test that __to_dict__ excludes internal attributes (starting with _)."""
    shotgrid_provider.sg.find_one.return_value = {
        "id": 100,
        "code": "shot_010",
        "description": "Shot 10",
    }

    shot = shotgrid_provider.get_entity("shot", 100)
    result = shot.__to_dict__()

    # Check no keys starting with underscore
    for key in result.keys():
        assert not key.startswith("_"), f"Internal attribute {key} should be excluded"

    # Specifically check _impl is not present
    assert "_impl" not in result


def test_entity_to_dict_with_nested_entity(shotgrid_provider):
    """Test that __to_dict__ recursively serializes nested entities."""
    version_data = {
        "type": "Version",
        "id": 673,
        "entity": {"id": 1002, "name": "bunny_080_0010", "type": "Shot"},
        "code": "bunny_080_0010_layout_v001",
        "description": "Test description",
        "sg_status_list": "rev",
        "user": None,
        "created_at": "2015-12-01",
        "updated_at": "2017-04-19",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shot_data = {
        "type": "Shot",
        "id": 1002,
        "code": "bunny_080_0010",
        "description": "Shot description",
    }

    shotgrid_provider.sg.find_one.side_effect = [version_data, shot_data]

    version = shotgrid_provider.get_entity("version", 673)
    result = version.__to_dict__()

    # The nested entity should be serialized as a dict, not an object
    assert isinstance(result["entity"], dict)
    assert result["entity"]["type"] == "Shot"
    assert result["entity"]["id"] == 1002
    assert result["entity"]["name"] == "bunny_080_0010"
    # Nested entity should also exclude internal attributes
    assert "provider" not in result["entity"]
    assert "_impl" not in result["entity"]


def test_entity_to_dict_with_list_of_entities(shotgrid_provider):
    """Test that __to_dict__ serializes lists of nested entities."""
    playlist_data = {
        "type": "Playlist",
        "id": 50,
        "code": "dailies_review_2021",
        "description": "Daily review playlist",
        "project": {"id": 1, "name": "Test Project", "type": "Project"},
        "created_at": "2021-03-01",
        "updated_at": "2021-03-15",
        "versions": [
            {"id": 101, "name": "shot_010_anim_v001", "type": "Version"},
            {"id": 102, "name": "shot_020_anim_v002", "type": "Version"},
        ],
    }

    version_1_data = {
        "type": "Version",
        "id": 101,
        "code": "shot_010_anim_v001",
        "description": "Animation pass 1",
        "sg_status_list": "rev",
        "user": None,
        "entity": None,
        "created_at": "2021-03-01",
        "updated_at": "2021-03-01",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    version_2_data = {
        "type": "Version",
        "id": 102,
        "code": "shot_020_anim_v002",
        "description": "Animation pass 2",
        "sg_status_list": "apr",
        "user": None,
        "entity": None,
        "created_at": "2021-03-02",
        "updated_at": "2021-03-02",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.side_effect = [
        playlist_data,
        version_1_data,
        version_2_data,
    ]

    playlist = shotgrid_provider.get_entity("playlist", 50)
    result = playlist.__to_dict__()

    # Versions should be a list of dicts
    assert isinstance(result["versions"], list)
    assert len(result["versions"]) == 2

    # Each version should be serialized
    assert result["versions"][0]["type"] == "Version"
    assert result["versions"][0]["id"] == 101
    assert result["versions"][0]["name"] == "shot_010_anim_v001"

    assert result["versions"][1]["type"] == "Version"
    assert result["versions"][1]["id"] == 102
    assert result["versions"][1]["name"] == "shot_020_anim_v002"


def test_entity_to_dict_with_empty_list(shotgrid_provider):
    """Test that __to_dict__ handles empty lists correctly."""
    playlist_data = {
        "type": "Playlist",
        "id": 60,
        "code": "empty_playlist",
        "description": "Empty playlist",
        "project": {"id": 1, "name": "Test Project", "type": "Project"},
        "created_at": "2021-04-01",
        "updated_at": "2021-04-01",
        "versions": [],
    }

    shotgrid_provider.sg.find_one.return_value = playlist_data

    playlist = shotgrid_provider.get_entity("playlist", 60)
    result = playlist.__to_dict__()

    assert result["versions"] == []


def test_entity_to_dict_with_null_linked_entity(shotgrid_provider):
    """Test that __to_dict__ handles None linked entities correctly."""
    version_data = {
        "type": "Version",
        "id": 200,
        "entity": None,
        "code": "standalone_version_v001",
        "description": "No entity linked",
        "sg_status_list": "wip",
        "user": None,
        "created_at": "2021-06-01",
        "updated_at": "2021-06-01",
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.return_value = version_data

    version = shotgrid_provider.get_entity("version", 200)
    result = version.__to_dict__()

    assert result["entity"] is None


def test_entity_to_dict_converts_datetime_to_iso_string(shotgrid_provider):
    """Test that __to_dict__ converts datetime objects to ISO format strings."""
    created_dt = datetime(2021, 6, 15, 14, 30, 45)
    updated_dt = datetime(2021, 6, 16, 10, 0, 0)

    version_data = {
        "type": "Version",
        "id": 300,
        "entity": None,
        "code": "datetime_test_v001",
        "description": "Testing datetime conversion",
        "sg_status_list": "wip",
        "user": None,
        "created_at": created_dt,
        "updated_at": updated_dt,
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.return_value = version_data

    version = shotgrid_provider.get_entity("version", 300)
    result = version.__to_dict__()

    # Datetime objects should be converted to ISO format strings
    assert result["created_at"] == "2021-06-15T14:30:45"
    assert result["updated_at"] == "2021-06-16T10:00:00"
    assert isinstance(result["created_at"], str)
    assert isinstance(result["updated_at"], str)


def test_entity_to_dict_converts_datetime_in_nested_entity(shotgrid_provider):
    """Test that __to_dict__ converts datetime objects in nested Version entities."""
    playlist_created_dt = datetime(2021, 7, 1, 9, 0, 0)

    # Use a playlist with a single version to test nested datetime conversion
    playlist_data = {
        "type": "Playlist",
        "id": 80,
        "code": "nested_datetime_playlist",
        "description": "Testing nested datetime",
        "project": {"id": 1, "name": "Test Project", "type": "Project"},
        "created_at": playlist_created_dt,
        "updated_at": playlist_created_dt,
        "versions": [{"id": 601, "name": "v001", "type": "Version"}],
    }

    version_created_dt = datetime(2021, 5, 10, 12, 30, 0)
    version_data = {
        "type": "Version",
        "id": 601,
        "code": "v001",
        "description": "Version with datetime",
        "sg_status_list": "rev",
        "user": None,
        "entity": None,
        "created_at": version_created_dt,
        "updated_at": version_created_dt,
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.side_effect = [playlist_data, version_data]

    playlist = shotgrid_provider.get_entity("playlist", 80)
    result = playlist.__to_dict__()

    # Top-level datetime should be converted
    assert result["created_at"] == "2021-07-01T09:00:00"
    assert isinstance(result["created_at"], str)

    # Nested entity datetime should also be converted
    assert result["versions"][0]["created_at"] == "2021-05-10T12:30:00"
    assert isinstance(result["versions"][0]["created_at"], str)


def test_entity_to_dict_converts_datetime_in_list_of_entities(shotgrid_provider):
    """Test that __to_dict__ converts datetime objects in lists of entities."""
    playlist_created_dt = datetime(2021, 8, 1, 8, 0, 0)

    playlist_data = {
        "type": "Playlist",
        "id": 70,
        "code": "datetime_list_playlist",
        "description": "Playlist with datetime in versions",
        "project": {"id": 1, "name": "Test Project", "type": "Project"},
        "created_at": playlist_created_dt,
        "updated_at": playlist_created_dt,
        "versions": [
            {"id": 501, "name": "v001", "type": "Version"},
        ],
    }

    version_created_dt = datetime(2021, 8, 2, 15, 45, 30)
    version_data = {
        "type": "Version",
        "id": 501,
        "code": "v001",
        "description": "Version with datetime",
        "sg_status_list": "rev",
        "user": None,
        "entity": None,
        "created_at": version_created_dt,
        "updated_at": version_created_dt,
        "sg_path_to_movie": None,
        "sg_path_to_frames": None,
    }

    shotgrid_provider.sg.find_one.side_effect = [playlist_data, version_data]

    playlist = shotgrid_provider.get_entity("playlist", 70)
    result = playlist.__to_dict__()

    # Playlist datetime should be converted
    assert result["created_at"] == "2021-08-01T08:00:00"

    # Version in list should have datetime converted
    assert result["versions"][0]["created_at"] == "2021-08-02T15:45:30"
    assert isinstance(result["versions"][0]["created_at"], str)


# ============================================================================
# ProdtrackProviderBase tests
# ============================================================================


class TestProdtrackProviderBase:
    """Tests for the ProdtrackProviderBase class."""

    def test_get_object_type_returns_entity_model(self):
        """Test that _get_object_type returns the correct entity model class."""
        provider = ProdtrackProviderBase()
        model_class = provider._get_object_type("shot")
        assert model_class == Shot

    def test_get_object_type_returns_entity_base_for_unknown(self):
        """Test that _get_object_type returns EntityBase for unknown types."""
        from dna.models.entity import EntityBase

        provider = ProdtrackProviderBase()
        model_class = provider._get_object_type("unknown_type")
        assert model_class == EntityBase

    def test_get_entity_raises_not_implemented(self):
        """Test that get_entity raises NotImplementedError."""
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.get_entity("shot", 1)

    def test_add_entity_raises_not_implemented(self):
        """Test that add_entity raises NotImplementedError."""
        provider = ProdtrackProviderBase()
        shot = Shot(id=1, name="test")
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.add_entity("shot", shot)

    def test_find_raises_not_implemented(self):
        """Test that find raises NotImplementedError."""
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.find("shot", [])

    def test_get_projects_for_user_raises_not_implemented(self):
        """Test that get_projects_for_user raises NotImplementedError."""
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.get_projects_for_user("testuser")

    def test_get_playlists_for_project_raises_not_implemented(self):
        """Test that get_playlists_for_project raises NotImplementedError."""
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.get_playlists_for_project(1)

    def test_get_versions_for_playlist_raises_not_implemented(self):
        """Test that get_versions_for_playlist raises NotImplementedError."""
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.get_versions_for_playlist(1)


class TestGetProdtrackProvider:
    """Tests for the get_prodtrack_provider function."""

    def test_get_prodtrack_provider_returns_shotgrid_provider(self):
        """Test that get_prodtrack_provider returns ShotgridProvider when configured."""
        with mock.patch.dict(
            "os.environ",
            {
                "PRODTRACK_PROVIDER": "shotgrid",
                "SHOTGRID_URL": "https://test.shotgunstudio.com",
                "SHOTGRID_SCRIPT_NAME": "test_script",
                "SHOTGRID_API_KEY": "test_key",
            },
        ):
            with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun"):
                provider = get_prodtrack_provider()
                assert isinstance(provider, ShotgridProvider)

    def test_get_prodtrack_provider_raises_for_unknown_provider(self):
        """Test that get_prodtrack_provider raises ValueError for unknown provider."""
        with mock.patch.dict("os.environ", {"PRODTRACK_PROVIDER": "unknown_provider"}):
            with pytest.raises(
                ValueError, match="Unknown production tracking provider"
            ):
                get_prodtrack_provider()


# ============================================================================
# ShotGrid edge case tests
# ============================================================================


class TestShotgridEdgeCases:
    """Tests for edge cases in the ShotGrid provider."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_get_entity_unknown_type_raises_error(self, shotgrid_provider):
        """Test that get_entity raises ValueError for unknown entity type."""
        with pytest.raises(ValueError, match="Unknown entity type: unknown_type"):
            shotgrid_provider.get_entity("unknown_type", 1)

    def test_add_entity_unknown_type_raises_error(self, shotgrid_provider):
        """Test that add_entity raises ValueError for unknown entity type."""
        shot = Shot(id=1, name="test")
        with pytest.raises(ValueError, match="Unknown entity type: unknown_type"):
            shotgrid_provider.add_entity("unknown_type", shot)

    def test_convert_sg_entity_no_mapping_raises_error(self, shotgrid_provider):
        """Test that _convert_sg_entity_to_dna_entity raises error when no mapping found."""
        sg_entity = {"id": 1, "code": "test"}
        with pytest.raises(
            ValueError, match="No field mapping found for entity type: unknown_type"
        ):
            shotgrid_provider._convert_sg_entity_to_dna_entity(
                sg_entity, entity_mapping=None, entity_type="unknown_type"
            )

    def test_convert_entities_to_sg_links_with_single_entity(self, shotgrid_provider):
        """Test _convert_entities_to_sg_links with a single EntityBase."""
        version = Version(id=123, name="test_version")
        result = shotgrid_provider._convert_entities_to_sg_links(version)
        assert result == {"type": "Version", "id": 123}

    def test_convert_entities_to_sg_links_with_list(self, shotgrid_provider):
        """Test _convert_entities_to_sg_links with a list of entities."""
        version1 = Version(id=1, name="v001")
        version2 = Version(id=2, name="v002")
        result = shotgrid_provider._convert_entities_to_sg_links([version1, version2])
        assert result == [{"type": "Version", "id": 1}, {"type": "Version", "id": 2}]

    def test_convert_entities_to_sg_links_returns_none_for_non_entity(
        self, shotgrid_provider
    ):
        """Test _convert_entities_to_sg_links returns None for non-entity values."""
        result = shotgrid_provider._convert_entities_to_sg_links("not an entity")
        assert result is None

        result = shotgrid_provider._convert_entities_to_sg_links(12345)
        assert result is None

        result = shotgrid_provider._convert_entities_to_sg_links(None)
        assert result is None

    def test_convert_entities_to_sg_links_filters_non_entities_from_list(
        self, shotgrid_provider
    ):
        """Test _convert_entities_to_sg_links filters non-entity items from list."""
        version = Version(id=1, name="v001")
        result = shotgrid_provider._convert_entities_to_sg_links(
            [version, "not_an_entity", 123]
        )
        assert result == [{"type": "Version", "id": 1}]

    def test_add_entity_with_none_linked_field(self, shotgrid_provider):
        """Test add_entity skips linked fields that are None."""
        shotgrid_provider.sg.reset_mock()

        shotgrid_provider.sg.create.return_value = {
            "type": "Version",
            "id": 500,
            "code": "test_v001",
            "description": "Test version",
            "sg_status_list": "wip",
        }

        version = Version(
            id=0,
            name="test_v001",
            description="Test version",
            status="wip",
            entity=None,
            task=None,
        )

        created_version = shotgrid_provider.add_entity("version", version)

        call_args = shotgrid_provider.sg.create.call_args
        sg_data = call_args[0][1]
        assert "entity" not in sg_data
        assert "sg_task" not in sg_data
        assert created_version.id == 500


class TestGetDnaEntityType:
    """Tests for the _get_dna_entity_type function."""

    def test_get_dna_entity_type_for_shot(self):
        """Test _get_dna_entity_type returns correct type for Shot."""
        assert _get_dna_entity_type("Shot") == "shot"

    def test_get_dna_entity_type_for_asset(self):
        """Test _get_dna_entity_type returns correct type for Asset."""
        assert _get_dna_entity_type("Asset") == "asset"

    def test_get_dna_entity_type_for_version(self):
        """Test _get_dna_entity_type returns correct type for Version."""
        assert _get_dna_entity_type("Version") == "version"

    def test_get_dna_entity_type_for_task(self):
        """Test _get_dna_entity_type returns correct type for Task."""
        assert _get_dna_entity_type("Task") == "task"

    def test_get_dna_entity_type_for_note(self):
        """Test _get_dna_entity_type returns correct type for Note."""
        assert _get_dna_entity_type("Note") == "note"

    def test_get_dna_entity_type_for_playlist(self):
        """Test _get_dna_entity_type returns correct type for Playlist."""
        assert _get_dna_entity_type("Playlist") == "playlist"

    def test_get_dna_entity_type_raises_for_unknown(self):
        """Test _get_dna_entity_type raises ValueError for unknown type."""
        with pytest.raises(ValueError, match="Unknown entity type: UnknownType"):
            _get_dna_entity_type("UnknownType")

    def test_get_dna_entity_type_for_project(self):
        """Test _get_dna_entity_type returns correct type for Project."""
        assert _get_dna_entity_type("Project") == "project"


# ============================================================================
# ShotGrid find method tests
# ============================================================================


class TestShotgridProviderFind:
    """Tests for the ShotgridProvider.find method."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_find_returns_empty_list_when_no_results(self, shotgrid_provider):
        """Test that find returns an empty list when no results found."""
        shotgrid_provider.sg.find.return_value = []

        results = shotgrid_provider.find("project", [])

        assert results == []
        shotgrid_provider.sg.find.assert_called_once()

    def test_find_returns_project_entities(self, shotgrid_provider):
        """Test that find returns properly converted Project entities."""
        shotgrid_provider.sg.find.return_value = [
            {"id": 1, "name": "Project One"},
            {"id": 2, "name": "Project Two"},
        ]

        results = shotgrid_provider.find("project", [])

        assert len(results) == 2
        assert results[0].id == 1
        assert results[0].name == "Project One"
        assert results[1].id == 2
        assert results[1].name == "Project Two"

    def test_find_converts_dna_filters_to_sg_filters(self, shotgrid_provider):
        """Test that find converts DNA field names to SG field names in filters."""
        shotgrid_provider.sg.find.return_value = [{"id": 1, "name": "Test Project"}]

        filters = [{"field": "name", "operator": "contains", "value": "Test"}]
        shotgrid_provider.find("project", filters)

        call_args = shotgrid_provider.sg.find.call_args
        sg_filters = call_args[1]["filters"]
        assert sg_filters == [["name", "contains", "Test"]]

    def test_find_converts_version_filters(self, shotgrid_provider):
        """Test that find converts version-specific DNA fields to SG fields."""
        shotgrid_provider.sg.find.return_value = []

        filters = [
            {"field": "name", "operator": "is", "value": "v001"},
            {"field": "status", "operator": "is", "value": "apr"},
        ]
        shotgrid_provider.find("version", filters)

        call_args = shotgrid_provider.sg.find.call_args
        sg_filters = call_args[1]["filters"]
        assert ["code", "is", "v001"] in sg_filters
        assert ["sg_status_list", "is", "apr"] in sg_filters

    def test_find_converts_shot_filters(self, shotgrid_provider):
        """Test that find converts shot-specific DNA fields to SG fields."""
        shotgrid_provider.sg.find.return_value = []

        filters = [{"field": "name", "operator": "contains", "value": "010"}]
        shotgrid_provider.find("shot", filters)

        call_args = shotgrid_provider.sg.find.call_args
        sg_filters = call_args[1]["filters"]
        assert sg_filters == [["code", "contains", "010"]]

    def test_find_requests_all_dna_fields(self, shotgrid_provider):
        """Test that find requests all mapped fields from ShotGrid."""
        shotgrid_provider.sg.find.return_value = []

        shotgrid_provider.find("project", [])

        call_args = shotgrid_provider.sg.find.call_args
        sg_fields = call_args[1]["fields"]
        assert "id" in sg_fields
        assert "name" in sg_fields

    def test_find_uses_correct_sg_entity_type(self, shotgrid_provider):
        """Test that find queries the correct SG entity type."""
        shotgrid_provider.sg.find.return_value = []

        shotgrid_provider.find("version", [])

        call_args = shotgrid_provider.sg.find.call_args
        sg_entity_type = call_args[0][0]
        assert sg_entity_type == "Version"

    def test_find_raises_error_for_unsupported_entity_type(self, shotgrid_provider):
        """Test that find raises ValueError for unsupported entity types."""
        with pytest.raises(ValueError, match="Unsupported entity type: unknown"):
            shotgrid_provider.find("unknown", [])

    def test_find_raises_error_for_unknown_field(self, shotgrid_provider):
        """Test that find raises ValueError for unknown DNA fields in filters."""
        filters = [{"field": "nonexistent_field", "operator": "is", "value": "test"}]

        with pytest.raises(
            ValueError, match="Unknown field 'nonexistent_field' for entity type"
        ):
            shotgrid_provider.find("project", filters)

    def test_find_raises_error_when_not_connected(self):
        """Test that find raises error when not connected to ShotGrid."""
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.find("project", [])

    def test_find_with_multiple_filters(self, shotgrid_provider):
        """Test find with multiple filter conditions."""
        shotgrid_provider.sg.find.return_value = []

        filters = [
            {"field": "name", "operator": "contains", "value": "hero"},
            {"field": "description", "operator": "is_not", "value": None},
            {"field": "id", "operator": "greater_than", "value": 100},
        ]
        shotgrid_provider.find("shot", filters)

        call_args = shotgrid_provider.sg.find.call_args
        sg_filters = call_args[1]["filters"]
        assert len(sg_filters) == 3
        assert ["code", "contains", "hero"] in sg_filters
        assert ["description", "is_not", None] in sg_filters
        assert ["id", "greater_than", 100] in sg_filters

    def test_find_returns_fully_converted_entities(self, shotgrid_provider):
        """Test that find returns entities with all fields properly converted."""
        shotgrid_provider.sg.find.return_value = [
            {
                "id": 100,
                "code": "shot_010",
                "description": "First shot",
                "project": {"type": "Project", "id": 1, "name": "Test"},
            }
        ]

        results = shotgrid_provider.find("shot", [])

        assert len(results) == 1
        shot = results[0]
        assert shot.id == 100
        assert shot.name == "shot_010"
        assert shot.description == "First shot"
        assert shot.project == {"type": "Project", "id": 1, "name": "Test"}


# ============================================================================
# ShotGrid get_projects_for_user tests
# ============================================================================


class TestShotgridProviderGetProjectsForUser:
    """Tests for the ShotgridProvider.get_projects_for_user method."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_get_projects_for_user_returns_projects(self, shotgrid_provider):
        """Test that get_projects_for_user returns properly converted Project entities."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 1,
            "email": "test@example.com",
            "name": "Test User",
        }
        shotgrid_provider.sg.find.return_value = [
            {"id": 10, "name": "Project Alpha"},
            {"id": 20, "name": "Project Beta"},
        ]

        results = shotgrid_provider.get_projects_for_user("test@example.com")

        assert len(results) == 2
        assert results[0].id == 10
        assert results[0].name == "Project Alpha"
        assert results[1].id == 20
        assert results[1].name == "Project Beta"

    def test_get_projects_for_user_queries_correct_user(self, shotgrid_provider):
        """Test that get_projects_for_user queries the correct user by email."""
        user_data = {"id": 1, "email": "jsmith@example.com", "name": "John Smith"}
        shotgrid_provider.sg.find_one.return_value = user_data
        shotgrid_provider.sg.find.return_value = []

        shotgrid_provider.get_projects_for_user("jsmith@example.com")

        shotgrid_provider.sg.find_one.assert_called_once_with(
            "HumanUser",
            filters=[["email", "is", "jsmith@example.com"]],
            fields=["id", "email", "name"],
        )

    def test_get_projects_for_user_filters_by_user(self, shotgrid_provider):
        """Test that get_projects_for_user filters projects by user."""
        user_data = {"id": 42, "email": "test@example.com", "name": "Test User"}
        shotgrid_provider.sg.find_one.return_value = user_data
        shotgrid_provider.sg.find.return_value = []

        shotgrid_provider.get_projects_for_user("test@example.com")

        shotgrid_provider.sg.find.assert_called_once_with(
            "Project",
            filters=[["users", "is", user_data]],
            fields=["id", "name"],
        )

    def test_get_projects_for_user_raises_error_when_not_connected(self):
        """Test that get_projects_for_user raises error when not connected."""
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.get_projects_for_user("testuser")

    def test_get_projects_for_user_raises_error_when_user_not_found(
        self, shotgrid_provider
    ):
        """Test that get_projects_for_user raises error when user not found."""
        shotgrid_provider.sg.find_one.return_value = None

        with pytest.raises(ValueError, match="User not found: unknown@example.com"):
            shotgrid_provider.get_projects_for_user("unknown@example.com")

    def test_get_projects_for_user_returns_empty_list_when_no_projects(
        self, shotgrid_provider
    ):
        """Test that get_projects_for_user returns empty list when user has no projects."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 1,
            "email": "newuser@example.com",
            "name": "New User",
        }
        shotgrid_provider.sg.find.return_value = []

        results = shotgrid_provider.get_projects_for_user("newuser@example.com")

        assert results == []


# ============================================================================
# ShotGrid get_playlists_for_project tests
# ============================================================================


class TestShotgridProviderGetPlaylistsForProject:
    """Tests for the ShotgridProvider.get_playlists_for_project method."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_get_playlists_for_project_returns_playlists(self, shotgrid_provider):
        """Test that get_playlists_for_project returns properly converted Playlist entities."""
        shotgrid_provider.sg.find.return_value = [
            {"id": 10, "code": "Dailies Review", "description": "Daily review"},
            {"id": 20, "code": "Final Review", "description": "Final approval"},
        ]

        results = shotgrid_provider.get_playlists_for_project(1)

        assert len(results) == 2
        assert results[0].id == 10
        assert results[0].code == "Dailies Review"
        assert results[1].id == 20
        assert results[1].code == "Final Review"

    def test_get_playlists_for_project_filters_by_project(self, shotgrid_provider):
        """Test that get_playlists_for_project filters by project."""
        shotgrid_provider.sg.find.return_value = []

        shotgrid_provider.get_playlists_for_project(42)

        shotgrid_provider.sg.find.assert_called_once_with(
            "Playlist",
            filters=[
                ["project", "is", {"type": "Project", "id": 42}],
            ],
            fields=[
                "id",
                "code",
                "description",
                "project",
                "created_at",
                "updated_at",
            ],
        )

    def test_get_playlists_for_project_raises_error_when_not_connected(self):
        """Test that get_playlists_for_project raises error when not connected."""
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.get_playlists_for_project(1)

    def test_get_playlists_for_project_returns_empty_list_when_no_playlists(
        self, shotgrid_provider
    ):
        """Test that get_playlists_for_project returns empty list when no playlists found."""
        shotgrid_provider.sg.find.return_value = []

        results = shotgrid_provider.get_playlists_for_project(999)

        assert results == []


# ============================================================================
# ShotGrid get_versions_for_playlist tests
# ============================================================================


class TestShotgridProviderGetVersionsForPlaylist:
    """Tests for the ShotgridProvider.get_versions_for_playlist method."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_get_versions_for_playlist_returns_versions(self, shotgrid_provider):
        """Test that get_versions_for_playlist returns properly converted Version entities."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 1,
            "versions": [{"type": "Version", "id": 10}, {"type": "Version", "id": 20}],
        }
        shotgrid_provider.sg.find.return_value = [
            {"id": 10, "code": "shot_010_v001", "sg_status_list": "rev"},
            {"id": 20, "code": "shot_020_v002", "sg_status_list": "apr"},
        ]

        results = shotgrid_provider.get_versions_for_playlist(1)

        assert len(results) == 2
        assert results[0].id == 10
        assert results[0].name == "shot_010_v001"
        assert results[1].id == 20
        assert results[1].name == "shot_020_v002"

    def test_get_versions_for_playlist_queries_playlist_first(self, shotgrid_provider):
        """Test that get_versions_for_playlist queries the playlist to get version IDs."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 42,
            "versions": [{"type": "Version", "id": 100}],
        }
        shotgrid_provider.sg.find.return_value = [{"id": 100, "code": "v001"}]

        shotgrid_provider.get_versions_for_playlist(42)

        shotgrid_provider.sg.find_one.assert_called_once_with(
            "Playlist",
            filters=[["id", "is", 42]],
            fields=["versions"],
        )

    def test_get_versions_for_playlist_queries_versions_by_ids(self, shotgrid_provider):
        """Test that get_versions_for_playlist queries versions by their IDs."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 1,
            "versions": [{"type": "Version", "id": 10}, {"type": "Version", "id": 20}],
        }
        shotgrid_provider.sg.find.return_value = []

        shotgrid_provider.get_versions_for_playlist(1)

        call_args = shotgrid_provider.sg.find.call_args
        assert call_args[0][0] == "Version"
        filters = call_args[1]["filters"]
        assert filters == [["id", "in", [10, 20]]]

    def test_get_versions_for_playlist_raises_error_when_not_connected(self):
        """Test that get_versions_for_playlist raises error when not connected."""
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.get_versions_for_playlist(1)

    def test_get_versions_for_playlist_returns_empty_list_when_no_versions(
        self, shotgrid_provider
    ):
        """Test that get_versions_for_playlist returns empty list when playlist has no versions."""
        shotgrid_provider.sg.find_one.return_value = {"id": 1, "versions": []}

        results = shotgrid_provider.get_versions_for_playlist(1)

        assert results == []

    def test_get_versions_for_playlist_returns_empty_list_when_playlist_not_found(
        self, shotgrid_provider
    ):
        """Test that get_versions_for_playlist returns empty list when playlist not found."""
        shotgrid_provider.sg.find_one.return_value = None

        results = shotgrid_provider.get_versions_for_playlist(999)

        assert results == []

    def test_get_versions_for_playlist_returns_empty_list_when_versions_null(
        self, shotgrid_provider
    ):
        """Test that get_versions_for_playlist returns empty list when versions field is null."""
        shotgrid_provider.sg.find_one.return_value = {"id": 1, "versions": None}

        results = shotgrid_provider.get_versions_for_playlist(1)

        assert results == []

    def test_get_versions_for_playlist_with_task_enrichment(self, shotgrid_provider):
        """Test that get_versions_for_playlist enriches versions with task data."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 1,
            "versions": [{"type": "Version", "id": 100}],
        }

        shotgrid_provider.sg.find.side_effect = [
            [
                {
                    "id": 100,
                    "code": "shot_010_v001",
                    "sg_status_list": "rev",
                    "sg_task": {"type": "Task", "id": 500},
                    "entity": None,
                    "user": None,
                    "created_at": None,
                    "updated_at": None,
                    "sg_path_to_movie": None,
                    "sg_path_to_frames": None,
                    "notes": None,
                    "project": None,
                    "image": None,
                }
            ],
            [
                {
                    "id": 500,
                    "content": "Animation",
                    "sg_status_list": "ip",
                    "step": {"type": "Step", "id": 10, "name": "Anim"},
                }
            ],
        ]

        results = shotgrid_provider.get_versions_for_playlist(1)

        assert len(results) == 1
        assert results[0].task is not None
        assert results[0].task.id == 500
        assert results[0].task.name == "Animation"


# ============================================================================
# ShotGrid get_user_by_email tests
# ============================================================================


class TestShotgridProviderGetUserByEmail:
    """Tests for the ShotgridProvider.get_user_by_email method."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_get_user_by_email_returns_user(self, shotgrid_provider):
        """Test that get_user_by_email returns properly converted User entity."""
        shotgrid_provider.sg.find_one.return_value = {
            "id": 42,
            "name": "John Doe",
            "email": "jdoe@example.com",
            "login": "jdoe",
        }

        result = shotgrid_provider.get_user_by_email("jdoe@example.com")

        assert result.id == 42
        assert result.name == "John Doe"
        assert result.email == "jdoe@example.com"
        assert result.login == "jdoe"

    def test_get_user_by_email_raises_error_when_not_connected(self):
        """Test that get_user_by_email raises error when not connected."""
        provider = ShotgridProvider(
            url="https://test.shotgunstudio.com",
            script_name="test_script",
            api_key="test_key",
            connect=False,
        )
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.get_user_by_email("test@example.com")

    def test_get_user_by_email_raises_error_when_user_not_found(
        self, shotgrid_provider
    ):
        """Test that get_user_by_email raises error when user not found."""
        shotgrid_provider.sg.find_one.return_value = None

        with pytest.raises(ValueError, match="User not found: unknown@example.com"):
            shotgrid_provider.get_user_by_email("unknown@example.com")


# ============================================================================
# ShotGrid shallow link conversion tests
# ============================================================================


class TestShotgridProviderShallowLinks:
    """Tests for shallow link conversion methods."""

    @pytest.fixture
    def shotgrid_provider(self):
        sg_provider = ShotgridProvider(connect=False)
        mock_sg = mock.MagicMock()
        sg_provider.sg = mock_sg
        return sg_provider

    def test_convert_shallow_link_with_single_dict(self, shotgrid_provider):
        """Test _convert_shallow_link with a single dict."""
        data = {"type": "Shot", "id": 100, "name": "shot_010"}
        result = shotgrid_provider._convert_shallow_link(data)

        assert result is not None
        assert result.id == 100
        assert result.name == "shot_010"

    def test_convert_shallow_link_with_list(self, shotgrid_provider):
        """Test _convert_shallow_link with a list of dicts."""
        data = [
            {"type": "Version", "id": 1, "name": "v001"},
            {"type": "Version", "id": 2, "name": "v002"},
        ]
        result = shotgrid_provider._convert_shallow_link(data)

        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0].id == 1
        assert result[1].id == 2

    def test_convert_shallow_link_with_none(self, shotgrid_provider):
        """Test _convert_shallow_link with None."""
        result = shotgrid_provider._convert_shallow_link(None)
        assert result is None

    def test_convert_shallow_link_filters_none_items(self, shotgrid_provider):
        """Test _convert_shallow_link filters None items from lists."""
        data = [
            {"type": "Version", "id": 1, "name": "v001"},
            None,
            {"type": "Version", "id": 2, "name": "v002"},
        ]
        result = shotgrid_provider._convert_shallow_link(data)

        assert len(result) == 2

    def test_create_shallow_entity_for_playlist(self, shotgrid_provider):
        """Test _create_shallow_entity creates Playlist with code instead of name."""
        data = {"type": "Playlist", "id": 50, "name": "Daily Review"}
        result = shotgrid_provider._create_shallow_entity(data)

        assert result.id == 50
        assert result.code == "Daily Review"

    def test_create_shallow_entity_for_non_playlist(self, shotgrid_provider):
        """Test _create_shallow_entity creates entity with name for non-playlists."""
        data = {"type": "Shot", "id": 100, "name": "shot_010"}
        result = shotgrid_provider._create_shallow_entity(data)

        assert result.id == 100
        assert result.name == "shot_010"
