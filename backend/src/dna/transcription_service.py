"""Transcription service for managing Vexa subscriptions and segment processing."""

import logging
from datetime import datetime, timezone
from typing import Any

from dna.events import EventPublisher, EventType, get_event_publisher
from dna.models.stored_segment import StoredSegmentCreate, generate_segment_id
from dna.storage_providers.storage_provider_base import (
    StorageProviderBase,
    get_storage_provider,
)
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
    get_transcription_provider,
)

logger = logging.getLogger(__name__)

_service: "TranscriptionService | None" = None


class TranscriptionService:
    """Service for managing transcription subscriptions and processing segments."""

    def __init__(
        self,
        transcription_provider: TranscriptionProviderBase | None = None,
        storage_provider: StorageProviderBase | None = None,
        event_publisher: EventPublisher | None = None,
    ):
        self.transcription_provider = transcription_provider
        self.storage_provider = storage_provider
        self.event_publisher = event_publisher
        self._subscribed_meetings: set[str] = set()
        self._meeting_to_playlist: dict[str, int] = {}

    async def init_providers(self) -> None:
        """Initialize providers if not already set."""
        logger.info("Initializing transcription service providers...")
        if self.transcription_provider is None:
            self.transcription_provider = get_transcription_provider()
        if self.storage_provider is None:
            self.storage_provider = get_storage_provider()
        if self.event_publisher is None:
            self.event_publisher = get_event_publisher()
        logger.info("Transcription service providers initialized")

    async def resubscribe_to_active_meetings(self) -> None:
        """Resubscribe to any active meetings on startup for recovery."""
        if self.transcription_provider is None or self.storage_provider is None:
            logger.error("Providers not initialized, cannot resubscribe")
            return

        logger.info("Checking for active meetings to resubscribe...")

        try:
            active_bots = await self.transcription_provider.get_active_bots()
            if not active_bots:
                logger.info("No active meetings found")
                return

            logger.info(
                "Found %d active bot(s), attempting to resubscribe", len(active_bots)
            )

            for bot in active_bots:
                platform = bot.get("platform", "")
                native_meeting_id = bot.get("native_meeting_id", "")
                status = bot.get("status", "")

                if not platform or not native_meeting_id:
                    logger.warning(
                        "Skipping bot with missing platform/meeting_id: %s", bot
                    )
                    continue

                if status in ("completed", "failed", "stopped"):
                    logger.debug(
                        "Skipping inactive bot %s:%s (status: %s)",
                        platform,
                        native_meeting_id,
                        status,
                    )
                    continue

                metadata = (
                    await self.storage_provider.get_playlist_metadata_by_meeting_id(
                        native_meeting_id
                    )
                )
                if metadata is None:
                    logger.warning(
                        "No playlist metadata found for meeting %s, skipping",
                        native_meeting_id,
                    )
                    continue

                meeting_key = f"{platform}:{native_meeting_id}"
                self._meeting_to_playlist[meeting_key] = metadata.playlist_id

                internal_meeting_id = (
                    metadata.vexa_meeting_id or bot.get("meeting_id") or bot.get("id")
                )
                if internal_meeting_id is not None:
                    self.transcription_provider.register_meeting_id_mapping(
                        internal_meeting_id, platform, native_meeting_id
                    )

                logger.info(
                    "Resubscribing to meeting %s (playlist_id: %s, vexa_id: %s, status: %s)",
                    meeting_key,
                    metadata.playlist_id,
                    internal_meeting_id,
                    status,
                )

                try:
                    await self.transcription_provider.subscribe_to_meeting(
                        platform=platform,
                        meeting_id=native_meeting_id,
                        on_event=self._on_vexa_event,
                    )
                    self._subscribed_meetings.add(meeting_key)
                    logger.info("Successfully resubscribed to meeting: %s", meeting_key)

                    if self.event_publisher:
                        await self.event_publisher.publish(
                            EventType.BOT_STATUS_CHANGED,
                            {
                                "platform": platform,
                                "meeting_id": native_meeting_id,
                                "playlist_id": metadata.playlist_id,
                                "status": status,
                                "recovered": True,
                            },
                        )
                        logger.info(
                            "Published recovery status for meeting %s: %s",
                            meeting_key,
                            status,
                        )
                except Exception as e:
                    logger.exception(
                        "Failed to resubscribe to meeting %s: %s", meeting_key, e
                    )

        except Exception as e:
            logger.exception("Error during resubscription: %s", e)

    async def _on_vexa_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Handle events from Vexa and forward to event publisher."""
        if self.event_publisher is None:
            logger.error("Event publisher not initialized")
            return

        if event_type == "transcript.updated":
            await self.event_publisher.publish(
                EventType.TRANSCRIPTION_UPDATED,
                payload,
            )
            await self.on_transcription_updated(payload)
        elif event_type == "bot.status_changed":
            await self.event_publisher.publish(
                EventType.BOT_STATUS_CHANGED,
                payload,
            )
            status = payload.get("status", "").lower()
            if status in ("completed", "failed", "stopped"):
                await self.event_publisher.publish(
                    (
                        EventType.TRANSCRIPTION_COMPLETED
                        if status == "completed"
                        else EventType.TRANSCRIPTION_ERROR
                    ),
                    payload,
                )
                await self.on_transcription_completed(payload)
        else:
            logger.warning("Unknown Vexa event type: %s", event_type)

    async def subscribe_to_meeting(
        self, platform: str, meeting_id: str, playlist_id: int
    ) -> None:
        """Subscribe to Vexa updates for a meeting."""
        if self.transcription_provider is None:
            logger.error("Transcription provider not initialized")
            return

        meeting_key = f"{platform}:{meeting_id}"
        if meeting_key in self._subscribed_meetings:
            logger.info("Already subscribed to meeting: %s", meeting_key)
            return

        self._meeting_to_playlist[meeting_key] = playlist_id

        logger.info(
            "Subscribing to Vexa updates for meeting: %s (playlist_id: %s)",
            meeting_key,
            playlist_id,
        )

        try:
            await self.transcription_provider.subscribe_to_meeting(
                platform=platform,
                meeting_id=meeting_id,
                on_event=self._on_vexa_event,
            )
            self._subscribed_meetings.add(meeting_key)
            logger.info("Successfully subscribed to meeting: %s", meeting_key)
        except Exception as e:
            logger.exception("Failed to subscribe to meeting %s: %s", meeting_key, e)

    async def on_transcription_updated(self, payload: dict[str, Any]) -> None:
        """Process transcription segments and save to storage."""
        if self.storage_provider is None or self.event_publisher is None:
            logger.error("Providers not initialized")
            return

        platform = payload.get("platform", "")
        meeting_id = payload.get("meeting_id", "")
        segments = payload.get("segments", [])

        if not segments:
            logger.debug("No segments in transcription update")
            return

        meeting_key = f"{platform}:{meeting_id}"
        playlist_id = self._meeting_to_playlist.get(meeting_key)

        if playlist_id is None:
            logger.warning(
                "No playlist_id found for meeting %s, cannot save segments", meeting_key
            )
            return

        metadata = await self.storage_provider.get_playlist_metadata(playlist_id)
        if metadata is None or metadata.in_review is None:
            logger.warning(
                "No in_review version found for playlist %s, cannot save segments",
                playlist_id,
            )
            return

        if metadata.transcription_paused:
            logger.debug(
                "Transcription paused for playlist %s, skipping segment storage",
                playlist_id,
            )
            return

        version_id = metadata.in_review
        resumed_at = metadata.transcription_resumed_at

        for segment_data in segments:
            text = segment_data.get("text", "").strip()
            if not text:
                continue

            absolute_start_time = segment_data.get("absolute_start_time")
            if not absolute_start_time:
                continue

            if resumed_at is not None:
                try:
                    segment_time = datetime.fromisoformat(
                        absolute_start_time.replace("Z", "+00:00")
                    )
                    resumed_at_aware = resumed_at
                    if resumed_at.tzinfo is None:
                        resumed_at_aware = resumed_at.replace(tzinfo=timezone.utc)
                    if segment_time < resumed_at_aware:
                        logger.debug(
                            "Skipping segment from before resume: %s < %s",
                            absolute_start_time,
                            resumed_at_aware.isoformat(),
                        )
                        continue
                except ValueError:
                    pass

            speaker = segment_data.get("speaker", "Unknown")
            segment_id = generate_segment_id(
                playlist_id, version_id, absolute_start_time
            )

            segment_create = StoredSegmentCreate(
                text=text,
                speaker=speaker,
                language=segment_data.get("language"),
                absolute_start_time=absolute_start_time,
                absolute_end_time=segment_data.get("absolute_end_time", ""),
                vexa_updated_at=segment_data.get("updated_at"),
            )

            try:
                stored_segment, is_new = await self.storage_provider.upsert_segment(
                    playlist_id=playlist_id,
                    version_id=version_id,
                    segment_id=segment_id,
                    data=segment_create,
                )

                event_type = (
                    EventType.SEGMENT_CREATED if is_new else EventType.SEGMENT_UPDATED
                )
                await self.event_publisher.publish(
                    event_type,
                    {
                        "segment_id": segment_id,
                        "playlist_id": playlist_id,
                        "version_id": version_id,
                        "text": text,
                        "speaker": speaker,
                        "absolute_start_time": absolute_start_time,
                        "absolute_end_time": segment_data.get("absolute_end_time", ""),
                    },
                )

                logger.info(
                    "Saved segment %s (%s) for version %s - text: '%s...', end_time: %s",
                    segment_id,
                    "new" if is_new else "updated",
                    version_id,
                    text[:30] if len(text) > 30 else text,
                    segment_data.get("absolute_end_time", ""),
                )
                logger.debug(
                    "Full segment %s (%s) for version %s",
                    segment_id,
                    "new" if is_new else "updated",
                    version_id,
                )
            except Exception as e:
                logger.exception("Failed to save segment: %s", e)

    async def on_transcription_completed(self, payload: dict[str, Any]) -> None:
        """Handle transcription completion."""
        logger.info("Transcription completed: %s", payload)

        platform = payload.get("platform")
        meeting_id = payload.get("meeting_id")

        if platform and meeting_id:
            meeting_key = f"{platform}:{meeting_id}"

            if meeting_key in self._subscribed_meetings:
                self._subscribed_meetings.discard(meeting_key)
                logger.info(
                    "Removed subscription for completed meeting: %s", meeting_key
                )

            if meeting_key in self._meeting_to_playlist:
                del self._meeting_to_playlist[meeting_key]
                logger.info(
                    "Removed playlist mapping for completed meeting: %s", meeting_key
                )

            if self.transcription_provider:
                try:
                    await self.transcription_provider.unsubscribe_from_meeting(
                        platform=platform, meeting_id=meeting_id
                    )
                    logger.info(
                        "Unsubscribed from Vexa for completed meeting: %s", meeting_key
                    )
                except Exception as e:
                    logger.warning("Failed to unsubscribe from Vexa: %s", e)

    async def close(self) -> None:
        """Clean up resources."""
        logger.info("Closing transcription service...")
        if self.transcription_provider:
            await self.transcription_provider.close()
        self._subscribed_meetings.clear()
        self._meeting_to_playlist.clear()
        logger.info("Transcription service closed")


def get_transcription_service() -> TranscriptionService:
    """Get the singleton TranscriptionService instance."""
    global _service
    if _service is None:
        _service = TranscriptionService()
    return _service


def reset_transcription_service() -> None:
    """Reset the singleton for testing purposes."""
    global _service
    _service = None
