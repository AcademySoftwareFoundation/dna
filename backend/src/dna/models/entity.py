"""DNA Entity Models.

Pydantic models representing the standardized DNA entity schema, mapped from
provider-specific fields (e.g., ShotGrid) to a common format.
"""

from datetime import datetime
from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from dna.prodtrack_providers.prodtrack_provider_base import get_prodtrack_provider

# One consistent fictional production for the OpenAPI examples.
_PROJECT_REF = {"type": "Project", "id": "124", "name": "dpel-samples"}
_SHOT_REF = {"type": "Shot", "id": "1207", "name": "mk020_0010"}
_TASK_REF = {"type": "Task", "id": "5860", "name": "Comp"}
_VERSION_REF = {"type": "Version", "id": "6990", "name": "mk020_0010_comp_v003"}
_USER_EXAMPLE = {
    "type": "User",
    "id": "88",
    "name": "Sam Reviewer",
    "email": "sam.reviewer@studio.example",
    "login": "sreviewer",
}


def _examples(*values: dict[str, Any]) -> ConfigDict:
    return ConfigDict(json_schema_extra={"examples": list(values)})


class EntityBase(BaseModel):
    """Base model for all DNA entities."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )
    id: str = Field(description="Entity ID")
    additional_fields: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Provider fields that are not part of the DNA model, keyed by "
            "the provider field code (for example 'sg_cut_in')."
        ),
    )

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


class Project(EntityBase):
    """Project entity model.

    Represents a project in the production tracking system.
    """

    model_config = _examples(_PROJECT_REF)

    name: Optional[str] = Field(default=None, description="Project name")


class Task(EntityBase):
    """Task entity model.

    Represents a pipeline task assigned to an entity (Shot, Asset, etc.).
    """

    model_config = _examples(
        {
            **_TASK_REF,
            "status": "ip",
            "pipeline_step": {"type": "Step", "id": "8", "name": "Compositing"},
            "project": _PROJECT_REF,
            "entity": _SHOT_REF,
        }
    )

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

    model_config = _examples(
        {
            "type": "Note",
            "id": "6447",
            "subject": "mk020_0010_comp_v003 - comp notes",
            "content": "Soften the matte edge on 1042-1060 and recheck against the plate.",
            "project": _PROJECT_REF,
            "note_links": [_VERSION_REF, _SHOT_REF],
            "author": _USER_EXAMPLE,
        }
    )

    subject: Optional[str] = Field(default=None, description="Note subject line")
    content: Optional[str] = Field(default=None, description="Note body content")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project this note belongs to"
    )
    note_links: list["EntityBase"] = Field(
        default_factory=list, description="Entities this note is linked to"
    )
    author: Optional["User"] = Field(default=None, description="Note author")

    @field_validator("note_links", mode="before")
    @classmethod
    def note_links_none_to_list(cls, v):
        return v if v is not None else []


class Shot(EntityBase):
    """Shot entity model.

    Represents a shot in a sequence/project.
    """

    model_config = _examples(
        {
            **_SHOT_REF,
            "description": "Hero walks into the market",
            "project": _PROJECT_REF,
            "tasks": [{**_TASK_REF, "status": "ip"}],
        }
    )

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

    model_config = _examples(
        {
            "type": "Asset",
            "id": "402",
            "name": "market_stall",
            "description": "Dressed fruit stall, hero variant",
            "project": _PROJECT_REF,
            "tasks": [{"type": "Task", "id": "5102", "name": "Model", "status": "fin"}],
        }
    )

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

    model_config = _examples(
        {
            **_VERSION_REF,
            "description": "Softened matte edge, new key on the market plate",
            "status": "rev",
            "user": {"type": "User", "id": "17", "name": "Alex Artist"},
            "created_at": "2026-10-14T16:40:12+00:00",
            "updated_at": "2026-10-14T16:41:03+00:00",
            "movie_path": "/proj/dpel/shots/mk020/mk020_0010/comp/v003/mk020_0010_comp_v003.mov",
            "frame_path": "/proj/dpel/shots/mk020/mk020_0010/comp/v003/mk020_0010_comp_v003.%04d.exr",
            "thumbnail": "https://sg-media.example/thumbnails/6990.jpg",
            "project": _PROJECT_REF,
            "entity": _SHOT_REF,
            "task": _TASK_REF,
            "notes": [],
            "prodtrack_detail_url": "https://studio.shotgrid.autodesk.com/detail/Version/6990",
            "prodtrack_entity_detail_url": "https://studio.shotgrid.autodesk.com/detail/Shot/1207",
        }
    )

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
    thumbnail: Optional[str] = Field(
        default=None, description="URL to thumbnail image (signed URL from ShotGrid)"
    )
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project information"
    )
    entity: Optional[Union["Shot", "Asset"]] = Field(
        default=None, description="Linked Shot or Asset entity"
    )
    task: Optional["Task"] = Field(default=None, description="Associated task")
    notes: list["Note"] = Field(default_factory=list, description="Associated notes")
    prodtrack_detail_url: Optional[str] = Field(
        default=None,
        description="Web UI URL for this version in the production tracking system",
    )
    prodtrack_entity_detail_url: Optional[str] = Field(
        default=None,
        description="Web UI URL for the linked shot/asset in the production tracking system",
    )

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

    model_config = _examples(
        {
            "type": "Playlist",
            "id": "45",
            "code": "Dailies 2026-10-14",
            "description": "Comp dailies",
            "project": _PROJECT_REF,
            "created_at": "2026-10-14T15:02:41+00:00",
            "updated_at": "2026-10-14T16:45:10+00:00",
            "versions": [{**_VERSION_REF, "status": "rev", "entity": _SHOT_REF}],
        }
    )

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


class User(EntityBase):
    """User entity model.

    Represents a human user in the production tracking system.
    """

    model_config = _examples(_USER_EXAMPLE)

    name: Optional[str] = Field(default=None, description="User's full name")
    email: Optional[str] = Field(default=None, description="User's email address")
    login: Optional[str] = Field(default=None, description="User's login/username")


# Type alias for any DNA entity
DNAEntity = Union[Project, Shot, Asset, Note, Task, Version, Playlist, User]

# Entity type name to model class mapping
ENTITY_MODELS: dict[str, type[EntityBase]] = {
    "project": Project,
    "shot": Shot,
    "asset": Asset,
    "note": Note,
    "task": Task,
    "version": Version,
    "playlist": Playlist,
    "user": User,
}

# Rebuild models to resolve forward references
Note.model_rebuild()
Shot.model_rebuild()
Asset.model_rebuild()
Version.model_rebuild()
Playlist.model_rebuild()
Task.model_rebuild()
