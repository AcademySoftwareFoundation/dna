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

    # Google Meet stays first: the docs explorer shows examples[0].
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {**_MEETING, "playlist_id": "45", "bot_name": "DNA Notes"},
                {
                    "platform": "zoom",
                    "meeting_id": "81234567890",
                    "meeting_url": "https://zoom.us/j/81234567890?pwd=abc123",
                    "playlist_id": "45",
                },
            ]
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


class TranscriptionLanguage(BaseModel):
    """A language the transcription provider can be asked to transcribe in."""

    code: str = Field(
        ...,
        description="ISO 639-1 code passed to the transcriber at session start; "
        "the empty string means auto-detect per window",
    )
    label: str = Field(..., description="Display name for the Settings dropdown")


class TranscriptionLanguagesResponse(BaseModel):
    """Languages offered in Settings → Transcription, as reported by the provider."""

    languages: list[TranscriptionLanguage]
    default: str = Field(
        ...,
        description="Code pre-selected for users who have not chosen a language",
    )


# Sentinel for "let the transcriber detect the language per window". Sent as an
# absent `language` on bot dispatch and stored as "" in user settings.
AUTO_DETECT_LANGUAGE = ""

# Dailies are overwhelmingly English; fixing the language skips Whisper's
# per-window detection pass (latency) and prevents mid-session flips (accuracy).
DEFAULT_TRANSCRIPTION_LANGUAGE = "en"

# Whisper's best-supported subset. Providers that can query their backend for
# the loaded model's languages override `get_transcription_languages` instead
# of editing this list.
DEFAULT_TRANSCRIPTION_LANGUAGES: list[TranscriptionLanguage] = [
    TranscriptionLanguage(code="en", label="English"),
    TranscriptionLanguage(code="es", label="Spanish"),
    TranscriptionLanguage(code="fr", label="French"),
    TranscriptionLanguage(code="de", label="German"),
    TranscriptionLanguage(code="it", label="Italian"),
    TranscriptionLanguage(code="pt", label="Portuguese"),
    TranscriptionLanguage(code="ja", label="Japanese"),
    TranscriptionLanguage(code="ko", label="Korean"),
    TranscriptionLanguage(code="zh", label="Chinese"),
    TranscriptionLanguage(code="hi", label="Hindi"),
    TranscriptionLanguage(code=AUTO_DETECT_LANGUAGE, label="Auto-detect"),
]
