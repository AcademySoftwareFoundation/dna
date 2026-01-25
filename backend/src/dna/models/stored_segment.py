"""Stored Segment Models.

Pydantic models for transcription segments stored in MongoDB.
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


def generate_segment_id(
    playlist_id: int,
    version_id: int,
    speaker: str,
    absolute_start_time: str,
) -> str:
    """Generate a unique segment ID based on version, speaker, and start time."""
    key = f"{playlist_id}:{version_id}:{speaker}:{absolute_start_time}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


class StoredSegmentCreate(BaseModel):
    """Model for creating a stored segment."""

    text: str = Field(..., description="Transcript text content")
    speaker: Optional[str] = Field(default=None, description="Speaker identifier")
    language: Optional[str] = Field(default=None, description="Language code")
    absolute_start_time: str = Field(
        ..., description="UTC timestamp (ISO 8601) of segment start"
    )
    absolute_end_time: str = Field(
        ..., description="UTC timestamp (ISO 8601) of segment end"
    )
    vexa_updated_at: Optional[str] = Field(
        default=None, description="Vexa's updated_at timestamp for deduplication"
    )


class StoredSegment(BaseModel):
    """Full stored segment model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    segment_id: str = Field(..., description="Unique segment ID")
    playlist_id: int
    version_id: int
    text: str
    speaker: Optional[str] = None
    language: Optional[str] = None
    absolute_start_time: str
    absolute_end_time: str
    vexa_updated_at: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
