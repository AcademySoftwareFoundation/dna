"""Tests for the TranscriptionService (session-scoped routing)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.events import EventType
from dna.models.session import Session
from dna.transcription_service import TranscriptionService

SESSION_ID = "507f1f77bcf86cd799439011"


def make_session(**overrides) -> Session:
    data = {
        "_id": SESSION_ID,
        "external_id": None,
        "project_id": "124",
        "name": "Morning",
        "playlist_ids": ["42"],
        "in_review_playlist_id": "42",
        "in_review_version_id": "7",
        "in_review_pinned": False,
        "meeting_id": "abc-def-ghi",
        "platform": "google_meet",
        "vexa_meeting_id": 123,
        "transcription_paused": False,
        "transcription_resumed_at": None,
    }
    data.update(overrides)
    return Session(**data)


@pytest.fixture
def mock_transcription_provider():
    provider = AsyncMock()
    provider.subscribe_to_meeting = AsyncMock()
    provider.unsubscribe_from_meeting = AsyncMock()
    provider.get_active_bots = AsyncMock(return_value=[])
    provider.register_meeting_id_mapping = MagicMock()
    provider.close = AsyncMock()
    return provider


@pytest.fixture
def mock_storage_provider():
    provider = AsyncMock()
    provider.get_session_by_meeting_id = AsyncMock(return_value=None)
    provider.get_session = AsyncMock(return_value=None)
    provider.get_sessions_containing_playlist = AsyncMock(return_value=[])
    provider.upsert_segment = AsyncMock()
    return provider


@pytest.fixture
def mock_event_publisher():
    publisher = AsyncMock()
    publisher.connect = AsyncMock()
    publisher.publish = AsyncMock()
    publisher.close = AsyncMock()
    return publisher


@pytest.fixture
def service(mock_transcription_provider, mock_storage_provider, mock_event_publisher):
    return TranscriptionService(
        transcription_provider=mock_transcription_provider,
        storage_provider=mock_storage_provider,
        event_publisher=mock_event_publisher,
    )


class TestSubscribeToMeeting:
    """Tests for subscription handling."""

    @pytest.mark.asyncio
    async def test_subscribes_to_meeting(self, service, mock_transcription_provider):
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            session_id=SESSION_ID,
        )

        mock_transcription_provider.subscribe_to_meeting.assert_called_once()
        call_kwargs = mock_transcription_provider.subscribe_to_meeting.call_args.kwargs
        assert call_kwargs["platform"] == "google_meet"
        assert call_kwargs["meeting_id"] == "abc-def-ghi"
        assert callable(call_kwargs["on_event"])

    @pytest.mark.asyncio
    async def test_stores_session_mapping(self, service):
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            session_id=SESSION_ID,
        )

        assert service._meeting_to_session["google_meet:abc-def-ghi"] == SESSION_ID

    @pytest.mark.asyncio
    async def test_tracks_subscribed_meetings(self, service):
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            session_id=SESSION_ID,
        )

        assert "google_meet:abc-def-ghi" in service._subscribed_meetings

    @pytest.mark.asyncio
    async def test_skips_duplicate_subscription(
        self, service, mock_transcription_provider
    ):
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            session_id=SESSION_ID,
        )
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            session_id=SESSION_ID,
        )

        assert mock_transcription_provider.subscribe_to_meeting.call_count == 1

    @pytest.mark.asyncio
    async def test_handles_provider_not_initialized(self, service, caplog):
        service.transcription_provider = None

        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            session_id=SESSION_ID,
        )

        assert "Transcription provider not initialized" in caplog.text


class TestOnVexaEvent:
    """Tests for Vexa event forwarding."""

    @pytest.mark.asyncio
    async def test_forwards_transcript_updated(self, service):
        service.on_transcription_updated = AsyncMock()
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "speaker": "Alice",
            "confirmed": [],
            "pending": [],
            "ts": "2026-01-23T04:00:05.000Z",
        }

        await service._on_vexa_event("transcript.updated", payload)

        service.on_transcription_updated.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_forwards_bot_status_changed(self, service, mock_event_publisher):
        payload = {"status": "in_meeting", "platform": "google_meet", "meeting_id": "x"}

        await service._on_vexa_event("bot.status_changed", payload)

        mock_event_publisher.publish.assert_called_once_with(
            EventType.BOT_STATUS_CHANGED,
            payload,
        )

    @pytest.mark.asyncio
    async def test_publishes_completed_on_status_completed(
        self, service, mock_event_publisher
    ):
        payload = {"status": "completed", "platform": "google_meet", "meeting_id": "x"}

        await service._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == EventType.BOT_STATUS_CHANGED
        assert calls[1][0][0] == EventType.TRANSCRIPTION_COMPLETED

    @pytest.mark.asyncio
    async def test_publishes_error_on_status_failed(
        self, service, mock_event_publisher
    ):
        payload = {"status": "failed", "platform": "google_meet", "meeting_id": "x"}

        await service._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert calls[1][0][0] == EventType.TRANSCRIPTION_ERROR

    @pytest.mark.asyncio
    async def test_publishes_error_on_status_stopped(
        self, service, mock_event_publisher
    ):
        payload = {"status": "stopped", "platform": "google_meet", "meeting_id": "x"}

        await service._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert calls[1][0][0] == EventType.TRANSCRIPTION_ERROR

    @pytest.mark.asyncio
    async def test_handles_unknown_vexa_event(
        self, service, mock_event_publisher, caplog
    ):
        await service._on_vexa_event("unknown.event", {})

        mock_event_publisher.publish.assert_not_called()
        assert "Unknown Vexa event type" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_uninitialized_publisher(self, service, caplog):
        service.event_publisher = None

        await service._on_vexa_event("transcript.updated", {})

        assert "Event publisher not initialized" in caplog.text


class TestResubscribeToActiveMeetings:
    """Tests for recovery/resubscription on startup."""

    @pytest.fixture
    def active_bots(self):
        return [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
                "meeting_id": 123,
            },
            {
                "platform": "zoom",
                "native_meeting_id": "123456789",
                "status": "waiting",
                "meeting_id": 456,
            },
        ]

    @pytest.fixture
    def dna_session(self):
        return make_session()

    @pytest.mark.asyncio
    async def test_resubscribes_to_active_bots(
        self,
        service,
        mock_transcription_provider,
        mock_storage_provider,
        active_bots,
        dna_session,
    ):
        mock_transcription_provider.get_active_bots.return_value = active_bots
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session

        await service.resubscribe_to_active_meetings()

        assert mock_transcription_provider.subscribe_to_meeting.call_count == 2

    @pytest.mark.asyncio
    async def test_registers_meeting_id_mapping_from_session(
        self,
        service,
        mock_transcription_provider,
        mock_storage_provider,
        dna_session,
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.register_meeting_id_mapping.assert_called_once_with(
            123, "google_meet", "abc-def-ghi"
        )

    @pytest.mark.asyncio
    async def test_registers_meeting_id_mapping_from_bot(
        self, service, mock_transcription_provider, mock_storage_provider
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
                "meeting_id": 789,
            }
        ]
        mock_storage_provider.get_session_by_meeting_id.return_value = make_session(
            vexa_meeting_id=None
        )

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.register_meeting_id_mapping.assert_called_once_with(
            789, "google_meet", "abc-def-ghi"
        )

    @pytest.mark.asyncio
    async def test_stores_session_mapping(
        self,
        service,
        mock_transcription_provider,
        mock_storage_provider,
        dna_session,
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session

        await service.resubscribe_to_active_meetings()

        assert service._meeting_to_session["google_meet:abc-def-ghi"] == SESSION_ID

    @pytest.mark.asyncio
    async def test_skips_completed_bots(
        self, service, mock_transcription_provider, mock_storage_provider
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "completed",
            }
        ]

        await service.resubscribe_to_active_meetings()

        mock_storage_provider.get_session_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_bots_without_session(
        self, service, mock_transcription_provider, mock_storage_provider, caplog
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]
        mock_storage_provider.get_session_by_meeting_id.return_value = None

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "No DNA session found for meeting" in caplog.text

    @pytest.mark.asyncio
    async def test_skips_bots_without_platform(
        self, service, mock_transcription_provider, caplog
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "Skipping bot with missing platform/meeting_id" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_no_active_bots(self, service, mock_transcription_provider):
        mock_transcription_provider.get_active_bots.return_value = []

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_provider_error(
        self, service, mock_transcription_provider, caplog
    ):
        mock_transcription_provider.get_active_bots.side_effect = Exception("API error")

        await service.resubscribe_to_active_meetings()

        assert "Error during resubscription" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_uninitialized_providers(self, service, caplog):
        service.transcription_provider = None

        await service.resubscribe_to_active_meetings()

        assert "Providers not initialized" in caplog.text

    @pytest.mark.asyncio
    async def test_publishes_recovery_status_events(
        self,
        service,
        mock_transcription_provider,
        mock_storage_provider,
        mock_event_publisher,
        dna_session,
    ):
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
                "meeting_id": 123,
            }
        ]
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session

        await service.resubscribe_to_active_meetings()

        mock_event_publisher.publish.assert_called_once_with(
            EventType.BOT_STATUS_CHANGED,
            {
                "platform": "google_meet",
                "meeting_id": "abc-def-ghi",
                "session_id": SESSION_ID,
                "playlist_id": "42",
                "status": "in_meeting",
                "recovered": True,
            },
        )


class TestOnTranscriptionUpdated:
    """Tests for session-routed transcript storage."""

    @pytest.fixture
    def service_ready(
        self,
        mock_transcription_provider,
        mock_storage_provider,
        mock_event_publisher,
    ):
        return TranscriptionService(
            transcription_provider=mock_transcription_provider,
            storage_provider=mock_storage_provider,
            event_publisher=mock_event_publisher,
        )

    @pytest.fixture
    def dna_session(self):
        return make_session(meeting_id="abc-def")

    def _payload(self, **overrides):
        base = {
            "platform": "google_meet",
            "meeting_id": "abc-def",
            "speaker": "Alice",
            "confirmed": [],
            "pending": [],
            "ts": "2026-04-20T19:00:00.000Z",
        }
        base.update(overrides)
        return base

    def _seg(self, **overrides):
        seg = {
            "segment_id": "abc:speaker-0:1",
            "text": "hello world",
            "speaker": "Alice",
            "language": "en",
            "start_time": 0.0,
            "end_time": 1.0,
            "absolute_start_time": "2026-04-20T19:00:00.000Z",
            "absolute_end_time": "2026-04-20T19:00:01.000Z",
            "updated_at": "2026-04-20T19:00:01.500Z",
        }
        seg.update(overrides)
        return seg

    @pytest.mark.asyncio
    async def test_upserts_confirmed_and_broadcasts_flat_shape(
        self, service_ready, mock_storage_provider, mock_event_publisher, dna_session
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session
        seg = self._seg()

        await service_ready.on_transcription_updated(
            self._payload(confirmed=[seg], pending=[{"segment_id": "p1"}])
        )

        mock_storage_provider.upsert_segment.assert_called_once()
        kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert kwargs["playlist_id"] == "42"
        assert kwargs["version_id"] == "7"
        assert kwargs["segment_id"] == "abc:speaker-0:1"

        msg = mock_event_publisher.ws_manager.broadcast.call_args.args[0]
        assert msg["type"] == "transcript"
        assert msg["playlist_id"] == "42"
        assert msg["version_id"] == "7"
        assert msg["session_id"] == SESSION_ID

    @pytest.mark.asyncio
    async def test_returns_when_storage_provider_missing(self, service_ready, caplog):
        service_ready.storage_provider = None
        await service_ready.on_transcription_updated(self._payload())
        assert "Providers not initialized" in caplog.text

    @pytest.mark.asyncio
    async def test_returns_when_no_session(
        self, service_ready, mock_storage_provider, caplog
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = None
        await service_ready.on_transcription_updated(
            self._payload(meeting_id="not-mapped")
        )
        mock_storage_provider.upsert_segment.assert_not_called()
        assert "No DNA session found for meeting" in caplog.text

    @pytest.mark.asyncio
    async def test_returns_when_no_in_review_pair(
        self, service_ready, mock_storage_provider, mock_event_publisher, caplog
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = make_session(
            meeting_id="abc-def",
            in_review_playlist_id=None,
            in_review_version_id=None,
        )
        await service_ready.on_transcription_updated(
            self._payload(confirmed=[self._seg()])
        )
        mock_storage_provider.upsert_segment.assert_not_called()
        mock_event_publisher.ws_manager.broadcast.assert_not_called()
        assert "has no in_review playlist/version" in caplog.text

    @pytest.mark.asyncio
    async def test_returns_when_paused(
        self, service_ready, mock_storage_provider, mock_event_publisher
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = make_session(
            meeting_id="abc-def",
            transcription_paused=True,
        )
        await service_ready.on_transcription_updated(
            self._payload(confirmed=[self._seg()])
        )
        mock_storage_provider.upsert_segment.assert_not_called()
        mock_event_publisher.ws_manager.broadcast.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_segment_before_resumed_at(
        self, service_ready, mock_storage_provider
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = make_session(
            meeting_id="abc-def",
            transcription_resumed_at=datetime(
                2026, 4, 20, 19, 0, 30, tzinfo=timezone.utc
            ),
        )

        old = self._seg(
            segment_id="old", absolute_start_time="2026-04-20T19:00:00.000Z"
        )
        new = self._seg(
            segment_id="new", absolute_start_time="2026-04-20T19:01:00.000Z"
        )

        await service_ready.on_transcription_updated(
            self._payload(confirmed=[old, new])
        )

        ids = [
            c.kwargs["segment_id"]
            for c in mock_storage_provider.upsert_segment.call_args_list
        ]
        assert ids == ["new"]

    @pytest.mark.asyncio
    async def test_handles_naive_resumed_at(self, service_ready, mock_storage_provider):
        mock_storage_provider.get_session_by_meeting_id.return_value = make_session(
            meeting_id="abc-def",
            transcription_resumed_at=datetime(2026, 4, 20, 19, 0, 30),
        )

        await service_ready.on_transcription_updated(
            self._payload(
                confirmed=[
                    self._seg(absolute_start_time="2026-04-20T19:01:00.000Z"),
                ]
            )
        )

        mock_storage_provider.upsert_segment.assert_called_once()

    @pytest.mark.asyncio
    async def test_swallows_invalid_absolute_start_time(
        self, service_ready, mock_storage_provider
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = make_session(
            meeting_id="abc-def",
            transcription_resumed_at=datetime(
                2026, 4, 20, 19, 0, 30, tzinfo=timezone.utc
            ),
        )

        await service_ready.on_transcription_updated(
            self._payload(confirmed=[self._seg(absolute_start_time="not-a-date")])
        )
        mock_storage_provider.upsert_segment.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_segments_missing_required_fields(
        self, service_ready, mock_storage_provider, dna_session
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session

        await service_ready.on_transcription_updated(
            self._payload(
                confirmed=[
                    self._seg(segment_id=""),
                    self._seg(absolute_start_time=""),
                    self._seg(text=""),
                    self._seg(text="   "),
                ]
            )
        )
        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_falls_back_to_top_level_speaker(
        self, service_ready, mock_storage_provider, dna_session
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session

        await service_ready.on_transcription_updated(
            self._payload(
                speaker="Bob",
                confirmed=[self._seg(speaker=None, segment_id="x")],
            )
        )
        kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert kwargs["data"].speaker == "Bob"

    @pytest.mark.asyncio
    async def test_logs_and_continues_on_upsert_failure(
        self,
        service_ready,
        mock_storage_provider,
        mock_event_publisher,
        dna_session,
        caplog,
    ):
        mock_storage_provider.get_session_by_meeting_id.return_value = dna_session
        mock_storage_provider.upsert_segment.side_effect = RuntimeError("boom")

        await service_ready.on_transcription_updated(
            self._payload(confirmed=[self._seg()])
        )

        assert "Failed to upsert segment" in caplog.text
        mock_event_publisher.ws_manager.broadcast.assert_called_once()


class TestTranscriptionServiceLifecycle:
    """Tests for TranscriptionService initialization and cleanup."""

    @pytest.mark.asyncio
    async def test_init_providers_initializes_all(self, service):
        service.transcription_provider = None
        service.storage_provider = None
        service.event_publisher = None

        await service.init_providers()

        assert service.transcription_provider is not None
        assert service.storage_provider is not None
        assert service.event_publisher is not None

    @pytest.mark.asyncio
    async def test_close_cleans_up_resources(
        self, service, mock_transcription_provider
    ):
        service._subscribed_meetings.add("google_meet:test")
        service._meeting_to_session["google_meet:test"] = SESSION_ID

        await service.close()

        mock_transcription_provider.close.assert_called_once()
        assert len(service._subscribed_meetings) == 0
        assert len(service._meeting_to_session) == 0


class TestIngestExtensionTranscript:
    """Tests for extension ingest via session_id or playlist_id."""

    @pytest.fixture
    def service_ready(
        self,
        mock_transcription_provider,
        mock_storage_provider,
        mock_event_publisher,
    ):
        return TranscriptionService(
            transcription_provider=mock_transcription_provider,
            storage_provider=mock_storage_provider,
            event_publisher=mock_event_publisher,
        )

    @pytest.fixture
    def dna_session(self):
        return make_session(meeting_id=None)

    def _seg(self, **overrides):
        seg = {
            "segment_id": "ext:speaker-0:1",
            "text": "hello from extension",
            "speaker": "Alice",
            "language": "en",
            "start_time": 0.0,
            "end_time": 1.0,
            "absolute_start_time": "2026-04-20T19:00:00.000Z",
            "absolute_end_time": "2026-04-20T19:00:01.000Z",
            "updated_at": "2026-04-20T19:00:01.500Z",
        }
        seg.update(overrides)
        return seg

    def _payload(self, **overrides):
        base = {
            "type": "transcript",
            "playlist_id": 42,
            "speaker": "Alice",
            "confirmed": [],
            "pending": [],
            "ts": "2026-04-20T19:00:00.000Z",
        }
        base.update(overrides)
        return base

    @pytest.mark.asyncio
    async def test_upserts_via_session_id(
        self, service_ready, mock_storage_provider, mock_event_publisher, dna_session
    ):
        mock_storage_provider.get_session.return_value = dna_session
        seg = self._seg()

        stored = await service_ready.ingest_extension_transcript(
            self._payload(
                session_id=SESSION_ID,
                confirmed=[seg],
                pending=[{"segment_id": "p1"}],
            )
        )

        assert stored == 1
        kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert kwargs["playlist_id"] == "42"
        assert kwargs["version_id"] == "7"
        msg = mock_event_publisher.ws_manager.broadcast.call_args.args[0]
        assert msg["session_id"] == SESSION_ID

    @pytest.mark.asyncio
    async def test_upserts_via_playlist_id_legacy(
        self, service_ready, mock_storage_provider, dna_session
    ):
        mock_storage_provider.get_sessions_containing_playlist.return_value = [
            dna_session
        ]

        stored = await service_ready.ingest_extension_transcript(
            self._payload(playlist_id="42", confirmed=[self._seg()])
        )

        assert stored == 1
        mock_storage_provider.get_sessions_containing_playlist.assert_awaited_with("42")

    @pytest.mark.asyncio
    async def test_returns_zero_when_providers_missing(self, service_ready, caplog):
        service_ready.storage_provider = None
        stored = await service_ready.ingest_extension_transcript(self._payload())
        assert stored == 0
        assert "Providers not initialized" in caplog.text

    @pytest.mark.asyncio
    async def test_returns_zero_when_ids_missing(
        self, service_ready, mock_storage_provider, caplog
    ):
        payload = self._payload()
        del payload["playlist_id"]
        stored = await service_ready.ingest_extension_transcript(payload)
        assert stored == 0
        mock_storage_provider.upsert_segment.assert_not_called()
        assert "missing session_id/playlist_id" in caplog.text

    @pytest.mark.asyncio
    async def test_returns_zero_when_session_missing(
        self, service_ready, mock_storage_provider, mock_event_publisher
    ):
        mock_storage_provider.get_session.return_value = None
        stored = await service_ready.ingest_extension_transcript(
            self._payload(session_id=SESSION_ID, confirmed=[self._seg()])
        )
        assert stored == 0
        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_zero_when_paused(
        self, service_ready, mock_storage_provider, mock_event_publisher
    ):
        mock_storage_provider.get_session.return_value = make_session(
            transcription_paused=True
        )
        stored = await service_ready.ingest_extension_transcript(
            self._payload(session_id=SESSION_ID, confirmed=[self._seg()])
        )
        assert stored == 0
        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_in_review_on_playlist(
        self, service_ready, mock_storage_provider, caplog
    ):
        mock_storage_provider.get_sessions_containing_playlist.return_value = [
            make_session(in_review_playlist_id="99", in_review_version_id="1")
        ]
        stored = await service_ready.ingest_extension_transcript(
            self._payload(playlist_id="42", confirmed=[self._seg()])
        )
        assert stored == 0
        assert "No DNA session with in_review on playlist" in caplog.text
