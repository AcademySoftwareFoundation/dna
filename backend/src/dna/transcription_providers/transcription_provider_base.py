"""Transcription Provider Base.

Abstract base class for transcription providers and factory function.
"""

import os
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Optional

from dna.models.stored_segment import StoredSegment

if TYPE_CHECKING:
    from dna.models.transcription import (
        BotSession,
        BotStatus,
        Platform,
        Transcript,
    )

EventCallback = Callable[[str, dict[str, Any]], Coroutine[Any, Any, None]]

_provider_instance: "TranscriptionProviderBase | None" = None
_provider_type: str | None = None


def reset_transcription_provider() -> None:
    """Reset the cached provider instance (for tests)."""
    global _provider_instance, _provider_type
    _provider_instance = None
    _provider_type = None


class TranscriptionProviderBase:
    """Abstract base class for transcription providers."""

    @staticmethod
    def build_transcript_text(segments: list[StoredSegment]) -> str:
        """Format stored segments as newline-separated ``Speaker: text`` lines."""
        if not segments:
            return "No transcript available."
        lines: list[str] = []
        for segment in segments:
            speaker = segment.speaker or "Unknown"
            lines.append(f"{speaker}: {segment.text}")
        return "\n".join(lines)

    async def dispatch_bot(
        self,
        platform: "Platform",
        meeting_id: str,
        playlist_id: int,
        passcode: Optional[str] = None,
        bot_name: Optional[str] = None,
        language: Optional[str] = None,
    ) -> "BotSession":
        """Dispatch a bot to join a meeting and start transcription."""
        raise NotImplementedError()

    async def stop_bot(self, platform: "Platform", meeting_id: str) -> bool:
        """Stop a bot that is currently in a meeting."""
        raise NotImplementedError()

    async def get_bot_status(
        self, platform: "Platform", meeting_id: str
    ) -> "BotStatus":
        """Get the current status of a bot."""
        raise NotImplementedError()

    async def get_transcript(
        self, platform: "Platform", meeting_id: str
    ) -> "Transcript":
        """Get the full transcript for a meeting."""
        raise NotImplementedError()

    async def subscribe_to_meeting(
        self,
        platform: str,
        meeting_id: str,
        on_event: EventCallback,
    ) -> None:
        """Subscribe to real-time updates for a meeting."""
        raise NotImplementedError()

    async def unsubscribe_from_meeting(
        self,
        platform: str,
        meeting_id: str,
    ) -> None:
        """Unsubscribe from a meeting's updates."""
        raise NotImplementedError()

    async def get_active_bots(self) -> list[dict[str, Any]]:
        """Get list of active bots for the current user.

        Returns a list of dicts with at least:
        - platform: str
        - native_meeting_id: str
        - status: str
        - meeting_id: int (internal ID, optional)
        """
        raise NotImplementedError()

    def register_meeting_id_mapping(
        self, internal_id: int, platform: str, native_meeting_id: str
    ) -> None:
        """Register a mapping from internal meeting ID to platform:native_id.

        This is used for recovery when resubscribing to active meetings.
        """
        pass

    async def close(self):
        """Clean up any resources."""
        pass


def get_transcription_provider() -> TranscriptionProviderBase:
    """Factory function to get the configured transcription provider."""
    global _provider_instance, _provider_type

    provider_type = os.getenv("TRANSCRIPTION_PROVIDER", "vexa")
    if _provider_instance is not None and _provider_type == provider_type:
        return _provider_instance

    if provider_type == "vexa":
        from dna.transcription_providers.vexa import VexaTranscriptionProvider

        _provider_instance = VexaTranscriptionProvider()
        _provider_type = provider_type
        return _provider_instance

    if provider_type == "browser_extension":
        from dna.transcription_providers.browser_extension import (
            BrowserExtensionTranscriptionProvider,
        )

        _provider_instance = BrowserExtensionTranscriptionProvider()
        _provider_type = provider_type
        return _provider_instance

    raise ValueError(f"Unknown transcription provider: {provider_type}")
