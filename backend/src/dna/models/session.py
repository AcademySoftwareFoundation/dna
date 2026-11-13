"""Session models.

DNA owns the Session document (in-review + transcription + playlist links).
Session providers supply an external catalog that DNA syncs into Sessions
via ``external_id``.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ExternalSession(BaseModel):
    """A session entry from an external session provider catalog."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": "mock-session-1",
                    "name": "Morning dailies",
                    "project_id": "124",
                    "created_at": "2026-10-14T15:02:41+00:00",
                    "updated_at": "2026-10-14T16:45:10+00:00",
                }
            ]
        }
    )

    id: str = Field(description="External session ID from the provider")
    name: str = Field(description="Display name")
    project_id: str = Field(description="Project this session belongs to")
    created_at: Optional[datetime] = Field(default=None, description="Creation time")
    updated_at: Optional[datetime] = Field(default=None, description="Last update time")


class Session(BaseModel):
    """DNA-owned review session (source of truth for in-review and transcription)."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c31be4b0a1b2c3d4e701",
                    "external_id": "mock-session-1",
                    "project_id": "124",
                    "name": "Morning dailies",
                    "playlist_ids": ["45", "46"],
                    "in_review_playlist_id": "45",
                    "in_review_version_id": "6990",
                    "in_review_pinned": False,
                    "meeting_id": "abc-defg-hij",
                    "platform": "google_meet",
                    "vexa_meeting_id": 1842,
                    "transcription_paused": False,
                    "transcription_resumed_at": None,
                }
            ]
        },
    )

    id: str = Field(alias="_id", description="Internal DNA session ID")
    external_id: Optional[str] = Field(
        default=None,
        description="External provider session ID. Null for implicit playlist sessions.",
    )
    project_id: str = Field(description="Project this session belongs to")
    name: Optional[str] = Field(default=None, description="Display name")
    playlist_ids: list[str] = Field(
        default_factory=list,
        description="Playlist IDs linked to this session, in link order",
    )
    in_review_playlist_id: Optional[str] = Field(
        default=None, description="Playlist that holds the in-review version"
    )
    in_review_version_id: Optional[str] = Field(
        default=None, description="Version ID currently in review"
    )
    in_review_pinned: bool = Field(
        default=False,
        description="Whether the in-review version is pinned",
    )
    meeting_id: Optional[str] = Field(default=None, description="Associated meeting ID")
    platform: Optional[str] = Field(default=None, description="Meeting platform")
    vexa_meeting_id: Optional[int] = Field(
        default=None, description="Internal Vexa meeting ID"
    )
    transcription_paused: bool = Field(
        default=False, description="Whether transcription storage is paused"
    )
    transcription_resumed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when transcription was last resumed. "
        "Segments with start time before this are discarded.",
    )
    created_at: Optional[datetime] = Field(default=None, description="Creation time")
    updated_at: Optional[datetime] = Field(default=None, description="Last update time")


class CreateSessionRequest(BaseModel):
    """Request body for creating a session."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"name": "Morning dailies"}]}
    )

    name: str = Field(description="Display name for the session")


class EnsureSessionForPlaylistRequest(BaseModel):
    """Find or create an implicit DNA session for a single playlist."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"project_id": "124", "playlist_id": "45"}]}
    )

    project_id: str = Field(description="Project ID")
    playlist_id: str = Field(description="Playlist ID to ensure a session for")


class SessionPlaylistsUpdate(BaseModel):
    """Replace the playlist links on a DNA session."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"playlist_ids": ["45", "46"]}]}
    )

    playlist_ids: list[str] = Field(
        description="Full replacement list of playlist IDs for the session"
    )


class SessionInReviewUpdate(BaseModel):
    """Set or clear the session in-review state."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "in_review_playlist_id": "45",
                    "in_review_version_id": "6990",
                    "in_review_pinned": False,
                }
            ]
        }
    )

    in_review_playlist_id: Optional[str] = Field(
        default=None, description="Playlist that holds the in-review version"
    )
    in_review_version_id: Optional[str] = Field(
        default=None, description="Version ID currently in review"
    )
    in_review_pinned: Optional[bool] = Field(
        default=None,
        description="Whether the in-review version is pinned. While pinned, "
        "moving or clearing in-review returns 409 unless the same request "
        "sets this to false.",
    )
    clear_in_review: bool = Field(
        default=False,
        description="If true, clears in_review_playlist_id and "
        "in_review_version_id and unpins.",
    )


class SessionTranscriptionUpdate(BaseModel):
    """Update transcription pause state on a session."""

    transcription_paused: Optional[bool] = Field(
        default=None, description="Whether transcription storage is paused"
    )
    clear_meeting: bool = Field(
        default=False,
        description="If true, clears meeting_id, platform, and vexa_meeting_id.",
    )
    clear_resumed_at: bool = Field(
        default=False,
        description="If true, clears transcription_resumed_at.",
    )
