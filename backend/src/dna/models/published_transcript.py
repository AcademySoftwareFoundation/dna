"""Published transcript bookkeeping model.

Tracks which (playlist, version, meeting) tuples have already been pushed
to the production tracking system so re-publishing can be idempotent. The
actual transcript content lives in the tracking system; here we only keep
the reference plus a body_hash used to skip no-op re-publishes.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PublishedTranscriptUpdate(BaseModel):
    """Upsert payload for the published_transcripts collection."""

    playlist_id: str
    version_id: str
    meeting_id: str
    entity_type: str = Field(
        description="Custom entity type in the tracking system (e.g. CustomEntity01)"
    )
    entity_id: str = Field(description="ID of the row created in tracking system")
    name: Optional[str] = Field(
        default=None, description="Row name in the tracking system (SG code)"
    )
    author_email: str
    body_hash: str = Field(description="sha256 of the published body for idempotence")
    segments_count: int


class PublishedTranscript(BaseModel):
    """Full record for a row we have pushed to the tracking system."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    playlist_id: str
    version_id: str
    meeting_id: str
    entity_type: str
    entity_id: str
    # Absent on rows published before the name was recorded.
    name: Optional[str] = None
    author_email: str
    body_hash: str
    segments_count: int
    created_at: datetime
    updated_at: datetime


class PublishedTranscriptSummary(BaseModel):
    """A playlist's published transcript, as listed for clients."""

    version_id: str
    meeting_id: str
    entity_type: str
    entity_id: str
    name: str = Field(description="Row name in the tracking system (SG code)")
    updated_at: datetime
