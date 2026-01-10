"""ShotGrid production tracking provider implementation."""

import os
from typing import Optional

from shotgun_api3 import Shotgun

from dna.models.entity import ENTITY_MODELS, EntityBase
from dna.prodtrack_providers.prodtrack_provider_base import ProdtrackProviderBase

# Field Mappings map the DNA entity to the SG entity.
# Key: DNA entity Name
#   Entity_id: The SG entity Type.
#   Fields: A mapping between the SG field ID and the DNA field ID. These
#      Are used as fields in the find query. Source->Destination.
#   Linked_fields: Like the fields mapping key except these ref to entities. We
#       TODO: This may not be needed if we use a schema field read.
FIELD_MAPPING = {
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

        # Populate linked fields by recursively fetching linked entities
        if resolve_links:
            for sg_field_name, dna_field_name in linked_fields_map.items():
                linked_data = sg_entity.get(sg_field_name)
                entity_data[dna_field_name] = self._resolve_linked_field(linked_data)

        # Instantiate the Pydantic model
        model_class = ENTITY_MODELS[entity_type]

        return model_class(**entity_data)

    def get_entity(self, entity_type: str, entity_id: int) -> EntityBase:
        """
        Get an entity by its ID.

        Using the field mapping, we get the entity from ShotGrid and then
        create the Pydantic entity object.
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
            sg_entity, entity_mapping, entity_type
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


def _get_dna_entity_type(sg_entity_type: str) -> str:
    """Get the DNA entity type from the ShotGrid entity type."""
    for entity_type, entity_data in FIELD_MAPPING.items():
        if entity_data["entity_id"] == sg_entity_type:
            return entity_type
    raise ValueError(f"Unknown entity type: {sg_entity_type}")
