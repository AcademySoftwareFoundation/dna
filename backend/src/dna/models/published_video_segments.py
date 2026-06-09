"""Published video-segments bookkeeping model.

Tracks which (playlist, version, meeting, recording) tuples have already had
their rendered clips pushed to the production tracking system, so re-publishing
can be idempotent. The clips themselves live in the tracking system; here we
keep the reference (entity_type/entity_id) plus a body_hash of the cut list used
to skip no-op re-publishes. Idempotence lives here, not in the tracking system.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PublishedVideoSegmentsUpdate(BaseModel):
    """Upsert payload for the published_video_segments collection."""

    playlist_id: int
    version_id: int
    meeting_id: str
    recording_id: str
    entity_type: str = Field(
        description="Custom entity type in the tracking system (e.g. CustomEntity14)"
    )
    entity_id: int = Field(description="ID of the row created in tracking system")
    author_email: str
    body_hash: str = Field(
        description="sha256 of the version's cut list, for idempotence"
    )
    clips_count: int


class PublishedVideoSegments(BaseModel):
    """Full record for a clip set we have pushed to the tracking system."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    playlist_id: int
    version_id: int
    meeting_id: str
    recording_id: str
    entity_type: str
    entity_id: int
    author_email: str
    body_hash: str
    clips_count: int
    created_at: datetime
    updated_at: datetime
