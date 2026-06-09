"""Meeting recording + rendered-clip models.

A MeetingRecording records one uploaded Zoom MP4 and the per-version clips DNA
cut from it by replaying the stored transcript segmentation. The source MP4 and
each rendered clip/thumbnail live on disk under ATTACHMENT_STORE_DIR (same store
as image attachments); this collection holds only the references + the cut math.
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RecordingClip(BaseModel):
    """One rendered clip cut from the recording for a single version."""

    clip_id: str = Field(description="UUID of the dir holding the rendered clip MP4")
    version_id: int
    thumb_id: str = Field(
        description="UUID of the dir holding the first-frame thumbnail JPG; "
        "served via GET /api/attachments/{thumb_id}"
    )
    filename: str = Field(description="Clip MP4 filename within the clip dir")
    duration_seconds: float
    video_in_seconds: float
    video_out_seconds: float
    transcript_segment_ids: list[str] = Field(default_factory=list)
    body_hash: str = Field(
        description="sha256 of this version's cut list, for republish idempotence"
    )


class MeetingRecordingCreate(BaseModel):
    """Payload for persisting a freshly-processed recording."""

    recording_id: str
    playlist_id: int
    meeting_id: Optional[str] = None
    folder_name: str = Field(description="Zoom folder name the start time came from")
    recording_t0: datetime = Field(
        description="UTC instant of the recording's 00:00:00"
    )
    duration_seconds: float
    clips: list[RecordingClip] = Field(default_factory=list)


class MeetingRecording(MeetingRecordingCreate):
    """Full stored recording record."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VideoSegmentClipPayload(BaseModel):
    """One clip handed to the prodtrack provider for publishing.

    Carries the on-disk path of the rendered MP4 plus the cut metadata the
    provider needs to label the ShotGrid Version it creates.
    """

    code: str = Field(description="Human-readable name for the ShotGrid Version")
    file_path: str = Field(description="Absolute path to the rendered clip MP4")
    video_in_seconds: float
    video_out_seconds: float
    duration_seconds: float


class RecordingClipInfo(BaseModel):
    """Per-clip info returned to the frontend after processing."""

    clip_id: str
    version_id: int
    thumb_id: str
    duration_seconds: float
    video_in_seconds: float
    video_out_seconds: float


class RecordingUploadResponse(BaseModel):
    """Response of POST /api/recordings/upload."""

    recording_id: str
    clips: list[RecordingClipInfo] = Field(default_factory=list)
