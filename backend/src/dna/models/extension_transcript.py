"""Pydantic models for Chrome extension WebSocket messages."""

from typing import Any, Literal, Union

from pydantic import BaseModel, Field, field_validator


class ExtensionTranscriptSegment(BaseModel):
    """A single transcript segment from the Chrome extension."""

    segment_id: str
    text: str
    speaker: str | None = None
    language: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    absolute_start_time: str
    absolute_end_time: str
    updated_at: str | None = None

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be empty")
        return value


class ExtensionRegisterMessage(BaseModel):
    """Extension registration message binding to a DNA session."""

    action: Literal["register"]
    platform: str
    meeting_id: str


class ExtensionTranscriptFrame(BaseModel):
    """Live transcript update from the Chrome extension."""

    type: Literal["transcript"]
    speaker: str | None = None
    confirmed: list[ExtensionTranscriptSegment] = Field(default_factory=list)
    pending: list[ExtensionTranscriptSegment] = Field(default_factory=list)
    ts: str | None = None


class ExtensionMeetingStatusFrame(BaseModel):
    """Meeting lifecycle status from the Chrome extension."""

    type: Literal["meeting.status"]
    status: Literal[
        "joining",
        "transcribing",
        "completed",
        "failed",
        "stopped",
    ]


ExtensionInboundMessage = Union[
    ExtensionRegisterMessage,
    ExtensionTranscriptFrame,
    ExtensionMeetingStatusFrame,
]


def parse_extension_message(data: dict[str, Any]) -> ExtensionInboundMessage:
    """Parse a raw WebSocket JSON payload from the Chrome extension."""
    if data.get("action") == "register":
        return ExtensionRegisterMessage.model_validate(data)

    msg_type = data.get("type")
    if msg_type == "transcript":
        return ExtensionTranscriptFrame.model_validate(data)
    if msg_type == "meeting.status":
        return ExtensionMeetingStatusFrame.model_validate(data)

    raise ValueError(f"Unknown extension message type: {msg_type!r}")
