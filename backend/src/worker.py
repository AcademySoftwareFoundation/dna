"""RabbitMQ event consumer worker."""

import asyncio
import json
import logging
import os
import signal
import sys
from typing import Any

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://dna:dna@localhost:5672/dna")
EVENTS_EXCHANGE = "dna.events"
EVENTS_QUEUE = "dna.events.worker"


class EventWorker:
    def __init__(self, rabbitmq_url: str = RABBITMQ_URL):
        self.rabbitmq_url = rabbitmq_url
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.Channel | None = None
        self.should_stop = False
        self.transcription_provider: TranscriptionProviderBase | None = None
        self.storage_provider: StorageProviderBase | None = None
        self.event_publisher: EventPublisher | None = None
        self._subscribed_meetings: set[str] = set()
        self._meeting_to_playlist: dict[str, int] = {}

    async def connect(self) -> None:
        logger.info("Connecting to RabbitMQ at %s", self.rabbitmq_url)
        self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=10)

        exchange = await self.channel.declare_exchange(
            EVENTS_EXCHANGE,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )

        queue = await self.channel.declare_queue(
            EVENTS_QUEUE,
            durable=True,
        )

        await queue.bind(exchange, routing_key="#")

        logger.info(
            "Connected to RabbitMQ, listening for events on queue: %s", EVENTS_QUEUE
        )

    async def init_providers(self) -> None:
        """Initialize transcription, storage, and event providers."""
        logger.info("Initializing providers...")
        self.transcription_provider = get_transcription_provider()
        self.storage_provider = get_storage_provider()
        self.event_publisher = get_event_publisher()
        await self.event_publisher.connect()
        logger.info("Providers initialized")

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
                except Exception as e:
                    logger.exception(
                        "Failed to resubscribe to meeting %s: %s", meeting_key, e
                    )

        except Exception as e:
            logger.exception("Error during resubscription: %s", e)

    async def process_message(self, message: AbstractIncomingMessage) -> None:
        async with message.process():
            try:
                body = json.loads(message.body.decode())
                event_type = message.routing_key
                logger.info("Received event: %s", event_type)
                await self.handle_event(event_type, body)
            except json.JSONDecodeError as e:
                logger.error("Failed to decode message: %s", e)
            except Exception as e:
                logger.exception("Error processing message: %s", e)

    async def handle_event(
        self, event_type: str | None, payload: dict[str, Any]
    ) -> None:
        match event_type:
            case EventType.TRANSCRIPTION_SUBSCRIBE:
                await self.on_transcription_subscribe(payload)
            case EventType.TRANSCRIPTION_STARTED:
                await self.on_transcription_started(payload)
            case EventType.TRANSCRIPTION_UPDATED:
                await self.on_transcription_updated(payload)
            case EventType.TRANSCRIPTION_COMPLETED:
                await self.on_transcription_completed(payload)
            case EventType.TRANSCRIPTION_ERROR:
                await self.on_transcription_error(payload)
            case EventType.BOT_STATUS_CHANGED:
                await self.on_bot_status_changed(payload)
            case EventType.PLAYLIST_UPDATED:
                await self.on_playlist_updated(payload)
            case EventType.VERSION_UPDATED:
                await self.on_version_updated(payload)
            case EventType.DRAFT_NOTE_UPDATED:
                await self.on_draft_note_updated(payload)
            case EventType.SEGMENT_CREATED:
                await self.on_segment_created(payload)
            case EventType.SEGMENT_UPDATED:
                await self.on_segment_updated(payload)
            case _:
                logger.warning("Unknown event type: %s", event_type)

    async def _on_vexa_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Handle events from Vexa and forward to RabbitMQ."""
        if self.event_publisher is None:
            logger.error("Event publisher not initialized")
            return

        if event_type == "transcript.updated":
            await self.event_publisher.publish(
                EventType.TRANSCRIPTION_UPDATED,
                payload,
            )
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
        else:
            logger.warning("Unknown Vexa event type: %s", event_type)

    async def on_transcription_subscribe(self, payload: dict[str, Any]) -> None:
        """Subscribe to Vexa updates for a meeting."""
        if self.transcription_provider is None:
            logger.error("Transcription provider not initialized")
            return

        platform = payload.get("platform", "")
        meeting_id = payload.get("meeting_id", "")
        playlist_id = payload.get("playlist_id")

        if not platform or not meeting_id:
            logger.error("Missing platform or meeting_id in payload: %s", payload)
            return

        meeting_key = f"{platform}:{meeting_id}"
        if meeting_key in self._subscribed_meetings:
            logger.info("Already subscribed to meeting: %s", meeting_key)
            return

        if playlist_id is not None:
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

    async def on_transcription_started(self, payload: dict[str, Any]) -> None:
        logger.info("Transcription started: %s", payload)

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

        for segment_data in segments:
            text = segment_data.get("text", "").strip()
            if not text:
                continue

            absolute_start_time = segment_data.get("absolute_start_time")
            if not absolute_start_time:
                continue

            speaker = segment_data.get("speaker", "Unknown")
            segment_id = generate_segment_id(
                playlist_id, version_id, speaker, absolute_start_time
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

    async def on_transcription_error(self, payload: dict[str, Any]) -> None:
        logger.error("Transcription error: %s", payload)

    async def on_bot_status_changed(self, payload: dict[str, Any]) -> None:
        logger.info("Bot status changed: %s", payload)

    async def on_playlist_updated(self, payload: dict[str, Any]) -> None:
        logger.info("Playlist updated: %s", payload)

    async def on_version_updated(self, payload: dict[str, Any]) -> None:
        logger.info("Version updated: %s", payload)

    async def on_draft_note_updated(self, payload: dict[str, Any]) -> None:
        logger.info("Draft note updated: %s", payload)

    async def on_segment_created(self, payload: dict[str, Any]) -> None:
        """Published for UI consumption - no action needed in worker."""
        pass

    async def on_segment_updated(self, payload: dict[str, Any]) -> None:
        """Published for UI consumption - no action needed in worker."""
        pass

    async def start(self) -> None:
        await self.connect()
        await self.init_providers()
        await self.resubscribe_to_active_meetings()

        if self.channel is None:
            raise RuntimeError("Channel not initialized")

        queue = await self.channel.get_queue(EVENTS_QUEUE)
        await queue.consume(self.process_message)

        logger.info("Worker started, waiting for events...")

        while not self.should_stop:
            await asyncio.sleep(1)

    async def stop(self) -> None:
        logger.info("Stopping worker...")
        self.should_stop = True

        if self.transcription_provider:
            await self.transcription_provider.close()

        if self.event_publisher:
            await self.event_publisher.close()

        if self.connection:
            await self.connection.close()

        logger.info("Worker stopped")


async def main() -> None:
    worker = EventWorker()

    loop = asyncio.get_event_loop()

    def signal_handler() -> None:
        logger.info("Received shutdown signal")
        asyncio.create_task(worker.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await worker.start()
    except KeyboardInterrupt:
        await worker.stop()
    except Exception as e:
        logger.exception("Worker failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
