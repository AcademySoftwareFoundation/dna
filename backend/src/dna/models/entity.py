"""DNA Entity Models.

Pydantic models representing the standardized DNA entity schema, mapped from
provider-specific fields (e.g., ShotGrid) to a common format.
"""

from datetime import datetime
from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from dna.prodtrack_providers.prodtrack_provider_base import get_prodtrack_provider


class EntityBase(BaseModel):
    """Base model for all DNA entities."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )
    id: int = Field(description="Entity ID")

    @computed_field
    @property
    def type(self) -> str:
        """Return the entity type name."""
        return self.__class__.__name__

    def __repr__(self) -> str:
        name = getattr(self, "name", None) or getattr(self, "code", None)
        return f"<DNA-{self.__class__.__name__}-{name}>"

    def __to_dict__(self) -> dict[str, Any]:
        """Serialize to dictionary with type information for all nested entities."""
        result: dict[str, Any] = {"type": self.__class__.__name__}
        for field_name in self.model_fields:
            value = getattr(self, field_name)
            result[field_name] = self._serialize_value(value)
        return result

    def _serialize_value(self, value: Any) -> Any:
        """Recursively serialize a value, adding type info to entities."""
        if isinstance(value, EntityBase):
            return value.__to_dict__()
        elif isinstance(value, datetime):
            return value.isoformat()
        elif isinstance(value, list):
            return [self._serialize_value(item) for item in value]
        elif isinstance(value, dict):
            return {k: self._serialize_value(v) for k, v in value.items()}
        else:
            return value


class Task(EntityBase):
    """Task entity model.

    Represents a pipeline task assigned to an entity (Shot, Asset, etc.).
    """

    name: Optional[str] = Field(default=None, description="Task name/content")
    status: Optional[str] = Field(default=None, description="Task status")
    pipeline_step: Optional[dict[str, Any]] = Field(
        default=None, description="Pipeline step information"
    )
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project information"
    )
    entity: Optional["EntityBase"] = Field(
        default=None, description="Entity this task is assigned to"
    )


class Note(EntityBase):
    """Note entity model.

    Represents a note/comment attached to an entity.
    """

    subject: Optional[str] = Field(default=None, description="Note subject line")
    content: Optional[str] = Field(default=None, description="Note body content")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project this note belongs to"
    )
    note_links: list["EntityBase"] = Field(
        default_factory=list, description="Entities this note is linked to"
    )

    @field_validator("note_links", mode="before")
    @classmethod
    def note_links_none_to_list(cls, v):
        return v if v is not None else []


class Shot(EntityBase):
    """Shot entity model.

    Represents a shot in a sequence/project.
    """

    name: Optional[str] = Field(default=None, description="Shot name/code")
    description: Optional[str] = Field(default=None, description="Shot description")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project information"
    )
    tasks: list["Task"] = Field(default_factory=list, description="Associated tasks")

    @field_validator("tasks", mode="before")
    @classmethod
    def tasks_none_to_list(cls, v):
        return v if v is not None else []


class Asset(EntityBase):
    """Asset entity model.

    Represents an asset (character, prop, environment, etc.).
    """

    name: Optional[str] = Field(default=None, description="Asset name/code")
    description: Optional[str] = Field(default=None, description="Asset description")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project information"
    )
    tasks: list["Task"] = Field(default_factory=list, description="Associated tasks")

    @field_validator("tasks", mode="before")
    @classmethod
    def tasks_none_to_list(cls, v):
        return v if v is not None else []


class Version(EntityBase):
    """Version entity model.

    Represents a version/render of work on a Shot or Asset.
    """

    name: Optional[str] = Field(default=None, description="Version name/code")
    description: Optional[str] = Field(default=None, description="Version description")
    status: Optional[str] = Field(default=None, description="Version status")
    user: Optional[Any] = Field(
        default=None, description="User who created the version"
    )
    created_at: Optional[Union[datetime, str]] = Field(
        default=None, description="Creation timestamp"
    )
    updated_at: Optional[Union[datetime, str]] = Field(
        default=None, description="Last update timestamp"
    )
    movie_path: Optional[str] = Field(default=None, description="Path to movie file")
    frame_path: Optional[str] = Field(
        default=None, description="Path to frame sequence"
    )
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project information"
    )
    entity: Optional[Union["Shot", "Asset"]] = Field(
        default=None, description="Linked Shot or Asset entity"
    )
    task: Optional["Task"] = Field(default=None, description="Associated task")
    notes: list["Note"] = Field(default_factory=list, description="Associated notes")

    @field_validator("notes", mode="before")
    @classmethod
    def notes_none_to_list(cls, v):
        return v if v is not None else []

    def add_note(self, note: Note):
        """Add a note to the version."""
        prodtrack_provider = get_prodtrack_provider()
        return prodtrack_provider.add_entity("note", note)


class Playlist(EntityBase):
    """Playlist entity model.

    Represents a collection of versions for review.
    """

    code: Optional[str] = Field(default=None, description="Playlist code/name")
    description: Optional[str] = Field(default=None, description="Playlist description")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project information"
    )
    created_at: Optional[Union[datetime, str]] = Field(
        default=None, description="Creation timestamp"
    )
    updated_at: Optional[Union[datetime, str]] = Field(
        default=None, description="Last update timestamp"
    )
    versions: list["Version"] = Field(
        default_factory=list, description="Versions in this playlist"
    )

    @field_validator("versions", mode="before")
    @classmethod
    def versions_none_to_list(cls, v):
        return v if v is not None else []


# Type alias for any DNA entity
DNAEntity = Union[Shot, Asset, Note, Task, Version, Playlist]

# Entity type name to model class mapping
ENTITY_MODELS: dict[str, type[EntityBase]] = {
    "shot": Shot,
    "asset": Asset,
    "note": Note,
    "task": Task,
    "version": Version,
    "playlist": Playlist,
}
