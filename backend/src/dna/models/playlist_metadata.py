"""Playlist Metadata Models.

Pydantic models for playlist metadata stored in the storage provider.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PlaylistMetadataUpdate(BaseModel):
    """Model for updating playlist metadata."""

    in_review: Optional[int] = Field(
        default=None, description="Version ID currently in review"
    )
    in_review_pinned: Optional[bool] = Field(
        default=None,
        description="If True, in_review is held to the pinned version and RV sync "
        "will not move it. Setting False resumes syncing from RV.",
    )
    meeting_id: Optional[str] = Field(default=None, description="Associated meeting ID")
    platform: Optional[str] = Field(default=None, description="Meeting platform")
    vexa_meeting_id: Optional[int] = Field(
        default=None, description="Internal Vexa meeting ID"
    )
    transcription_paused: Optional[bool] = Field(
        default=None, description="Whether transcription storage is paused"
    )
    has_scratch: Optional[bool] = Field(
        default=None,
        description="Whether the playlist has a scratch tile — a placeholder "
        "for a note on the playlist entity rather than on a version.",
    )
    clear_resumed_at: bool = Field(
        default=False,
        description="If True, clears transcription_resumed_at. "
        "Used when starting a new transcription session.",
    )


class PlaylistMetadata(BaseModel):
    """Full playlist metadata model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    playlist_id: int
    in_review: Optional[int] = None
    in_review_pinned: bool = False
    meeting_id: Optional[str] = None
    platform: Optional[str] = None
    vexa_meeting_id: Optional[int] = None
    transcription_paused: bool = False
    has_scratch: bool = False
    transcription_resumed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when transcription was last resumed. "
        "Segments with start time before this are discarded.",
    )
