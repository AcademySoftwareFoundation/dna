"""Published transcript bookkeeping model.

Tracks which (playlist, version, meeting) has already been pushed to the
production tracking system so re-publishing can be idempotent. The actual
transcript content lives in SG; here we only keep the reference plus a
body_hash used to skip no-op re-publishes.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PublishedTranscriptUpdate(BaseModel):
    """Upsert payload for the published_transcripts collection."""

    playlist_id: int
    version_id: int
    meeting_id: str
    sg_entity_type: str = Field(
        description="Custom entity type in the tracking system (e.g. CustomEntity01)"
    )
    sg_entity_id: int = Field(description="ID of the row created in tracking system")
    author_email: str
    body_hash: str = Field(description="sha256 of the published body for idempotence")
    segments_count: int


class PublishedTranscript(BaseModel):
    """Full record for a row we have pushed to the tracking system."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    playlist_id: int
    version_id: int
    meeting_id: str
    sg_entity_type: str
    sg_entity_id: int
    author_email: str
    body_hash: str
    segments_count: int
    created_at: datetime
    updated_at: datetime
