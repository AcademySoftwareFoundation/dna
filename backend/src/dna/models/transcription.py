"""Transcription Models.

Pydantic models for transcription bot sessions and events.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

_MEETING = {"platform": "google_meet", "meeting_id": "abc-defg-hij"}
_SEGMENT_EXAMPLE = {
    "text": "Alex, can you take the edge on 1042?",
    "speaker": "Sam Reviewer",
    "start_time": 812.4,
    "end_time": 815.1,
    "timestamp": "2026-10-14T17:13:32.400Z",
}


class Platform(str, Enum):
    """Supported meeting platforms."""

    GOOGLE_MEET = "google_meet"
    TEAMS = "teams"
    ZOOM = "zoom"


class BotStatusEnum(str, Enum):
    """Bot lifecycle status values."""

    IDLE = "idle"
    JOINING = "joining"
    WAITING_ROOM = "waiting_room"
    IN_CALL = "in_call"
    TRANSCRIBING = "transcribing"
    FAILED = "failed"
    STOPPED = "stopped"
    COMPLETED = "completed"


class DispatchBotRequest(BaseModel):
    """Request to dispatch a bot to a meeting."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{**_MEETING, "playlist_id": "45", "bot_name": "DNA Notes"}]
        }
    )

    platform: Platform
    meeting_id: str = Field(..., description="Native meeting ID for the platform")
    playlist_id: str = Field(
        ..., description="Playlist ID to associate with this meeting"
    )
    passcode: Optional[str] = Field(
        default=None, description="Passcode for Teams or Zoom meetings"
    )
    meeting_url: Optional[str] = Field(
        default=None,
        description="Join link as pasted by the user (sent for Zoom meetings)",
    )
    bot_name: Optional[str] = Field(default=None, description="Custom name for the bot")
    language: Optional[str] = Field(default=None, description="Transcription language")


class BotStatus(BaseModel):
    """Current status of a transcription bot."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    **_MEETING,
                    "status": "transcribing",
                    "message": None,
                    "updated_at": "2026-10-14T17:06:40.212Z",
                }
            ]
        }
    )

    platform: Platform
    meeting_id: str
    status: BotStatusEnum
    message: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BotSession(BaseModel):
    """Represents an active or completed bot session."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    **_MEETING,
                    "playlist_id": "45",
                    "status": "joining",
                    "vexa_meeting_id": 1842,
                    "bot_name": "DNA Notes",
                    "language": None,
                    "created_at": "2026-10-14T17:05:58.901Z",
                    "updated_at": "2026-10-14T17:05:58.901Z",
                }
            ]
        }
    )

    platform: Platform
    meeting_id: str
    playlist_id: str
    status: BotStatusEnum
    vexa_meeting_id: Optional[int] = None
    bot_name: Optional[str] = None
    language: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TranscriptSegment(BaseModel):
    """A single segment of transcribed speech."""

    model_config = ConfigDict(json_schema_extra={"examples": [_SEGMENT_EXAMPLE]})

    text: str
    speaker: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class Transcript(BaseModel):
    """Full transcript for a meeting."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    **_MEETING,
                    "segments": [_SEGMENT_EXAMPLE],
                    "language": "en",
                    "duration": 2710.5,
                }
            ]
        }
    )

    platform: Platform
    meeting_id: str
    segments: list[TranscriptSegment] = Field(default_factory=list)
    language: Optional[str] = None
    duration: Optional[float] = None
