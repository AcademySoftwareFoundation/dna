"""Event type definitions."""

from enum import Enum


class EventType(str, Enum):
    TRANSCRIPTION_SUBSCRIBE = "transcription.subscribe"
    TRANSCRIPTION_STARTED = "transcription.started"
    TRANSCRIPTION_UPDATED = "transcription.updated"
    TRANSCRIPTION_COMPLETED = "transcription.completed"
    TRANSCRIPTION_ERROR = "transcription.error"
    BOT_STATUS_CHANGED = "bot.status_changed"
    PLAYLIST_UPDATED = "playlist.updated"
    VERSION_UPDATED = "version.updated"
    DRAFT_NOTE_UPDATED = "draft_note.updated"
