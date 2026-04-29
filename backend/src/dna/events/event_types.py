"""Event type definitions.

Only events that are actually emitted AND consumed live here. The flat
`transcript` frame doesn't go through this enum — it's broadcast directly
via `EventPublisher.ws_manager.broadcast(...)` because its envelope is
shaped by the Vexa contract, not by the `{type, payload}` wrapper this
enum drives.
"""

from enum import Enum


class EventType(str, Enum):
    TRANSCRIPTION_COMPLETED = "transcription.completed"
    TRANSCRIPTION_ERROR = "transcription.error"
    BOT_STATUS_CHANGED = "bot.status_changed"
