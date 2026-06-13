"""Browser Extension Transcription Provider.

Receives transcript frames from the Chrome extension via WebSocket instead of
pulling from Vexa. The extension replaces the Vexa bot for audio capture.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from dna.models.extension_transcript import (
    ExtensionMeetingStatusFrame,
    ExtensionTranscriptFrame,
    parse_extension_message,
)
from dna.models.transcription import (
    BotSession,
    BotStatus,
    BotStatusEnum,
    Platform,
    Transcript,
)
from dna.transcription_providers.transcription_provider_base import (
    EventCallback,
    TranscriptionProviderBase,
)

logger = logging.getLogger(__name__)

_STATUS_MAP: dict[str, BotStatusEnum] = {
    "joining": BotStatusEnum.JOINING,
    "transcribing": BotStatusEnum.TRANSCRIBING,
    "completed": BotStatusEnum.COMPLETED,
    "failed": BotStatusEnum.FAILED,
    "stopped": BotStatusEnum.STOPPED,
}


@dataclass
class ExtensionSession:
    """In-memory session for a browser extension transcription."""

    session_id: int
    platform: str
    meeting_id: str
    playlist_id: int
    status: BotStatusEnum = BotStatusEnum.JOINING
    websocket: Any = None
    bot_name: Optional[str] = None
    language: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


class BrowserExtensionTranscriptionProvider(TranscriptionProviderBase):
    """Transcription provider backed by a Chrome extension instead of Vexa."""

    def __init__(self) -> None:
        self._sessions: dict[str, ExtensionSession] = {}
        self._subscribed_meetings: dict[str, EventCallback] = {}
        self._next_session_id: int = 1

    def _meeting_key(self, platform: str, meeting_id: str) -> str:
        return f"{platform}:{meeting_id}"

    async def dispatch_bot(
        self,
        platform: Platform,
        meeting_id: str,
        playlist_id: int,
        passcode: Optional[str] = None,
        bot_name: Optional[str] = None,
        language: Optional[str] = None,
    ) -> BotSession:
        meeting_key = self._meeting_key(platform.value, meeting_id)
        session_id = self._next_session_id
        self._next_session_id += 1

        now = datetime.utcnow()
        self._sessions[meeting_key] = ExtensionSession(
            session_id=session_id,
            platform=platform.value,
            meeting_id=meeting_id,
            playlist_id=playlist_id,
            status=BotStatusEnum.JOINING,
            bot_name=bot_name,
            language=language,
            created_at=now,
            updated_at=now,
        )

        return BotSession(
            platform=platform,
            meeting_id=meeting_id,
            playlist_id=playlist_id,
            status=BotStatusEnum.JOINING,
            vexa_meeting_id=session_id,
            bot_name=bot_name,
            language=language,
            created_at=now,
            updated_at=now,
        )

    async def stop_bot(self, platform: Platform, meeting_id: str) -> bool:
        meeting_key = self._meeting_key(platform.value, meeting_id)
        session = self._sessions.get(meeting_key)
        if session is None:
            return False

        session.status = BotStatusEnum.STOPPED
        session.updated_at = datetime.utcnow()

        if session.websocket is not None:
            try:
                await session.websocket.send_json({"type": "stop"})
            except Exception:
                logger.exception("Failed to send stop to extension for %s", meeting_key)

        return True

    async def get_bot_status(self, platform: Platform, meeting_id: str) -> BotStatus:
        meeting_key = self._meeting_key(platform.value, meeting_id)
        session = self._sessions.get(meeting_key)
        if session is None:
            return BotStatus(
                platform=platform,
                meeting_id=meeting_id,
                status=BotStatusEnum.IDLE,
                message="Meeting not found",
                updated_at=datetime.utcnow(),
            )

        return BotStatus(
            platform=platform,
            meeting_id=meeting_id,
            status=session.status,
            updated_at=session.updated_at,
        )

    async def get_transcript(self, platform: Platform, meeting_id: str) -> Transcript:
        return Transcript(
            platform=platform,
            meeting_id=meeting_id,
            segments=[],
        )

    async def subscribe_to_meeting(
        self,
        platform: str,
        meeting_id: str,
        on_event: EventCallback,
    ) -> None:
        meeting_key = self._meeting_key(platform, meeting_id)
        self._subscribed_meetings[meeting_key] = on_event
        logger.info("Subscribed to extension meeting: %s", meeting_key)

    async def unsubscribe_from_meeting(
        self,
        platform: str,
        meeting_id: str,
    ) -> None:
        meeting_key = self._meeting_key(platform, meeting_id)
        self._subscribed_meetings.pop(meeting_key, None)

    async def get_active_bots(self) -> list[dict[str, Any]]:
        terminal = {
            BotStatusEnum.COMPLETED,
            BotStatusEnum.FAILED,
            BotStatusEnum.STOPPED,
        }
        return [
            {
                "platform": session.platform,
                "native_meeting_id": session.meeting_id,
                "status": session.status.value,
                "meeting_id": session.session_id,
                "id": session.session_id,
            }
            for session in self._sessions.values()
            if session.status not in terminal
        ]

    def register_meeting_id_mapping(
        self, internal_id: int, platform: str, native_meeting_id: str
    ) -> None:
        meeting_key = self._meeting_key(platform, native_meeting_id)
        session = self._sessions.get(meeting_key)
        if session is not None:
            session.session_id = internal_id

    async def register_extension(
        self,
        platform: str,
        meeting_id: str,
        websocket: Any,
    ) -> Optional[dict[str, Any]]:
        meeting_key = self._meeting_key(platform, meeting_id)
        session = self._sessions.get(meeting_key)
        if session is None:
            logger.warning("Extension register for unknown session: %s", meeting_key)
            return None

        session.websocket = websocket
        session.status = BotStatusEnum.TRANSCRIBING
        session.updated_at = datetime.utcnow()

        return {
            "session_id": session.session_id,
            "playlist_id": session.playlist_id,
        }

    async def handle_extension_message(
        self,
        meeting_key: str,
        data: dict[str, Any],
    ) -> None:
        callback = self._subscribed_meetings.get(meeting_key)
        if callback is None:
            logger.warning(
                "Received extension message for unsubscribed meeting: %s",
                meeting_key,
            )
            return

        session = self._sessions.get(meeting_key)
        if session is None:
            return

        try:
            message = parse_extension_message(data)
        except ValueError:
            logger.exception("Invalid extension message for %s", meeting_key)
            return

        platform, meeting_id = meeting_key.split(":", 1)

        if isinstance(message, ExtensionTranscriptFrame):
            await callback(
                "transcript.updated",
                {
                    "platform": platform,
                    "meeting_id": meeting_id,
                    "speaker": message.speaker,
                    "confirmed": [s.model_dump() for s in message.confirmed],
                    "pending": [s.model_dump() for s in message.pending],
                    "ts": message.ts,
                },
            )
            return

        if isinstance(message, ExtensionMeetingStatusFrame):
            mapped_status = _STATUS_MAP.get(message.status, BotStatusEnum.IDLE)
            session.status = mapped_status
            session.updated_at = datetime.utcnow()
            await callback(
                "bot.status_changed",
                {
                    "platform": platform,
                    "meeting_id": meeting_id,
                    "playlist_id": session.playlist_id,
                    "status": message.status,
                },
            )

    async def close(self) -> None:
        self._sessions.clear()
        self._subscribed_meetings.clear()
