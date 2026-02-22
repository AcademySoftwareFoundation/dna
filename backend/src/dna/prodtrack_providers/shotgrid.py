"""ShotGrid production tracking provider implementation."""

import contextlib
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
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    UserNotFoundError,
)

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
        sudo_user: Optional[str] = None,
        connect: bool = True,
    ):
        """Initialize the ShotGrid connection.

        Args:
            url: ShotGrid server URL. Defaults to SHOTGRID_URL env var.
            script_name: API script name. Defaults to SHOTGRID_SCRIPT_NAME env var.
            api_key: API key for authentication. Defaults to SHOTGRID_API_KEY env var.
            sudo_user: Optional user login to perform actions as.
            connect: Whether to connect immediately.
        """
        super().__init__()

        self.url = url or os.getenv("SHOTGRID_URL")
        self.script_name = script_name or os.getenv("SHOTGRID_SCRIPT_NAME")
        self.api_key = api_key or os.getenv("SHOTGRID_API_KEY")
        self.sudo_user = sudo_user or os.getenv("SHOTGRID_SUDO_USER")

        if not all([self.url, self.script_name, self.api_key]):
            raise ValueError(
                "ShotGrid credentials not provided. Set SHOTGRID_URL, "
                "SHOTGRID_SCRIPT_NAME, and SHOTGRID_API_KEY environment variables."
            )

        self.sg = None
        self._sudo_connection = None
        if connect:
            self.connect()

    def connect(self, sudo_user: Optional[str] = None):
        """Connect to ShotGrid.

        Args:
            sudo_user: Optional user login to perform actions as.
                If provided, overrides the instance's sudo_user.
        """
        # Close existing connection if any (though Shotgun API doesn't really require explicit close)
        self.sg = Shotgun(
            self.url,
            self.script_name,
            self.api_key,
            sudo_as_login=sudo_user or self.sudo_user,
        )

    def set_sudo_user(self, sudo_user: str):
        """Set the sudo user and re-initialize the connection.

        Args:
            sudo_user: The user login to perform actions as.
        """
        self.sudo_user = sudo_user
        self.connect()

    @contextlib.contextmanager
    def sudo(self, user_login: str):
        """Context manager to perform actions as a specific user.

        This creates a temporary connection for the duration of the context.

        Args:
            user_login: The user login to perform actions as.
        """
        original_connection = self._sudo_connection
        try:
            # Create a temporary connection for this user
            self._sudo_connection = Shotgun(
                self.url,
                self.script_name,
                self.api_key,
                sudo_as_login=user_login,
            )
            yield
        finally:
            self._sudo_connection = original_connection

    @property
    def _sg(self):
        """Get the active ShotGrid connection (sudo or main)."""
        return self._sudo_connection or self.sg

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
        if not self._sg:
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
        sg_entity = self._sg.find_one(
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
        result = self._sg.create(entity_mapping["entity_id"], sg_entity_data)

        # Convert result and preserve linked entities from input
        created_entity = self._convert_sg_entity_to_dna_entity(
            result, entity_mapping, entity_type, resolve_links=False
        )

        # Restore linked fields from the input entity since SG doesn't return them
        for dna_field_name, linked_entities in linked_fields_to_preserve.items():
            setattr(created_entity, dna_field_name, linked_entities)

        return created_entity

    def find(
        self, entity_type: str, filters: list[dict[str, Any]], limit: int = 0
    ) -> list[EntityBase]:
        """Find entities matching the given filters.

        Args:
            entity_type: The DNA entity type to search for
            filters: List of filter conditions in DNA format.
                Each filter is a dict with 'field', 'operator', and 'value' keys.
            limit: Maximum number of entities to return. Defaults to 0 (no limit).

        Returns:
            List of matching DNA entities
        """
        if not self._sg:
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
        sg_results = self._sg.find(
            entity_mapping["entity_id"],
            filters=sg_filters,
            fields=sg_fields,
            limit=limit,
        )

        # Convert SG entities to DNA entities
        return [
            self._convert_sg_entity_to_dna_entity(
                sg_entity, entity_mapping, entity_type
            )
            for sg_entity in sg_results
        ]

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
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")

        results = []

        for entity_type in entity_types:
            # Validate entity type
            entity_mapping = FIELD_MAPPING.get(entity_type)
            if entity_mapping is None:
                raise ValueError(f"Unsupported entity type: {entity_type}")

            sg_entity_type = entity_mapping["entity_id"]

            # Determine the name field for this entity type (code or name)
            # and build minimal fields list for performance
            fields_mapping = entity_mapping["fields"]
            name_sg_field = None
            for sg_field, dna_field in fields_mapping.items():
                if dna_field == "name":
                    name_sg_field = sg_field
                    break

            if name_sg_field is None:
                continue

            # Build minimal fields list: only what we need for search results
            sg_fields = ["id", name_sg_field]
            if entity_type == "user":
                sg_fields.append("email")
            else:
                if "description" in fields_mapping:
                    sg_fields.append("description")
                if "project" in fields_mapping:
                    sg_fields.append("project")

            # Build ShotGrid filters
            sg_filters = [[name_sg_field, "contains", query]]

            # Add project filter for non-user entities
            if entity_type != "user" and project_id is not None:
                sg_filters.append(
                    ["project", "is", {"type": "Project", "id": project_id}]
                )

            # Query ShotGrid directly with minimal fields for performance
            sg_results = self.sg.find(
                sg_entity_type,
                filters=sg_filters,
                fields=sg_fields,
                limit=limit,
            )

            # Convert to lightweight search results directly from SG response
            # Use DNA model class name for proper type mapping
            model_class = ENTITY_MODELS.get(entity_type)
            dna_type = model_class.__name__ if model_class else entity_type.capitalize()
            for sg_entity in sg_results:
                result = {
                    "type": dna_type,
                    "id": sg_entity.get("id"),
                    "name": sg_entity.get(name_sg_field),
                }

                # Add type-specific fields
                if entity_type == "user":
                    result["email"] = sg_entity.get("email")
                else:
                    # Add description if present
                    if "description" in sg_entity:
                        result["description"] = sg_entity.get("description")

                    # Add project reference if present
                    project_data = sg_entity.get("project")
                    if project_data:
                        result["project"] = {
                            "type": project_data.get("type"),
                            "id": project_data.get("id"),
                        }

                results.append(result)

        return results

    def get_user_by_email(self, user_email: str) -> User:
        """Get a user by their email address.

        Args:
            user_email: The email address of the user

        Returns:
            User entity with name, email, and login

        Raises:
            ValueError: If user is not found
        """
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        sg_user = self._sg.find_one(
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
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        # First, find the user by their email
        user = self._sg.find_one(
            "HumanUser",
            filters=[["email", "is", user_email]],
            fields=["id", "email", "name"],
        )

        if not user:
            raise ValueError(f"User not found: {user_email}")

        # Find projects where this user is in the users list
        sg_projects = self._sg.find(
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
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        sg_playlists = self._sg.find(
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
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        sg_playlist = self._sg.find_one(
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
        sg_versions = self._sg.find(
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
            sg_tasks = self._sg.find(
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

    def publish_note(
        self,
        version_id: int,
        content: str,
        subject: str,
        to_users: list[int],
        cc_users: list[int],
        links: list[EntityBase],
        author_email: Optional[str] = None,
    ) -> int:
        """Publish a note to ShotGrid.

        Args:
            version_id: The ID of the version to link to.
            content: Note content.
            subject: Note subject.
            to_users: List of user IDs to address.
            cc_users: List of user IDs to CC.
            links: List of additional entities to link.
            author_email: Optional email of the author.

        Returns:
            The ID of the created (or existing) note.
        """
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        # 1. Fetch version to get Project and ensure version exists
        version_data = self._sg.find_one(
            "Version",
            filters=[["id", "is", version_id]],
            fields=["project"],
        )
        if not version_data:
            raise ValueError(f"Version {version_id} not found")

        project = version_data.get("project")
        if not project:
            raise ValueError(f"Version {version_id} has no project assigned")

        # 2. Check for duplicates
        # We consider a note a duplicate if it links to this version and has same subject/content
        # Note: We don't check author because duplicate content from different author is still weird multiple post?
        # Actually usually duplicate check includes author? Let's stick to subject+content+version link for now as per reference
        duplicate_filters = [
            ["project", "is", project],
            ["note_links", "is", {"type": "Version", "id": version_id}],
            ["subject", "is", subject],
            ["content", "is", content],
        ]

        # Use find_one for efficiency, we just need to know if ANY exists
        existing_note = self._sg.find_one(
            "Note", filters=duplicate_filters, fields=["id"]
        )
        if existing_note:
            return existing_note["id"]

        # 3. Prepare Note Data
        note_links = [{"type": "Version", "id": version_id}]
        if links:
            extra_links = self._convert_entities_to_sg_links(links)
            if extra_links:
                if isinstance(extra_links, dict):
                    note_links.append(extra_links)
                elif isinstance(extra_links, list):
                    note_links.extend(extra_links)

        recipient_links = [{"type": "HumanUser", "id": uid} for uid in to_users]
        cc_links = [{"type": "HumanUser", "id": uid} for uid in cc_users]

        note_data = {
            "project": project,
            "subject": subject,
            "content": content,
            "note_links": note_links,
            "addressings_to": recipient_links,
            "addressings_cc": cc_links,
        }

        # 4. Handle Author / Sudo
        author_login = None
        if author_email:
            try:
                author_user = self.get_user_by_email(author_email)
                if author_user and author_user.login:
                    author_login = author_user.login
            except ValueError as e:
                # Wrap the ValueError in a specific UserNotFoundError
                raise UserNotFoundError(
                    f"Author not found in ShotGrid: {author_email}"
                ) from e

        if author_login:
            with self.sudo(author_login):
                result = self._sg.create("Note", note_data)
        else:
            result = self._sg.create("Note", note_data)

        return result["id"]


def _get_dna_entity_type(sg_entity_type: str) -> str:
    """Get the DNA entity type from the ShotGrid entity type."""
    for entity_type, entity_data in FIELD_MAPPING.items():
        if entity_data["entity_id"] == sg_entity_type:
            return entity_type
    raise ValueError(f"Unknown entity type: {sg_entity_type}")
