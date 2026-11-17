"""Transcription service for managing Vexa subscriptions and segment processing."""

import logging
from datetime import datetime, timezone
from typing import Any

from dna.events import EventPublisher, EventType, get_event_publisher
from dna.models.stored_segment import StoredSegmentCreate
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
        self._meeting_to_session: dict[str, str] = {}

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

                dna_session = await self.storage_provider.get_session_by_meeting_id(
                    native_meeting_id
                )
                if dna_session is None:
                    logger.warning(
                        "No DNA session found for meeting %s, skipping",
                        native_meeting_id,
                    )
                    continue

                meeting_key = f"{platform}:{native_meeting_id}"
                self._meeting_to_session[meeting_key] = dna_session.id

                internal_meeting_id = (
                    dna_session.vexa_meeting_id
                    or bot.get("meeting_id")
                    or bot.get("id")
                )
                if internal_meeting_id is not None:
                    self.transcription_provider.register_meeting_id_mapping(
                        internal_meeting_id, platform, native_meeting_id
                    )

                logger.info(
                    "Resubscribing to meeting %s (session_id: %s, vexa_id: %s, status: %s)",
                    meeting_key,
                    dna_session.id,
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
                                "session_id": dna_session.id,
                                "playlist_id": dna_session.in_review_playlist_id,
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
        self,
        platform: str,
        meeting_id: str,
        session_id: str,
    ) -> None:
        """Subscribe to Vexa updates for a meeting bound to a DNA session."""
        if self.transcription_provider is None:
            logger.error("Transcription provider not initialized")
            return

        meeting_key = f"{platform}:{meeting_id}"
        self._meeting_to_session[meeting_key] = session_id

        if meeting_key in self._subscribed_meetings:
            logger.info("Already subscribed to meeting: %s", meeting_key)
            return

        logger.info(
            "Subscribing to Vexa updates for meeting: %s (session_id: %s)",
            meeting_key,
            session_id,
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
        """Upsert confirmed segments for the session's in-review pair, then
        broadcast the flat transcript envelope to DNA WS clients.
        """
        if self.storage_provider is None or self.event_publisher is None:
            logger.error("Providers not initialized")
            return

        platform = payload.get("platform", "")
        meeting_id = payload.get("meeting_id", "")
        speaker = payload.get("speaker")
        confirmed: list[dict[str, Any]] = payload.get("confirmed", []) or []
        pending: list[dict[str, Any]] = payload.get("pending", []) or []
        ts = payload.get("ts")

        meeting_key = f"{platform}:{meeting_id}"
        dna_session = await self.storage_provider.get_session_by_meeting_id(meeting_id)
        if dna_session is None:
            logger.warning(
                "No DNA session found for meeting %s, cannot save segments",
                meeting_key,
            )
            return

        if dna_session.transcription_paused:
            logger.debug(
                "Transcription paused for session %s, dropping segments",
                dna_session.id,
            )
            return

        if (
            not dna_session.in_review_playlist_id
            or not dna_session.in_review_version_id
        ):
            logger.warning(
                "Session %s has no in_review playlist/version for meeting %s, "
                "cannot save segments",
                dna_session.id,
                meeting_key,
            )
            return

        await self._store_and_broadcast(
            playlist_id=dna_session.in_review_playlist_id,
            version_id=dna_session.in_review_version_id,
            resumed_at=dna_session.transcription_resumed_at,
            speaker=speaker,
            confirmed=confirmed,
            pending=pending,
            ts=ts,
            session_id=dna_session.id,
        )

    async def ingest_extension_transcript(self, payload: dict[str, Any]) -> int:
        """Ingest a transcript frame produced by the DNA browser extension.

        The extension may send ``session_id`` (preferred) or ``playlist_id``.
        Confirmed segments are upserted and the same flat ``{type:"transcript",
        ...}`` envelope is broadcast to DNA WS clients.

        Returns the number of confirmed segments stored.
        """
        if self.storage_provider is None or self.event_publisher is None:
            logger.error("Providers not initialized")
            return 0

        speaker = payload.get("speaker")
        confirmed: list[dict[str, Any]] = payload.get("confirmed", []) or []
        pending: list[dict[str, Any]] = payload.get("pending", []) or []
        ts = payload.get("ts")

        session_id = payload.get("session_id")
        if session_id:
            dna_session = await self.storage_provider.get_session(str(session_id))
            if dna_session is None:
                logger.warning(
                    "Extension transcript session %s not found, cannot save",
                    session_id,
                )
                return 0
            if dna_session.transcription_paused:
                logger.debug(
                    "Transcription paused for session %s, skipping", dna_session.id
                )
                return 0
            if (
                not dna_session.in_review_playlist_id
                or not dna_session.in_review_version_id
            ):
                logger.warning(
                    "Session %s has no in_review pair, cannot save segments",
                    dna_session.id,
                )
                return 0
            return await self._store_and_broadcast(
                playlist_id=dna_session.in_review_playlist_id,
                version_id=dna_session.in_review_version_id,
                resumed_at=dna_session.transcription_resumed_at,
                speaker=speaker,
                confirmed=confirmed,
                pending=pending,
                ts=ts,
                session_id=dna_session.id,
            )

        playlist_id = payload.get("playlist_id")
        if playlist_id is None:
            logger.warning(
                "Extension transcript missing session_id/playlist_id, cannot save"
            )
            return 0

        # Legacy extension frames: look up an implicit session for the playlist
        # or fall back to any session whose in_review playlist matches.
        return await self._store_extension_by_playlist(
            str(playlist_id), speaker, confirmed, pending, ts
        )

    async def _store_extension_by_playlist(
        self,
        playlist_id: str,
        speaker: Any,
        confirmed: list[dict[str, Any]],
        pending: list[dict[str, Any]],
        ts: Any,
    ) -> int:
        """Resolve in-review from a DNA session that targets this playlist."""
        if self.storage_provider is None:
            return 0
        sessions = await self.storage_provider.get_sessions_containing_playlist(
            playlist_id
        )
        target = next(
            (
                s
                for s in sessions
                if s.in_review_playlist_id == playlist_id
                and s.in_review_version_id
                and not s.transcription_paused
            ),
            None,
        )
        if target is None:
            logger.warning(
                "No DNA session with in_review on playlist %s, cannot save segments",
                playlist_id,
            )
            return 0
        return await self._store_and_broadcast(
            playlist_id=target.in_review_playlist_id or playlist_id,
            version_id=target.in_review_version_id or "",
            resumed_at=target.transcription_resumed_at,
            speaker=speaker,
            confirmed=confirmed,
            pending=pending,
            ts=ts,
            session_id=target.id,
        )

    async def _store_and_broadcast(
        self,
        playlist_id: str,
        version_id: str,
        resumed_at: datetime | None,
        speaker: Any,
        confirmed: list[dict[str, Any]],
        pending: list[dict[str, Any]],
        ts: Any,
        session_id: str | None = None,
    ) -> int:
        """Upsert confirmed segments and broadcast the flat transcript envelope."""
        if self.storage_provider is None or self.event_publisher is None:
            logger.error("Providers not initialized")
            return 0

        stored = 0

        for seg in confirmed:
            segment_id = seg.get("segment_id")
            absolute_start_time = seg.get("absolute_start_time")
            text = (seg.get("text") or "").strip()
            if not segment_id or not absolute_start_time or not text:
                continue

            if resumed_at is not None:
                try:
                    segment_time = datetime.fromisoformat(
                        absolute_start_time.replace("Z", "+00:00")
                    )
                    resumed_at_aware = (
                        resumed_at
                        if resumed_at.tzinfo is not None
                        else resumed_at.replace(tzinfo=timezone.utc)
                    )
                    if segment_time < resumed_at_aware:
                        continue
                except ValueError:
                    pass

            segment_create = StoredSegmentCreate(
                segment_id=segment_id,
                text=text,
                speaker=seg.get("speaker") or speaker,
                language=seg.get("language"),
                start_time=seg.get("start_time"),
                end_time=seg.get("end_time"),
                completed=True,
                absolute_start_time=absolute_start_time,
                absolute_end_time=seg.get("absolute_end_time", ""),
                vexa_updated_at=seg.get("updated_at"),
            )

            try:
                await self.storage_provider.upsert_segment(
                    playlist_id=playlist_id,
                    version_id=version_id,
                    segment_id=segment_id,
                    data=segment_create,
                )
                stored += 1
            except Exception:
                logger.exception("Failed to upsert segment %s", segment_id)

        envelope: dict[str, Any] = {
            "type": "transcript",
            "speaker": speaker,
            "confirmed": confirmed,
            "pending": pending,
            "playlist_id": playlist_id,
            "version_id": version_id,
            "ts": ts,
        }
        if session_id is not None:
            envelope["session_id"] = session_id

        await self.event_publisher.ws_manager.broadcast(envelope)
        return stored

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

            if meeting_key in self._meeting_to_session:
                del self._meeting_to_session[meeting_key]
                logger.info(
                    "Removed session mapping for completed meeting: %s", meeting_key
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
        self._meeting_to_session.clear()
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
