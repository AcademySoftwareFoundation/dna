"""ShotGrid production tracking provider implementation."""

import os
from typing import Any, Optional

from shotgun_api3 import Shotgun

from dna.models.entity import (
    ENTITY_MODELS,
    EntityBase,
    Playlist,
    Project,
    User,
    Version,
)
from dna.prodtrack_providers.prodtrack_provider_base import ProdtrackProviderBase

# Field Mappings map the DNA entity to the SG entity.
# Key: DNA entity Name
#   Entity_id: The SG entity Type.
#   Fields: A mapping between the SG field ID and the DNA field ID. These
#      Are used as fields in the find query. Source->Destination.
#   Linked_fields: Like the fields mapping key except these ref to entities. We
#       TODO: This may not be needed if we use a schema field read.
FIELD_MAPPING = {
    "project": {
        "entity_id": "Project",
        "fields": {
            "id": "id",
            "name": "name",
        },
        "linked_fields": {},
    },
    "shot": {
        "entity_id": "Shot",
        "fields": {
            "id": "id",
            "code": "name",
            "description": "description",
            "project": "project",
        },
        "linked_fields": {"tasks": "tasks"},
    },
    "asset": {
        "entity_id": "Asset",
        "fields": {
            "id": "id",
            "code": "name",
            "description": "description",
            "project": "project",
        },
        "linked_fields": {"tasks": "tasks"},
    },
    "note": {
        "entity_id": "Note",
        "fields": {
            "id": "id",
            "subject": "subject",
            "content": "content",
            "project": "project",
        },
        "linked_fields": {"note_links": "note_links"},
    },
    "task": {
        "entity_id": "Task",
        "fields": {
            "id": "id",
            "sg_status_list": "status",
            "step": "pipeline_step",
            "content": "name",
            "project": "project",
        },
        "linked_fields": {"entity": "entity"},
    },
    "version": {
        "entity_id": "Version",
        "fields": {
            "id": "id",
            "code": "name",
            "description": "description",
            "sg_status_list": "status",
            "user": "user",
            "created_at": "created_at",
            "updated_at": "updated_at",
            "sg_path_to_movie": "movie_path",
            "sg_path_to_frames": "frame_path",
            "project": "project",
            "image": "thumbnail",
        },
        "linked_fields": {"entity": "entity", "sg_task": "task", "notes": "notes"},
    },
    "playlist": {
        "entity_id": "Playlist",
        "fields": {
            "id": "id",
            "code": "code",
            "description": "description",
            "project": "project",
            "created_at": "created_at",
            "updated_at": "updated_at",
        },
        "linked_fields": {"versions": "versions"},
    },
    "user": {
        "entity_id": "HumanUser",
        "fields": {
            "id": "id",
            "name": "name",
            "email": "email",
            "login": "login",
        },
        "linked_fields": {},
    },
}


class ShotgridProvider(ProdtrackProviderBase):
    """ShotGrid provider for production tracking operations."""

    def __init__(
        self,
        url: Optional[str] = None,
        script_name: Optional[str] = None,
        api_key: Optional[str] = None,
        connect: bool = True,
    ):
        """Initialize the ShotGrid connection.

        Args:
            url: ShotGrid server URL. Defaults to SHOTGRID_URL env var.
            script_name: API script name. Defaults to SHOTGRID_SCRIPT_NAME env var.
            api_key: API key for authentication. Defaults to SHOTGRID_API_KEY env var.
        """
        super().__init__()

        self.url = url or os.getenv("SHOTGRID_URL")
        self.script_name = script_name or os.getenv("SHOTGRID_SCRIPT_NAME")
        self.api_key = api_key or os.getenv("SHOTGRID_API_KEY")

        if not all([self.url, self.script_name, self.api_key]):
            raise ValueError(
                "ShotGrid credentials not provided. Set SHOTGRID_URL, "
                "SHOTGRID_SCRIPT_NAME, and SHOTGRID_API_KEY environment variables."
            )

        self.sg = None
        if connect:
            self._connect()

    def _connect(self):
        """Connect to ShotGrid."""
        self.sg = Shotgun(self.url, self.script_name, self.api_key)

    def _convert_sg_entity_to_dna_entity(
        self,
        sg_entity: dict,
        entity_mapping: Optional[dict] = None,
        entity_type: Optional[str] = None,
        resolve_links: bool = True,
    ) -> EntityBase:
        if entity_mapping is None:
            entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"No field mapping found for entity type: {entity_type}")

        linked_fields_map = entity_mapping.get("linked_fields", {})

        # Build DNA field values dict from SG response
        entity_data: dict = {}
        for sg_name, dna_name in entity_mapping["fields"].items():
            entity_data[dna_name] = sg_entity.get(sg_name)

        # Populate linked fields
        for sg_field_name, dna_field_name in linked_fields_map.items():
            linked_data = sg_entity.get(sg_field_name)
            if resolve_links:
                entity_data[dna_field_name] = self._resolve_linked_field(linked_data)
            else:
                entity_data[dna_field_name] = self._convert_shallow_link(linked_data)

        # Instantiate the Pydantic model
        model_class = ENTITY_MODELS[entity_type]

        return model_class(**entity_data)

    def _convert_shallow_link(self, data):
        """Convert linked entity data to shallow DNA entity without recursive fetch.

        This includes basic info (id, name) from the SG response without
        making additional API calls to fetch the full entity.
        """
        if data is None:
            return None
        if isinstance(data, dict):
            return self._create_shallow_entity(data)
        elif isinstance(data, list):
            return [self._create_shallow_entity(item) for item in data if item]
        return None

    def _create_shallow_entity(self, sg_link: dict) -> EntityBase:
        """Create a shallow DNA entity from a ShotGrid link dict."""
        sg_type = sg_link.get("type")
        entity_id = sg_link.get("id")
        name = sg_link.get("name")

        dna_type = _get_dna_entity_type(sg_type)
        model_class = ENTITY_MODELS[dna_type]

        if dna_type == "playlist":
            return model_class(id=entity_id, code=name)
        return model_class(id=entity_id, name=name)

    def get_entity(
        self, entity_type: str, entity_id: int, resolve_links: bool = True
    ) -> EntityBase:
        """
        Get an entity by its ID.

        Using the field mapping, we get the entity from ShotGrid and then
        create the Pydantic entity object.

        Args:
            entity_type: The type of entity to fetch
            entity_id: The ID of the entity
            resolve_links: If True, recursively fetch linked entities.
                If False, only include shallow links with id/name.
        """
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        # Get the field mapping for this entity type
        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unknown entity type: {entity_type}")

        # Compose all field names from fields and linked fields
        fields = list(entity_mapping["fields"].keys())
        linked_fields_map = entity_mapping.get("linked_fields", {})
        linked_field_sg_names = list(linked_fields_map.keys())
        all_field_names = list(set(fields + linked_field_sg_names))

        # Query entity from ShotGrid
        sg_entity = self.sg.find_one(
            entity_mapping["entity_id"],
            filters=[["id", "is", entity_id]],
            fields=all_field_names,
        )

        if not sg_entity:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}")

        return self._convert_sg_entity_to_dna_entity(
            sg_entity, entity_mapping, entity_type, resolve_links=resolve_links
        )

    def _resolve_linked_field(self, data):
        """Resolve linked entity data by fetching the full entity."""
        if isinstance(data, dict):
            dna_type = _get_dna_entity_type(data["type"])
            return self.get_entity(dna_type, data["id"])
        elif isinstance(data, list):
            return [
                self.get_entity(_get_dna_entity_type(item["type"]), item["id"])
                for item in data
            ]
        return None

    def _convert_entities_to_sg_links(self, entities):
        """Convert DNA entities to ShotGrid link format for creation."""
        if isinstance(entities, EntityBase):
            return {"type": entities.__class__.__name__, "id": entities.id}
        elif isinstance(entities, list):
            return [
                {"type": e.__class__.__name__, "id": e.id}
                for e in entities
                if isinstance(e, EntityBase)
            ]
        return None

    def add_entity(self, entity_type: str, entity: EntityBase) -> EntityBase:
        """Add an entity to the production tracking system."""

        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unknown entity type: {entity_type}")

        # Map the entity fields to SG fields, skipping 'id' which is auto-generated
        sg_entity_data = {}
        for sg_field_name, dna_field_name in entity_mapping["fields"].items():
            if sg_field_name == "id":
                continue
            value = entity.model_dump().get(dna_field_name)
            if value is not None:
                sg_entity_data[sg_field_name] = value

        # Convert linked entities to SG format for creation
        linked_fields_to_preserve = {}
        for sg_field_name, dna_field_name in entity_mapping.get(
            "linked_fields", {}
        ).items():
            linked_entities = getattr(entity, dna_field_name, None)
            if linked_entities is None:
                continue

            linked_fields_to_preserve[dna_field_name] = linked_entities
            sg_linked = self._convert_entities_to_sg_links(linked_entities)
            if sg_linked:
                sg_entity_data[sg_field_name] = sg_linked

        # Create the entity in ShotGrid
        result = self.sg.create(entity_mapping["entity_id"], sg_entity_data)

        # Convert result and preserve linked entities from input
        created_entity = self._convert_sg_entity_to_dna_entity(
            result, entity_mapping, entity_type, resolve_links=False
        )

        # Restore linked fields from the input entity since SG doesn't return them
        for dna_field_name, linked_entities in linked_fields_to_preserve.items():
            setattr(created_entity, dna_field_name, linked_entities)

        return created_entity

    def find(self, entity_type: str, filters: list[dict[str, Any]]) -> list[EntityBase]:
        """Find entities matching the given filters.

        Args:
            entity_type: The DNA entity type to search for
            filters: List of filter conditions in DNA format.
                Each filter is a dict with 'field', 'operator', and 'value' keys.

        Returns:
            List of matching DNA entities
        """
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unsupported entity type: {entity_type}")

        # Build reverse mapping from DNA field names to SG field names
        dna_to_sg_fields = {v: k for k, v in entity_mapping["fields"].items()}

        # Convert DNA filters to SG filters
        sg_filters = []
        for f in filters:
            dna_field = f.get("field")
            operator = f.get("operator")
            value = f.get("value")

            sg_field = dna_to_sg_fields.get(dna_field)
            if sg_field is None:
                raise ValueError(
                    f"Unknown field '{dna_field}' for entity type '{entity_type}'"
                )

            sg_filters.append([sg_field, operator, value])

        # Get all DNA fields to request from SG
        sg_fields = list(entity_mapping["fields"].keys())
        linked_fields_map = entity_mapping.get("linked_fields", {})
        sg_fields.extend(linked_fields_map.keys())

        # Query ShotGrid
        sg_results = self.sg.find(
            entity_mapping["entity_id"],
            filters=sg_filters,
            fields=sg_fields,
        )

        # Convert SG entities to DNA entities
        return [
            self._convert_sg_entity_to_dna_entity(
                sg_entity, entity_mapping, entity_type
            )
            for sg_entity in sg_results
        ]

    def get_user_by_email(self, user_email: str) -> User:
        """Get a user by their email address.

        Args:
            user_email: The email address of the user

        Returns:
            User entity with name, email, and login

        Raises:
            ValueError: If user is not found
        """
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        sg_user = self.sg.find_one(
            "HumanUser",
            filters=[["email", "is", user_email]],
            fields=["id", "name", "email", "login"],
        )

        if not sg_user:
            raise ValueError(f"User not found: {user_email}")

        entity_mapping = FIELD_MAPPING["user"]
        return self._convert_sg_entity_to_dna_entity(
            sg_user, entity_mapping, "user", resolve_links=False
        )

    def get_projects_for_user(self, user_email: str) -> list[Project]:
        """Get projects accessible by a user.

        Args:
            user_email: The email address of the user

        Returns:
            List of Project entities the user has access to
        """
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        # First, find the user by their email
        user = self.sg.find_one(
            "HumanUser",
            filters=[["email", "is", user_email]],
            fields=["id", "email", "name"],
        )

        if not user:
            raise ValueError(f"User not found: {user_email}")

        # Find projects where this user is in the users list
        sg_projects = self.sg.find(
            "Project",
            filters=[["users", "is", user]],
            fields=["id", "name"],
        )

        entity_mapping = FIELD_MAPPING["project"]
        return [
            self._convert_sg_entity_to_dna_entity(
                sg_project, entity_mapping, "project", resolve_links=False
            )
            for sg_project in sg_projects
        ]

    def get_playlists_for_project(self, project_id: int) -> list[Playlist]:
        """Get playlists for a project.

        Args:
            project_id: The ID of the project

        Returns:
            List of Playlist entities for the project
        """
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        sg_playlists = self.sg.find(
            "Playlist",
            filters=[
                ["project", "is", {"type": "Project", "id": project_id}],
            ],
            fields=["id", "code", "description", "project", "created_at", "updated_at"],
        )

        entity_mapping = FIELD_MAPPING["playlist"]
        return [
            self._convert_sg_entity_to_dna_entity(
                sg_playlist, entity_mapping, "playlist", resolve_links=False
            )
            for sg_playlist in sg_playlists
        ]

    def get_versions_for_playlist(self, playlist_id: int) -> list[Version]:
        """Get versions for a playlist.

        Args:
            playlist_id: The ID of the playlist

        Returns:
            List of Version entities in the playlist
        """
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        sg_playlist = self.sg.find_one(
            "Playlist",
            filters=[["id", "is", playlist_id]],
            fields=["versions"],
        )

        if not sg_playlist or not sg_playlist.get("versions"):
            return []

        version_ids = [v["id"] for v in sg_playlist["versions"]]

        entity_mapping = FIELD_MAPPING["version"]
        version_fields = list(entity_mapping["fields"].keys()) + list(
            entity_mapping["linked_fields"].keys()
        )
        sg_versions = self.sg.find(
            "Version",
            filters=[["id", "in", version_ids]],
            fields=version_fields,
        )

        # Collect unique task IDs from versions
        task_ids = list(
            {
                v["sg_task"]["id"]
                for v in sg_versions
                if v.get("sg_task") and v["sg_task"].get("id")
            }
        )

        # Batch-fetch tasks with their step (pipeline_step) field
        tasks_by_id: dict[int, dict] = {}
        if task_ids:
            task_mapping = FIELD_MAPPING["task"]
            task_fields = list(task_mapping["fields"].keys())
            sg_tasks = self.sg.find(
                "Task",
                filters=[["id", "in", task_ids]],
                fields=task_fields,
            )
            for sg_task in sg_tasks:
                tasks_by_id[sg_task["id"]] = sg_task

        # Convert versions and enrich with full task data
        versions = []
        for sg_version in sg_versions:
            version = self._convert_sg_entity_to_dna_entity(
                sg_version, entity_mapping, "version", resolve_links=False
            )
            # Replace shallow task with enriched task data
            if sg_version.get("sg_task") and sg_version["sg_task"].get("id"):
                task_id = sg_version["sg_task"]["id"]
                if task_id in tasks_by_id:
                    sg_task = tasks_by_id[task_id]
                    task_mapping = FIELD_MAPPING["task"]
                    version.task = self._convert_sg_entity_to_dna_entity(
                        sg_task, task_mapping, "task", resolve_links=False
                    )
            versions.append(version)

        return versions


def _get_dna_entity_type(sg_entity_type: str) -> str:
    """Get the DNA entity type from the ShotGrid entity type."""
    for entity_type, entity_data in FIELD_MAPPING.items():
        if entity_data["entity_id"] == sg_entity_type:
            return entity_type
    raise ValueError(f"Unknown entity type: {sg_entity_type}")
