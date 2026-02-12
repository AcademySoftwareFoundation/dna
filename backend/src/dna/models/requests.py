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


class GenerateNoteRequest(BaseModel):
    """Request model for generating an AI note suggestion."""

    playlist_id: int = Field(description="Playlist ID")
    version_id: int = Field(description="Version ID")
    user_email: str = Field(description="User email address")
    additional_instructions: Optional[str] = Field(
        default=None,
        description="Optional additional instructions to append to the prompt",
    )


class GenerateNoteResponse(BaseModel):
    """Response model for AI note generation."""

    suggestion: str = Field(description="The generated note suggestion")
    prompt: str = Field(description="The full prompt with values substituted")
    context: str = Field(description="The version context used for generation")


class SearchRequest(BaseModel):
    """Request model for unified entity search."""

    query: str = Field(description="Text to search for (searches name field)")
    entity_types: list[str] = Field(
        description="Entity types to search: user, shot, asset, version, task, playlist"
    )
    project_id: Optional[int] = Field(
        default=None,
        description="Scope results to a specific project (recommended for non-user entities)",
    )
    limit: int = Field(
        default=10, description="Max results per entity type (default: 10)"
    )


class SearchResult(BaseModel):
    """Lightweight entity representation for search results."""

    type: str = Field(description="Entity type (e.g., 'User', 'Shot', 'Asset')")
    id: int = Field(description="Entity ID")
    name: str = Field(description="Entity name")
    description: Optional[str] = Field(
        default=None, description="Entity description (for shots/assets/versions)"
    )
    email: Optional[str] = Field(default=None, description="Email (for users)")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project reference (for project-scoped entities)"
    )


class PublishNotesRequest(BaseModel):
    """Request model for publishing draft notes."""

    user_email: str
    include_others: bool = False


class PublishNotesResponse(BaseModel):
    """Response model for publishing draft notes."""

    published_count: int
    skipped_count: int
    failed_count: int
    total: int
