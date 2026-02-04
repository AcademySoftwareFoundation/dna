import os
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from dna.models.entity import EntityBase, Playlist, Project, User, Version


class ProdtrackProviderBase:
    def __init__(self):
        pass

    def _get_object_type(self, object_type: str) -> type["EntityBase"]:
        """Get the model class from the entity type string."""
        from dna.models.entity import ENTITY_MODELS, EntityBase

        return ENTITY_MODELS.get(object_type, EntityBase)

    def get_entity(
        self, entity_type: str, entity_id: int, resolve_links: bool = True
    ) -> "EntityBase":
        """Get an entity by its ID.

        Args:
            entity_type: The type of entity to fetch
            entity_id: The ID of the entity
            resolve_links: If True, recursively fetch linked entities.
                If False, only include shallow links with id/name.
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def add_entity(self, entity_type: str, entity: "EntityBase") -> "EntityBase":
        """Add an entity to the production tracking system."""
        raise NotImplementedError("Subclasses must implement this method.")

    def find(
        self, entity_type: str, filters: list[dict[str, Any]], limit: int = 0
    ) -> list["EntityBase"]:
        """Find entities matching the given filters.

        Args:
            entity_type: The DNA entity type to search for (e.g., 'shot', 'version')
            filters: List of filter conditions in DNA format
            limit: Maximum number of entities to return. Defaults to 0 (no limit).

        Returns:
            List of matching entities
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def search(
        self,
        query: str,
        entity_types: list[str],
        project_id: int | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search for entities across multiple entity types.

        Args:
            query: Text to search for (searches name field)
            entity_types: List of entity types to search (e.g., ['user', 'shot', 'asset'])
            project_id: Optional project ID to scope non-user entities
            limit: Maximum results per entity type

        Returns:
            List of lightweight entity representations with type, id, name, and
            type-specific fields (email for users, description for shots/assets/versions)
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def get_user_by_email(self, user_email: str) -> "User":
        """Get a user by their email address.

        Args:
            user_email: The email address of the user

        Returns:
            User entity with name, email, and login

        Raises:
            ValueError: If user is not found
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def get_projects_for_user(self, user_email: str) -> list["Project"]:
        """Get projects accessible by a user.

        Args:
            user_email: The email address of the user

        Returns:
            List of Project entities the user has access to
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def get_playlists_for_project(self, project_id: int) -> list["Playlist"]:
        """Get playlists for a project.

        Args:
            project_id: The ID of the project

        Returns:
            List of Playlist entities for the project
        """
        raise NotImplementedError("Subclasses must implement this method.")

    def get_versions_for_playlist(self, playlist_id: int) -> list["Version"]:
        """Get versions for a playlist.

        Args:
            playlist_id: The ID of the playlist

        Returns:
            List of Version entities in the playlist
        """
        raise NotImplementedError("Subclasses must implement this method.")


def get_prodtrack_provider() -> ProdtrackProviderBase:
    """Get the production tracking provider."""
    from dna.prodtrack_providers.shotgrid import ShotgridProvider

    provider_type = os.getenv("PRODTRACK_PROVIDER", "shotgrid")
    if provider_type == "shotgrid":
        return ShotgridProvider()
    raise ValueError(f"Unknown production tracking provider: {provider_type}")
