import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from dna.models.entity import EntityBase


class ProdtrackProviderBase:
    def __init__(self):
        pass

    def _get_object_type(self, object_type: str) -> type["EntityBase"]:
        """Get the model class from the entity type string."""
        from dna.models.entity import ENTITY_MODELS, EntityBase

        return ENTITY_MODELS.get(object_type, EntityBase)

    def get_entity(self, entity_type: str, entity_id: int) -> "EntityBase":
        """Get an entity by its ID."""
        raise NotImplementedError("Subclasses must implement this method.")

    def add_entity(self, entity_type: str, entity: "EntityBase") -> "EntityBase":
        """Add an entity to the production tracking system."""
        raise NotImplementedError("Subclasses must implement this method.")


def get_prodtrack_provider() -> ProdtrackProviderBase:
    """Get the production tracking provider."""
    from dna.prodtrack_providers.shotgrid import ShotgridProvider

    provider_type = os.getenv("PRODTRACK_PROVIDER")
    if provider_type == "shotgrid":
        return ShotgridProvider()
    else:
        raise ValueError(f"Unknown production tracking provider: {provider_type}")
