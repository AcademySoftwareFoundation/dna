"""Stored Segment Models.

Pydantic models for transcription segments stored in MongoDB.

Backend operates as a passthrough for Vexa's transcript stream:
- `segment_id` is Vexa's stable id (e.g. "9b914779:speaker-1:72"), not a hash.
- Upsert key in MongoDB is `{segment_id, playlist_id, version_id}`.
- All Vexa fields (start_time, end_time, completed, language, ...) are preserved.
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class StoredSegmentCreate(BaseModel):
    """Model for creating/upserting a stored segment (raw Vexa passthrough)."""

    segment_id: str = Field(
        ..., description="Vexa's stable segment id (e.g. '9b914779:speaker-1:72')"
    )
    text: str = Field(..., description="Transcript text content")
    speaker: Optional[str] = Field(default=None, description="Speaker identifier")
    language: Optional[str] = Field(default=None, description="Language code")
    start_time: Optional[float] = Field(
        default=None, description="Relative start time in seconds"
    )
    end_time: Optional[float] = Field(
        default=None, description="Relative end time in seconds"
    )
    completed: Optional[bool] = Field(
        default=True, description="Whether the segment is confirmed (vs draft)"
    )
    absolute_start_time: str = Field(
        ..., description="UTC timestamp (ISO 8601) of segment start"
    )
    absolute_end_time: str = Field(
        ..., description="UTC timestamp (ISO 8601) of segment end"
    )
    vexa_updated_at: Optional[str] = Field(
        default=None, description="Vexa's updated_at timestamp"
    )


class StoredSegment(BaseModel):
    """Full stored segment model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    segment_id: str
    playlist_id: int
    version_id: int
    text: str
    speaker: Optional[str] = None
    language: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    completed: Optional[bool] = True
    absolute_start_time: str
    absolute_end_time: str
    vexa_updated_at: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
