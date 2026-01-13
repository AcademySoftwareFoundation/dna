"""Request models for API endpoints."""

from typing import Any, Optional

from pydantic import BaseModel, Field


class EntityLink(BaseModel):
    """Reference to an existing entity for linking."""

    type: str = Field(description="Entity type (e.g., 'Version', 'Playlist', 'Shot')")
    id: int = Field(description="Entity ID")


class CreateNoteRequest(BaseModel):
    """Request model for creating a new note."""

    subject: str = Field(description="Note subject line")
    content: Optional[str] = Field(default=None, description="Note body content")
    project: dict[str, Any] = Field(
        description="Project reference (e.g., {'type': 'Project', 'id': 85})"
    )
    note_links: Optional[list[EntityLink]] = Field(
        default=None, description="Entities to link this note to"
    )


class FilterCondition(BaseModel):
    """A single filter condition for entity queries."""

    field: str = Field(description="DNA field name to filter on")
    operator: str = Field(description="Filter operator (e.g., 'is', 'contains', 'in')")
    value: Any = Field(description="Value to filter by")


class FindRequest(BaseModel):
    """Request model for finding entities."""

    entity_type: str = Field(
        description="DNA entity type to search (e.g., 'project', 'shot', 'version')"
    )
    filters: list[FilterCondition] = Field(
        default_factory=list, description="List of filter conditions"
    )
