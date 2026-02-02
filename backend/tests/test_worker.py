"""Tests for RabbitMQ event consumer worker."""

from unittest import mock
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from worker import EventWorker

from dna.events import EventType
from dna.models.playlist_metadata import PlaylistMetadata
from dna.models.stored_segment import StoredSegment, generate_segment_id


@pytest.fixture
def mock_transcription_provider():
    """Create a mock transcription provider."""
    provider = AsyncMock()
    provider.subscribe_to_meeting = AsyncMock()
    provider.get_active_bots = AsyncMock(return_value=[])
    provider.register_meeting_id_mapping = MagicMock()
    provider.close = AsyncMock()
    return provider


@pytest.fixture
def mock_storage_provider():
    """Create a mock storage provider."""
    provider = AsyncMock()
    provider.get_playlist_metadata = AsyncMock()
    provider.get_playlist_metadata_by_meeting_id = AsyncMock()
    provider.upsert_segment = AsyncMock()
    return provider


@pytest.fixture
def mock_event_publisher():
    """Create a mock event publisher."""
    publisher = AsyncMock()
    publisher.connect = AsyncMock()
    publisher.publish = AsyncMock()
    publisher.close = AsyncMock()
    return publisher


@pytest.fixture
def worker(mock_transcription_provider, mock_storage_provider, mock_event_publisher):
    """Create an EventWorker with mocked providers."""
    w = EventWorker()
    w.transcription_provider = mock_transcription_provider
    w.storage_provider = mock_storage_provider
    w.event_publisher = mock_event_publisher
    return w


class TestHandleEvent:
    """Tests for event routing."""

    @pytest.mark.asyncio
    async def test_routes_transcription_subscribe(self, worker):
        """Test that TRANSCRIPTION_SUBSCRIBE routes to correct handler."""
        payload = {"platform": "google_meet", "meeting_id": "abc-def", "playlist_id": 1}

        with patch.object(
            worker, "on_transcription_subscribe", new_callable=AsyncMock
        ) as mock_handler:
            await worker.handle_event(EventType.TRANSCRIPTION_SUBSCRIBE, payload)
            mock_handler.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_routes_transcription_updated(self, worker):
        """Test that TRANSCRIPTION_UPDATED routes to correct handler."""
        payload = {"platform": "google_meet", "meeting_id": "abc-def", "segments": []}

        with patch.object(
            worker, "on_transcription_updated", new_callable=AsyncMock
        ) as mock_handler:
            await worker.handle_event(EventType.TRANSCRIPTION_UPDATED, payload)
            mock_handler.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_routes_bot_status_changed(self, worker):
        """Test that BOT_STATUS_CHANGED routes to correct handler."""
        payload = {"status": "in_meeting"}

        with patch.object(
            worker, "on_bot_status_changed", new_callable=AsyncMock
        ) as mock_handler:
            await worker.handle_event(EventType.BOT_STATUS_CHANGED, payload)
            mock_handler.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_routes_segment_created(self, worker):
        """Test that SEGMENT_CREATED routes to correct handler."""
        payload = {"segment_id": "abc123"}

        with patch.object(
            worker, "on_segment_created", new_callable=AsyncMock
        ) as mock_handler:
            await worker.handle_event(EventType.SEGMENT_CREATED, payload)
            mock_handler.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_routes_segment_updated(self, worker):
        """Test that SEGMENT_UPDATED routes to correct handler."""
        payload = {"segment_id": "abc123"}

        with patch.object(
            worker, "on_segment_updated", new_callable=AsyncMock
        ) as mock_handler:
            await worker.handle_event(EventType.SEGMENT_UPDATED, payload)
            mock_handler.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_unknown_event_logged(self, worker, caplog):
        """Test that unknown events are logged as warnings."""
        await worker.handle_event("unknown.event", {})
        assert "Unknown event type: unknown.event" in caplog.text


class TestOnTranscriptionSubscribe:
    """Tests for subscription handling."""

    @pytest.mark.asyncio
    async def test_subscribes_to_meeting(self, worker, mock_transcription_provider):
        """Test that subscribe_to_meeting is called with correct args."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "playlist_id": 42,
        }

        await worker.on_transcription_subscribe(payload)

        mock_transcription_provider.subscribe_to_meeting.assert_called_once()
        call_kwargs = mock_transcription_provider.subscribe_to_meeting.call_args.kwargs
        assert call_kwargs["platform"] == "google_meet"
        assert call_kwargs["meeting_id"] == "abc-def-ghi"
        assert callable(call_kwargs["on_event"])

    @pytest.mark.asyncio
    async def test_stores_playlist_mapping(self, worker):
        """Test that playlist_id mapping is stored."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "playlist_id": 42,
        }

        await worker.on_transcription_subscribe(payload)

        assert worker._meeting_to_playlist["google_meet:abc-def-ghi"] == 42

    @pytest.mark.asyncio
    async def test_tracks_subscribed_meetings(self, worker):
        """Test that subscribed meetings are tracked."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "playlist_id": 42,
        }

        await worker.on_transcription_subscribe(payload)

        assert "google_meet:abc-def-ghi" in worker._subscribed_meetings

    @pytest.mark.asyncio
    async def test_skips_duplicate_subscription(
        self, worker, mock_transcription_provider
    ):
        """Test that duplicate subscriptions are skipped."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "playlist_id": 42,
        }

        await worker.on_transcription_subscribe(payload)
        await worker.on_transcription_subscribe(payload)

        assert mock_transcription_provider.subscribe_to_meeting.call_count == 1

    @pytest.mark.asyncio
    async def test_handles_missing_platform(
        self, worker, mock_transcription_provider, caplog
    ):
        """Test that missing platform is handled gracefully."""
        payload = {"meeting_id": "abc-def-ghi", "playlist_id": 42}

        await worker.on_transcription_subscribe(payload)

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "Missing platform or meeting_id" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_missing_meeting_id(
        self, worker, mock_transcription_provider, caplog
    ):
        """Test that missing meeting_id is handled gracefully."""
        payload = {"platform": "google_meet", "playlist_id": 42}

        await worker.on_transcription_subscribe(payload)

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "Missing platform or meeting_id" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_provider_not_initialized(self, worker, caplog):
        """Test handling when provider is not initialized."""
        worker.transcription_provider = None
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "playlist_id": 42,
        }

        await worker.on_transcription_subscribe(payload)

        assert "Transcription provider not initialized" in caplog.text


class TestOnTranscriptionUpdated:
    """Tests for transcript segment processing."""

    @pytest.fixture
    def sample_vexa_segments(self):
        """Sample Vexa transcript.mutable segments."""
        return [
            {
                "text": "Hello, this is a test.",
                "speaker": "John Doe",
                "language": "en",
                "absolute_start_time": "2026-01-23T04:00:00.000Z",
                "absolute_end_time": "2026-01-23T04:00:05.000Z",
                "updated_at": "2026-01-23T04:00:05.000Z",
            },
            {
                "text": "This is another segment.",
                "speaker": "Jane Smith",
                "language": "en",
                "absolute_start_time": "2026-01-23T04:00:05.000Z",
                "absolute_end_time": "2026-01-23T04:00:10.000Z",
                "updated_at": "2026-01-23T04:00:10.000Z",
            },
        ]

    @pytest.fixture
    def sample_metadata(self):
        """Sample playlist metadata with in_review version."""
        return PlaylistMetadata(
            _id="meta123",
            playlist_id=42,
            in_review=5,
            meeting_id="abc-def-ghi",
            platform="google_meet",
            vexa_meeting_id=123,
        )

    @pytest.mark.asyncio
    async def test_saves_segments_to_storage(
        self, worker, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that segments are saved to storage."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            True,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": sample_vexa_segments,
        }

        await worker.on_transcription_updated(payload)

        assert mock_storage_provider.upsert_segment.call_count == 2

    @pytest.mark.asyncio
    async def test_publishes_segment_created_event(
        self,
        worker,
        mock_storage_provider,
        mock_event_publisher,
        sample_vexa_segments,
        sample_metadata,
    ):
        """Test that SEGMENT_CREATED event is published for new segments."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            True,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [sample_vexa_segments[0]],
        }

        await worker.on_transcription_updated(payload)

        mock_event_publisher.publish.assert_called()
        call_args = mock_event_publisher.publish.call_args_list[0]
        assert call_args[0][0] == EventType.SEGMENT_CREATED
        assert call_args[0][1]["text"] == "Hello, this is a test."
        assert call_args[0][1]["speaker"] == "John Doe"

    @pytest.mark.asyncio
    async def test_publishes_segment_updated_event(
        self,
        worker,
        mock_storage_provider,
        mock_event_publisher,
        sample_vexa_segments,
        sample_metadata,
    ):
        """Test that SEGMENT_UPDATED event is published for existing segments."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            False,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [sample_vexa_segments[0]],
        }

        await worker.on_transcription_updated(payload)

        mock_event_publisher.publish.assert_called()
        call_args = mock_event_publisher.publish.call_args_list[0]
        assert call_args[0][0] == EventType.SEGMENT_UPDATED

    @pytest.mark.asyncio
    async def test_generates_correct_segment_id(
        self, worker, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that segment ID is generated correctly."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            True,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [sample_vexa_segments[0]],
        }

        await worker.on_transcription_updated(payload)

        expected_segment_id = generate_segment_id(
            playlist_id=42,
            version_id=5,
            speaker="John Doe",
            absolute_start_time="2026-01-23T04:00:00.000Z",
        )

        call_kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert call_kwargs["segment_id"] == expected_segment_id

    @pytest.mark.asyncio
    async def test_skips_empty_text_segments(
        self, worker, mock_storage_provider, sample_metadata
    ):
        """Test that segments with empty text are skipped."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [
                {
                    "text": "",
                    "speaker": "John Doe",
                    "absolute_start_time": "2026-01-23T04:00:00.000Z",
                },
                {
                    "text": "   ",
                    "speaker": "Jane Smith",
                    "absolute_start_time": "2026-01-23T04:00:05.000Z",
                },
            ],
        }

        await worker.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_segments_without_start_time(
        self, worker, mock_storage_provider, sample_metadata
    ):
        """Test that segments without absolute_start_time are skipped."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [
                {
                    "text": "Hello world",
                    "speaker": "John Doe",
                },
            ],
        }

        await worker.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_missing_playlist_mapping(
        self, worker, mock_storage_provider, sample_vexa_segments, caplog
    ):
        """Test handling when playlist mapping is not found."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": sample_vexa_segments,
        }

        await worker.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()
        assert "No playlist_id found for meeting" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_missing_in_review_version(
        self, worker, mock_storage_provider, sample_vexa_segments, caplog
    ):
        """Test handling when in_review version is not set."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = PlaylistMetadata(
            _id="meta123",
            playlist_id=42,
            in_review=None,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": sample_vexa_segments,
        }

        await worker.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()
        assert "No in_review version found" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_empty_segments_list(self, worker, mock_storage_provider):
        """Test handling when segments list is empty."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [],
        }

        await worker.on_transcription_updated(payload)

        mock_storage_provider.get_playlist_metadata.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_default_speaker_when_missing(
        self, worker, mock_storage_provider, mock_event_publisher, sample_metadata
    ):
        """Test that 'Unknown' is used as default speaker."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            True,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [
                {
                    "text": "Hello world",
                    "absolute_start_time": "2026-01-23T04:00:00.000Z",
                    "absolute_end_time": "2026-01-23T04:00:05.000Z",
                },
            ],
        }

        await worker.on_transcription_updated(payload)

        call_kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert call_kwargs["data"].speaker == "Unknown"

    @pytest.mark.asyncio
    async def test_skips_segments_when_transcription_paused(
        self, worker, mock_storage_provider, sample_vexa_segments, caplog
    ):
        """Test that segments are not saved when transcription is paused."""
        import logging

        caplog.set_level(logging.DEBUG)
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        paused_metadata = PlaylistMetadata(
            _id="meta123",
            playlist_id=42,
            in_review=5,
            meeting_id="abc-def-ghi",
            platform="google_meet",
            vexa_meeting_id=123,
            transcription_paused=True,
        )
        mock_storage_provider.get_playlist_metadata.return_value = paused_metadata

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": sample_vexa_segments,
        }

        await worker.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()
        assert "Transcription paused for playlist" in caplog.text

    @pytest.mark.asyncio
    async def test_saves_segments_when_transcription_not_paused(
        self, worker, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that segments are saved when transcription is not paused."""
        worker._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
        mock_storage_provider.get_playlist_metadata.return_value = sample_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            True,
        )

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": sample_vexa_segments,
        }

        await worker.on_transcription_updated(payload)

        assert mock_storage_provider.upsert_segment.call_count == 2


class TestOnVexaEvent:
    """Tests for Vexa event forwarding."""

    @pytest.mark.asyncio
    async def test_forwards_transcript_updated(self, worker, mock_event_publisher):
        """Test that transcript.updated is forwarded to RabbitMQ."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [],
        }

        await worker._on_vexa_event("transcript.updated", payload)

        mock_event_publisher.publish.assert_called_once_with(
            EventType.TRANSCRIPTION_UPDATED,
            payload,
        )

    @pytest.mark.asyncio
    async def test_forwards_bot_status_changed(self, worker, mock_event_publisher):
        """Test that bot.status_changed is forwarded to RabbitMQ."""
        payload = {"status": "in_meeting"}

        await worker._on_vexa_event("bot.status_changed", payload)

        mock_event_publisher.publish.assert_called_once_with(
            EventType.BOT_STATUS_CHANGED,
            payload,
        )

    @pytest.mark.asyncio
    async def test_publishes_completed_on_status_completed(
        self, worker, mock_event_publisher
    ):
        """Test that TRANSCRIPTION_COMPLETED is published when bot status is completed."""
        payload = {"status": "completed"}

        await worker._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == EventType.BOT_STATUS_CHANGED
        assert calls[1][0][0] == EventType.TRANSCRIPTION_COMPLETED

    @pytest.mark.asyncio
    async def test_publishes_error_on_status_failed(self, worker, mock_event_publisher):
        """Test that TRANSCRIPTION_ERROR is published when bot status is failed."""
        payload = {"status": "failed"}

        await worker._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == EventType.BOT_STATUS_CHANGED
        assert calls[1][0][0] == EventType.TRANSCRIPTION_ERROR

    @pytest.mark.asyncio
    async def test_publishes_error_on_status_stopped(
        self, worker, mock_event_publisher
    ):
        """Test that TRANSCRIPTION_ERROR is published when bot status is stopped."""
        payload = {"status": "stopped"}

        await worker._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == EventType.BOT_STATUS_CHANGED
        assert calls[1][0][0] == EventType.TRANSCRIPTION_ERROR

    @pytest.mark.asyncio
    async def test_handles_unknown_vexa_event(
        self, worker, mock_event_publisher, caplog
    ):
        """Test that unknown Vexa events are logged."""
        await worker._on_vexa_event("unknown.event", {})

        mock_event_publisher.publish.assert_not_called()
        assert "Unknown Vexa event type" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_uninitialized_publisher(self, worker, caplog):
        """Test handling when event publisher is not initialized."""
        worker.event_publisher = None

        await worker._on_vexa_event("transcript.updated", {})

        assert "Event publisher not initialized" in caplog.text


class TestResubscribeToActiveMeetings:
    """Tests for recovery/resubscription on startup."""

    @pytest.fixture
    def active_bots(self):
        """Sample active bots from Vexa."""
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
    def playlist_metadata(self):
        """Sample playlist metadata."""
        return PlaylistMetadata(
            _id="meta123",
            playlist_id=42,
            in_review=5,
            meeting_id="abc-def-ghi",
            platform="google_meet",
            vexa_meeting_id=123,
        )

    @pytest.mark.asyncio
    async def test_resubscribes_to_active_bots(
        self,
        worker,
        mock_transcription_provider,
        mock_storage_provider,
        active_bots,
        playlist_metadata,
    ):
        """Test that worker resubscribes to all active bots."""
        mock_transcription_provider.get_active_bots.return_value = active_bots
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = (
            playlist_metadata
        )

        await worker.resubscribe_to_active_meetings()

        assert mock_transcription_provider.subscribe_to_meeting.call_count == 2

    @pytest.mark.asyncio
    async def test_registers_meeting_id_mapping_from_metadata(
        self,
        worker,
        mock_transcription_provider,
        mock_storage_provider,
        playlist_metadata,
    ):
        """Test that vexa_meeting_id from metadata is used for mapping."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = (
            playlist_metadata
        )

        await worker.resubscribe_to_active_meetings()

        mock_transcription_provider.register_meeting_id_mapping.assert_called_once_with(
            123, "google_meet", "abc-def-ghi"
        )

    @pytest.mark.asyncio
    async def test_registers_meeting_id_mapping_from_bot(
        self, worker, mock_transcription_provider, mock_storage_provider
    ):
        """Test that meeting_id from bot is used when metadata doesn't have vexa_meeting_id."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
                "meeting_id": 789,
            }
        ]
        metadata = PlaylistMetadata(
            _id="meta123",
            playlist_id=42,
            in_review=5,
            meeting_id="abc-def-ghi",
        )
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = (
            metadata
        )

        await worker.resubscribe_to_active_meetings()

        mock_transcription_provider.register_meeting_id_mapping.assert_called_once_with(
            789, "google_meet", "abc-def-ghi"
        )

    @pytest.mark.asyncio
    async def test_stores_playlist_mapping(
        self,
        worker,
        mock_transcription_provider,
        mock_storage_provider,
        playlist_metadata,
    ):
        """Test that playlist mapping is stored during resubscription."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = (
            playlist_metadata
        )

        await worker.resubscribe_to_active_meetings()

        assert worker._meeting_to_playlist["google_meet:abc-def-ghi"] == 42

    @pytest.mark.asyncio
    async def test_skips_completed_bots(
        self, worker, mock_transcription_provider, mock_storage_provider
    ):
        """Test that completed bots are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "completed",
            }
        ]

        await worker.resubscribe_to_active_meetings()

        mock_storage_provider.get_playlist_metadata_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_failed_bots(
        self, worker, mock_transcription_provider, mock_storage_provider
    ):
        """Test that failed bots are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "failed",
            }
        ]

        await worker.resubscribe_to_active_meetings()

        mock_storage_provider.get_playlist_metadata_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_stopped_bots(
        self, worker, mock_transcription_provider, mock_storage_provider
    ):
        """Test that stopped bots are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "stopped",
            }
        ]

        await worker.resubscribe_to_active_meetings()

        mock_storage_provider.get_playlist_metadata_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_bots_without_playlist(
        self, worker, mock_transcription_provider, mock_storage_provider, caplog
    ):
        """Test that bots without playlist metadata are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = None

        await worker.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "No playlist metadata found" in caplog.text

    @pytest.mark.asyncio
    async def test_skips_bots_without_platform(
        self, worker, mock_transcription_provider, mock_storage_provider, caplog
    ):
        """Test that bots without platform are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            }
        ]

        await worker.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "Skipping bot with missing platform/meeting_id" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_no_active_bots(self, worker, mock_transcription_provider):
        """Test handling when no active bots exist."""
        mock_transcription_provider.get_active_bots.return_value = []

        await worker.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_provider_error(
        self, worker, mock_transcription_provider, caplog
    ):
        """Test handling when provider throws an error."""
        mock_transcription_provider.get_active_bots.side_effect = Exception("API error")

        await worker.resubscribe_to_active_meetings()

        assert "Error during resubscription" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_uninitialized_providers(self, worker, caplog):
        """Test handling when providers are not initialized."""
        worker.transcription_provider = None

        await worker.resubscribe_to_active_meetings()

        assert "Providers not initialized" in caplog.text


class TestSegmentIdGeneration:
    """Tests for segment ID generation consistency."""

    def test_same_inputs_generate_same_id(self):
        """Test that identical inputs generate the same segment ID."""
        id1 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        assert id1 == id2

    def test_different_speaker_generates_different_id(self):
        """Test that different speakers generate different IDs."""
        id1 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 5, "Jane Smith", "2026-01-23T04:00:00.000Z")
        assert id1 != id2

    def test_different_start_time_generates_different_id(self):
        """Test that different start times generate different IDs."""
        id1 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:05.000Z")
        assert id1 != id2

    def test_different_playlist_generates_different_id(self):
        """Test that different playlists generate different IDs."""
        id1 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(43, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        assert id1 != id2

    def test_different_version_generates_different_id(self):
        """Test that different versions generate different IDs."""
        id1 = generate_segment_id(42, 5, "John Doe", "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 6, "John Doe", "2026-01-23T04:00:00.000Z")
        assert id1 != id2
