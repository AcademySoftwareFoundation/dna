"""Extension Transcription Provider.

Provider used when transcripts are produced by the DNA browser extension
instead of a Vexa bot. The extension captures Google Meet tab audio,
transcribes it via WhisperLive, and streams segments directly into DNA over a
WebSocket (``/transcription/extension/ingest``).

Because the extension owns the meeting lifecycle in the user's browser, this
provider has no outbound bot to dispatch or poll — the bot-oriented methods are
intentionally no-ops so the rest of the app (startup recovery, factory wiring)
behaves gracefully when ``TRANSCRIPTION_PROVIDER=extension``.
"""

import logging
from typing import TYPE_CHECKING, Any, Optional

from dna.transcription_providers.transcription_provider_base import (
    EventCallback,
    TranscriptionProviderBase,
)

if TYPE_CHECKING:
    from dna.models.transcription import BotStatus, Platform

logger = logging.getLogger(__name__)


class ExtensionTranscriptionProvider(TranscriptionProviderBase):
    """Transcription provider backed by the DNA browser extension.

    Segments arrive via the inbound ``/transcription/extension/ingest``
    WebSocket, so there is no bot to dispatch and no upstream service to
    subscribe to. See ``TranscriptionService.ingest_extension_transcript``.
    """

    async def dispatch_bot(
        self,
        platform: "Platform",
        meeting_id: str,
        playlist_id: int,
        passcode: Optional[str] = None,
        bot_name: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Any:
        raise NotImplementedError(
            "Extension transcription does not dispatch bots; the browser "
            "extension streams segments directly to DNA."
        )

    async def stop_bot(self, platform: "Platform", meeting_id: str) -> bool:
        # Nothing to stop server-side; the browser extension controls capture.
        return True

    async def get_bot_status(
        self, platform: "Platform", meeting_id: str
    ) -> "BotStatus":
        from dna.models.transcription import BotStatus, BotStatusEnum

        return BotStatus(
            platform=platform,
            meeting_id=meeting_id,
            status=BotStatusEnum.IDLE,
            message="Extension transcription is client-driven.",
        )

    async def get_transcript(self, platform: "Platform", meeting_id: str) -> Any:
        raise NotImplementedError(
            "Extension transcription stores segments directly; use "
            "/transcription/segments/{playlist_id}/{version_id}."
        )

    async def subscribe_to_meeting(
        self,
        platform: str,
        meeting_id: str,
        on_event: EventCallback,
    ) -> None:
        # No upstream to subscribe to; segments are pushed by the extension.
        return None

    async def unsubscribe_from_meeting(
        self,
        platform: str,
        meeting_id: str,
    ) -> None:
        return None

    async def get_active_bots(self) -> list[dict[str, Any]]:
        # No server-side bots to recover on startup.
        return []

    async def close(self) -> None:
        return None
