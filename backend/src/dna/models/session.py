"""Session models.

Sessions are external review sessions consumed from a session provider.
DNA links playlists to sessions through PlaylistMetadata.session_ids.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class Session(BaseModel):
    """An external review session."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": "sess-1",
                    "name": "Morning dailies",
                    "project_id": "124",
                    "created_at": "2026-10-14T15:02:41+00:00",
                    "updated_at": "2026-10-14T16:45:10+00:00",
                }
            ]
        }
    )

    id: str = Field(description="Session ID as issued by the session provider")
    name: str = Field(description="Display name")
    project_id: str = Field(description="Project this session belongs to")
    created_at: Optional[datetime] = Field(default=None, description="Creation time")
    updated_at: Optional[datetime] = Field(default=None, description="Last update time")


class CreateSessionRequest(BaseModel):
    """Request body for creating a session."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"name": "Morning dailies"}]}
    )

    name: str = Field(description="Display name for the session")


class SessionPlaylists(BaseModel):
    """Playlists DNA has linked to a session."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"session_id": "sess-1", "playlist_ids": ["45", "46"]}]
        }
    )

    session_id: str = Field(description="Session ID")
    playlist_ids: list[str] = Field(
        default_factory=list,
        description="Playlist IDs linked to this session, in link order",
    )
