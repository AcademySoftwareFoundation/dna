"""Transcription Models.

Pydantic models for transcription bot sessions and events.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Platform(str, Enum):
    """Supported meeting platforms."""

    GOOGLE_MEET = "google_meet"
    TEAMS = "teams"


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

    platform: Platform
    meeting_id: str = Field(..., description="Native meeting ID for the platform")
    playlist_id: int = Field(
        ..., description="Playlist ID to associate with this meeting"
    )
    passcode: Optional[str] = Field(
        default=None, description="Passcode for Teams meetings"
    )
    bot_name: Optional[str] = Field(default=None, description="Custom name for the bot")
    language: Optional[str] = Field(default=None, description="Transcription language")


class BotStatus(BaseModel):
    """Current status of a transcription bot."""

    platform: Platform
    meeting_id: str
    status: BotStatusEnum
    message: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BotSession(BaseModel):
    """Represents an active or completed bot session."""

    platform: Platform
    meeting_id: str
    playlist_id: int
    status: BotStatusEnum
    vexa_meeting_id: Optional[int] = None
    bot_name: Optional[str] = None
    language: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TranscriptSegment(BaseModel):
    """A single segment of transcribed speech."""

    text: str
    speaker: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class Transcript(BaseModel):
    """Full transcript for a meeting."""

    platform: Platform
    meeting_id: str
    segments: list[TranscriptSegment] = Field(default_factory=list)
    language: Optional[str] = None
    duration: Optional[float] = None
