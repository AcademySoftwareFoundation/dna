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
