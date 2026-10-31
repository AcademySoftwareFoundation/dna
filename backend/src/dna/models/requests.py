"""Request models for API endpoints."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

_REVIEWER = "sam.reviewer@studio.example"
_PROJECT_REF = {"type": "Project", "id": "124", "name": "dpel-samples"}


def _examples(*values: dict[str, Any]) -> ConfigDict:
    return ConfigDict(json_schema_extra={"examples": list(values)})


class EntityLink(BaseModel):
    """Reference to an existing entity for linking."""

    model_config = _examples({"type": "Version", "id": "6990"})

    type: str = Field(description="Entity type (e.g., 'Version', 'Playlist', 'Shot')")
    id: str = Field(description="Entity ID")


class CreateNoteRequest(BaseModel):
    """Request model for creating a new note."""

    model_config = _examples(
        {
            "subject": "mk020_0010_comp_v003 - comp notes",
            "content": "Soften the matte edge on 1042-1060 and recheck against the plate.",
            "project": {"type": "Project", "id": "124"},
            "note_links": [{"type": "Version", "id": "6990"}],
        }
    )

    subject: str = Field(description="Note subject line")
    content: Optional[str] = Field(default=None, description="Note body content")
    project: dict[str, Any] = Field(
        description="Project reference (e.g., {'type': 'Project', 'id': '85'})"
    )
    note_links: Optional[list[EntityLink]] = Field(
        default=None, description="Entities to link this note to"
    )
    additional_fields: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Provider field codes that are not on the Note model, "
            "for example {'sg_note_type': 'dailies'}."
        ),
    )


class FilterCondition(BaseModel):
    """A single filter condition for entity queries."""

    model_config = _examples(
        {"field": "name", "operator": "contains", "value": "mk020"}
    )

    field: str = Field(description="DNA field name to filter on")
    operator: str = Field(description="Filter operator (e.g., 'is', 'contains', 'in')")
    value: Any = Field(description="Value to filter by")


class FindRequest(BaseModel):
    """Request model for finding entities."""

    model_config = _examples(
        {
            "entity_type": "version",
            "filters": [
                {"field": "name", "operator": "contains", "value": "mk020"},
                {"field": "status", "operator": "is", "value": "rev"},
            ],
        }
    )

    entity_type: str = Field(
        description="DNA entity type to search (e.g., 'project', 'shot', 'version')"
    )
    filters: list[FilterCondition] = Field(
        default_factory=list, description="List of filter conditions"
    )
    additional_fields: Optional[list[str]] = Field(
        default=None,
        description=(
            "Provider field codes to include on each result under "
            "additional_fields. Omit to skip the extra read."
        ),
    )


class GenerateNoteRequest(BaseModel):
    """Request model for generating an AI note suggestion."""

    model_config = _examples(
        {
            "playlist_id": "45",
            "version_id": "6990",
            "user_email": _REVIEWER,
            "additional_instructions": "Two sentences max; name the owner of each fix.",
        }
    )

    playlist_id: str = Field(description="Playlist ID")
    version_id: str = Field(description="Version ID")
    user_email: str = Field(description="User email address")
    additional_instructions: Optional[str] = Field(
        default=None,
        description="Optional additional instructions to append to the prompt",
    )
    model: Optional[str] = Field(
        default=None,
        description="Optional LLM model override; omit to use server default",
    )


class GenerateNoteResponse(BaseModel):
    """Response model for AI note generation."""

    model_config = _examples(
        {
            "suggestion": (
                "Matte edge is crawling on 1042-1060 - Alex to soften the key and "
                "recheck against the plate. Otherwise good to move to lighting."
            ),
            "prompt": (
                "You are taking notes in a VFX dailies review...\n\n"
                "Transcript:\nSam Reviewer: Alex, can you take the edge on 1042?\n..."
            ),
            "context": (
                "Version: mk020_0010_comp_v003\nShot: mk020_0010\nTask: Comp\n"
                "Department: Compositing\nStatus: rev"
            ),
        }
    )

    suggestion: str = Field(description="The generated note suggestion")
    prompt: str = Field(description="The full prompt with values substituted")
    context: str = Field(description="The version context used for generation")


class SearchRequest(BaseModel):
    """Request model for unified entity search."""

    model_config = _examples(
        {
            "query": "mk020",
            "entity_types": ["shot", "version"],
            "project_id": "124",
            "limit": 5,
        }
    )

    query: str = Field(description="Text to search for (searches name field)")
    entity_types: list[str] = Field(
        description="Entity types to search: user, shot, asset, version, task, playlist"
    )
    project_id: Optional[str] = Field(
        default=None,
        description="Scope results to a specific project (recommended for non-user entities)",
    )
    limit: int = Field(
        default=10, description="Max results per entity type (default: 10)"
    )


class AddVersionToPlaylistRequest(BaseModel):
    """Request model for adding an existing version to a playlist."""

    model_config = _examples({"version_id": "6990"})

    version_id: str = Field(description="ID of an existing version to add")


class CreatePlaylistRequest(BaseModel):
    """Request model for creating a new playlist in a project."""

    model_config = _examples({"name": "Dailies 2026-10-14"})

    name: str = Field(description="Playlist name/code")


class SearchResult(BaseModel):
    """Lightweight entity representation for search results."""

    model_config = _examples(
        {
            "type": "Shot",
            "id": "1207",
            "name": "mk020_0010",
            "description": "Hero walks into the market",
            "project": _PROJECT_REF,
        }
    )

    type: str = Field(description="Entity type (e.g., 'User', 'Shot', 'Asset')")
    id: str = Field(description="Entity ID")
    name: str = Field(description="Entity name")
    description: Optional[str] = Field(
        default=None, description="Entity description (for shots/assets/versions)"
    )
    email: Optional[str] = Field(default=None, description="Email (for users)")
    project: Optional[dict[str, Any]] = Field(
        default=None, description="Project reference (for project-scoped entities)"
    )


class UpdateEntityRequest(BaseModel):
    """Request model for updating an entity's DNA fields and provider extras."""

    fields: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "DNA field names to update. Linked fields (tasks, notes, entity) "
            "are not accepted here."
        ),
    )
    additional_fields: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider field codes that are not on the DNA model.",
    )


class StatusOption(BaseModel):
    """A status option from ShotGrid schema."""

    model_config = _examples({"code": "rev", "name": "Pending Review"})

    code: str = Field(description="Status code (e.g., 'rev', 'apr', 'rej')")
    name: str = Field(description="Display name (e.g., 'Pending Review', 'Approved')")


class PublishNoteTarget(BaseModel):
    """A single draft note to publish (user + version key)."""

    model_config = _examples({"user_email": _REVIEWER, "version_id": "6990"})

    user_email: str
    version_id: str


class PublishNotesRequest(BaseModel):
    """Request model for publishing draft notes."""

    model_config = _examples(
        {
            "user_email": _REVIEWER,
            "targets": [
                {"user_email": _REVIEWER, "version_id": "6990"},
                {"user_email": _REVIEWER, "version_id": "6991"},
            ],
            "status_version_ids": ["6990"],
        }
    )

    user_email: str
    targets: list[PublishNoteTarget] = Field(
        description="Only draft notes matching these (user_email, version_id) pairs are published."
    )
    status_version_ids: Optional[list[str]] = Field(
        default=None,
        description=(
            "If provided, draft version_status changes are applied only for "
            "these version ids. Omit for legacy behavior (apply all)."
        ),
    )


class UpdateVersionStatusRequest(BaseModel):
    """Request model for updating a version's status."""

    model_config = _examples({"status": "apr", "playlist_id": "45"})

    status: str = Field(description="Status code to set on the version")
    playlist_id: Optional[str] = Field(
        default=None,
        description=(
            "If provided, pending version_status values on this playlist's "
            "draft notes for the version are cleared after the update, "
            "without touching note publish state."
        ),
    )


class UpdateVersionStatusResponse(BaseModel):
    """Response model for updating a version's status."""

    model_config = _examples({"success": True})

    success: bool


class PublishNotesResponse(BaseModel):
    """Response model for publishing draft notes."""

    model_config = _examples(
        {
            "published_count": 1,
            "republished_count": 1,
            "skipped_count": 0,
            "failed_count": 0,
            "total": 2,
        }
    )

    published_count: int
    republished_count: int
    skipped_count: int
    failed_count: int
    total: int


class PublishTranscriptRequest(BaseModel):
    """Request to publish a version's captured transcript."""

    model_config = _examples({"version_id": "6990"})

    version_id: str = Field(description="Version whose segments to publish")


class PublishTranscriptResponse(BaseModel):
    """Response from the publish-transcript endpoint."""

    model_config = _examples(
        {
            "transcript_entity_id": "312",
            "outcome": "created",
            "skipped_reason": None,
            "segments_count": 148,
        }
    )

    transcript_entity_id: str = Field(
        description="Entity ID of the row in the tracking system"
    )
    outcome: str = Field(description="created | updated | skipped")
    skipped_reason: Optional[str] = None
    segments_count: int


class SendSummaryEmailRequest(BaseModel):
    """Request model for sending a playlist summary email."""

    model_config = _examples(
        {
            "to_email": "reviewer@studio.example",
            "cc_email": "supervisor@studio.example",
            "playlist_url": "https://example.com/playlist/45",
        }
    )

    to_email: str = Field(description="Recipient email address")
    cc_email: Optional[str] = Field(default=None, description="Optional CC email address")
    playlist_url: str = Field(description="URL to the playlist")


class SendSummaryEmailResponse(BaseModel):
    """Response model for sending a playlist summary email."""

    model_config = _examples(
        {
            "success": True,
            "message_id": "msg_1234567890",
            "sent_at": "2026-10-31T12:00:00Z",
        }
    )

    success: bool
    message_id: str
    sent_at: datetime
