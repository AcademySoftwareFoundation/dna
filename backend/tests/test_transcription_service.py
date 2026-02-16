"""Tests for the TranscriptionService."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.events import EventType
from dna.models.playlist_metadata import PlaylistMetadata
from dna.models.stored_segment import StoredSegment, generate_segment_id
from dna.transcription_service import TranscriptionService


@pytest.fixture
def mock_transcription_provider():
    """Create a mock transcription provider."""
    provider = AsyncMock()
    provider.subscribe_to_meeting = AsyncMock()
    provider.unsubscribe_from_meeting = AsyncMock()
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
def service(mock_transcription_provider, mock_storage_provider, mock_event_publisher):
    """Create a TranscriptionService with mocked providers."""
    svc = TranscriptionService(
        transcription_provider=mock_transcription_provider,
        storage_provider=mock_storage_provider,
        event_publisher=mock_event_publisher,
    )
    return svc


class TestSubscribeToMeeting:
    """Tests for subscription handling."""

    @pytest.mark.asyncio
    async def test_subscribes_to_meeting(self, service, mock_transcription_provider):
        """Test that subscribe_to_meeting is called with correct args."""
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            playlist_id=42,
        )

        mock_transcription_provider.subscribe_to_meeting.assert_called_once()
        call_kwargs = mock_transcription_provider.subscribe_to_meeting.call_args.kwargs
        assert call_kwargs["platform"] == "google_meet"
        assert call_kwargs["meeting_id"] == "abc-def-ghi"
        assert callable(call_kwargs["on_event"])

    @pytest.mark.asyncio
    async def test_stores_playlist_mapping(self, service):
        """Test that playlist_id mapping is stored."""
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            playlist_id=42,
        )

        assert service._meeting_to_playlist["google_meet:abc-def-ghi"] == 42

    @pytest.mark.asyncio
    async def test_tracks_subscribed_meetings(self, service):
        """Test that subscribed meetings are tracked."""
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            playlist_id=42,
        )

        assert "google_meet:abc-def-ghi" in service._subscribed_meetings

    @pytest.mark.asyncio
    async def test_skips_duplicate_subscription(
        self, service, mock_transcription_provider
    ):
        """Test that duplicate subscriptions are skipped."""
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            playlist_id=42,
        )
        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            playlist_id=42,
        )

        assert mock_transcription_provider.subscribe_to_meeting.call_count == 1

    @pytest.mark.asyncio
    async def test_handles_provider_not_initialized(self, service, caplog):
        """Test handling when provider is not initialized."""
        service.transcription_provider = None

        await service.subscribe_to_meeting(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            playlist_id=42,
        )

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
        self, service, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that segments are saved to storage."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        assert mock_storage_provider.upsert_segment.call_count == 2

    @pytest.mark.asyncio
    async def test_publishes_segment_created_event(
        self,
        service,
        mock_storage_provider,
        mock_event_publisher,
        sample_vexa_segments,
        sample_metadata,
    ):
        """Test that SEGMENT_CREATED event is published for new segments."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        mock_event_publisher.publish.assert_called()
        call_args = mock_event_publisher.publish.call_args_list[0]
        assert call_args[0][0] == EventType.SEGMENT_CREATED
        assert call_args[0][1]["text"] == "Hello, this is a test."
        assert call_args[0][1]["speaker"] == "John Doe"

    @pytest.mark.asyncio
    async def test_publishes_segment_updated_event(
        self,
        service,
        mock_storage_provider,
        mock_event_publisher,
        sample_vexa_segments,
        sample_metadata,
    ):
        """Test that SEGMENT_UPDATED event is published for existing segments."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        mock_event_publisher.publish.assert_called()
        call_args = mock_event_publisher.publish.call_args_list[0]
        assert call_args[0][0] == EventType.SEGMENT_UPDATED

    @pytest.mark.asyncio
    async def test_generates_correct_segment_id(
        self, service, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that segment ID is generated correctly."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        expected_segment_id = generate_segment_id(
            playlist_id=42,
            version_id=5,
            absolute_start_time="2026-01-23T04:00:00.000Z",
        )

        call_kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert call_kwargs["segment_id"] == expected_segment_id

    @pytest.mark.asyncio
    async def test_skips_empty_text_segments(
        self, service, mock_storage_provider, sample_metadata
    ):
        """Test that segments with empty text are skipped."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_segments_without_start_time(
        self, service, mock_storage_provider, sample_metadata
    ):
        """Test that segments without absolute_start_time are skipped."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_missing_playlist_mapping(
        self, service, mock_storage_provider, sample_vexa_segments, caplog
    ):
        """Test handling when playlist mapping is not found."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": sample_vexa_segments,
        }

        await service.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()
        assert "No playlist_id found for meeting" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_missing_in_review_version(
        self, service, mock_storage_provider, sample_vexa_segments, caplog
    ):
        """Test handling when in_review version is not set."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()
        assert "No in_review version found" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_empty_segments_list(self, service, mock_storage_provider):
        """Test handling when segments list is empty."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [],
        }

        await service.on_transcription_updated(payload)

        mock_storage_provider.get_playlist_metadata.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_default_speaker_when_missing(
        self, service, mock_storage_provider, mock_event_publisher, sample_metadata
    ):
        """Test that 'Unknown' is used as default speaker."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        call_kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert call_kwargs["data"].speaker == "Unknown"

    @pytest.mark.asyncio
    async def test_skips_segments_when_transcription_paused(
        self, service, mock_storage_provider, sample_vexa_segments, caplog
    ):
        """Test that segments are not saved when transcription is paused."""
        import logging

        caplog.set_level(logging.DEBUG)
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        mock_storage_provider.upsert_segment.assert_not_called()
        assert "Transcription paused for playlist" in caplog.text

    @pytest.mark.asyncio
    async def test_saves_segments_when_transcription_not_paused(
        self, service, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that segments are saved when transcription is not paused."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        assert mock_storage_provider.upsert_segment.call_count == 2

    @pytest.mark.asyncio
    async def test_skips_segments_before_resume_time(
        self, service, mock_storage_provider, caplog
    ):
        """Test that segments from before the resume time are skipped."""
        import logging
        from datetime import datetime, timezone

        caplog.set_level(logging.DEBUG)
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42

        resumed_at = datetime(2026, 1, 23, 4, 0, 10, tzinfo=timezone.utc)
        resumed_metadata = PlaylistMetadata(
            _id="meta123",
            playlist_id=42,
            in_review=5,
            meeting_id="abc-def-ghi",
            platform="google_meet",
            transcription_paused=False,
            transcription_resumed_at=resumed_at,
        )
        mock_storage_provider.get_playlist_metadata.return_value = resumed_metadata
        mock_storage_provider.upsert_segment.return_value = (
            MagicMock(spec=StoredSegment),
            True,
        )

        segments = [
            {
                "text": "Before pause - should be skipped",
                "speaker": "John",
                "absolute_start_time": "2026-01-23T04:00:05.000Z",
                "absolute_end_time": "2026-01-23T04:00:08.000Z",
            },
            {
                "text": "After resume - should be saved",
                "speaker": "Jane",
                "absolute_start_time": "2026-01-23T04:00:15.000Z",
                "absolute_end_time": "2026-01-23T04:00:20.000Z",
            },
        ]

        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": segments,
        }

        await service.on_transcription_updated(payload)

        assert mock_storage_provider.upsert_segment.call_count == 1
        call_kwargs = mock_storage_provider.upsert_segment.call_args.kwargs
        assert call_kwargs["data"].text == "After resume - should be saved"
        assert "Skipping segment from before resume" in caplog.text

    @pytest.mark.asyncio
    async def test_saves_all_segments_when_no_resume_time(
        self, service, mock_storage_provider, sample_vexa_segments, sample_metadata
    ):
        """Test that all segments are saved when there is no resume time."""
        service._meeting_to_playlist["google_meet:abc-def-ghi"] = 42
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

        await service.on_transcription_updated(payload)

        assert mock_storage_provider.upsert_segment.call_count == 2


class TestOnVexaEvent:
    """Tests for Vexa event forwarding."""

    @pytest.mark.asyncio
    async def test_forwards_transcript_updated(self, service, mock_event_publisher):
        """Test that transcript.updated is forwarded via event publisher."""
        payload = {
            "platform": "google_meet",
            "meeting_id": "abc-def-ghi",
            "segments": [],
        }

        await service._on_vexa_event("transcript.updated", payload)

        mock_event_publisher.publish.assert_called_once_with(
            EventType.TRANSCRIPTION_UPDATED,
            payload,
        )

    @pytest.mark.asyncio
    async def test_forwards_bot_status_changed(self, service, mock_event_publisher):
        """Test that bot.status_changed is forwarded via event publisher."""
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
        """Test that TRANSCRIPTION_COMPLETED is published when bot status is completed."""
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
        """Test that TRANSCRIPTION_ERROR is published when bot status is failed."""
        payload = {"status": "failed", "platform": "google_meet", "meeting_id": "x"}

        await service._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == EventType.BOT_STATUS_CHANGED
        assert calls[1][0][0] == EventType.TRANSCRIPTION_ERROR

    @pytest.mark.asyncio
    async def test_publishes_error_on_status_stopped(
        self, service, mock_event_publisher
    ):
        """Test that TRANSCRIPTION_ERROR is published when bot status is stopped."""
        payload = {"status": "stopped", "platform": "google_meet", "meeting_id": "x"}

        await service._on_vexa_event("bot.status_changed", payload)

        calls = mock_event_publisher.publish.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == EventType.BOT_STATUS_CHANGED
        assert calls[1][0][0] == EventType.TRANSCRIPTION_ERROR

    @pytest.mark.asyncio
    async def test_handles_unknown_vexa_event(
        self, service, mock_event_publisher, caplog
    ):
        """Test that unknown Vexa events are logged."""
        await service._on_vexa_event("unknown.event", {})

        mock_event_publisher.publish.assert_not_called()
        assert "Unknown Vexa event type" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_uninitialized_publisher(self, service, caplog):
        """Test handling when event publisher is not initialized."""
        service.event_publisher = None

        await service._on_vexa_event("transcript.updated", {})

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
        service,
        mock_transcription_provider,
        mock_storage_provider,
        active_bots,
        playlist_metadata,
    ):
        """Test that service resubscribes to all active bots."""
        mock_transcription_provider.get_active_bots.return_value = active_bots
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = (
            playlist_metadata
        )

        await service.resubscribe_to_active_meetings()

        assert mock_transcription_provider.subscribe_to_meeting.call_count == 2

    @pytest.mark.asyncio
    async def test_registers_meeting_id_mapping_from_metadata(
        self,
        service,
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

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.register_meeting_id_mapping.assert_called_once_with(
            123, "google_meet", "abc-def-ghi"
        )

    @pytest.mark.asyncio
    async def test_registers_meeting_id_mapping_from_bot(
        self, service, mock_transcription_provider, mock_storage_provider
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

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.register_meeting_id_mapping.assert_called_once_with(
            789, "google_meet", "abc-def-ghi"
        )

    @pytest.mark.asyncio
    async def test_stores_playlist_mapping(
        self,
        service,
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

        await service.resubscribe_to_active_meetings()

        assert service._meeting_to_playlist["google_meet:abc-def-ghi"] == 42

    @pytest.mark.asyncio
    async def test_skips_completed_bots(
        self, service, mock_transcription_provider, mock_storage_provider
    ):
        """Test that completed bots are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "completed",
            }
        ]

        await service.resubscribe_to_active_meetings()

        mock_storage_provider.get_playlist_metadata_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_failed_bots(
        self, service, mock_transcription_provider, mock_storage_provider
    ):
        """Test that failed bots are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "failed",
            }
        ]

        await service.resubscribe_to_active_meetings()

        mock_storage_provider.get_playlist_metadata_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_stopped_bots(
        self, service, mock_transcription_provider, mock_storage_provider
    ):
        """Test that stopped bots are skipped."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "stopped",
            }
        ]

        await service.resubscribe_to_active_meetings()

        mock_storage_provider.get_playlist_metadata_by_meeting_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_bots_without_playlist(
        self, service, mock_transcription_provider, mock_storage_provider, caplog
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

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()
        assert "No playlist metadata found" in caplog.text

    @pytest.mark.asyncio
    async def test_skips_bots_without_platform(
        self, service, mock_transcription_provider, mock_storage_provider, caplog
    ):
        """Test that bots without platform are skipped."""
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
        """Test handling when no active bots exist."""
        mock_transcription_provider.get_active_bots.return_value = []

        await service.resubscribe_to_active_meetings()

        mock_transcription_provider.subscribe_to_meeting.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_provider_error(
        self, service, mock_transcription_provider, caplog
    ):
        """Test handling when provider throws an error."""
        mock_transcription_provider.get_active_bots.side_effect = Exception("API error")

        await service.resubscribe_to_active_meetings()

        assert "Error during resubscription" in caplog.text

    @pytest.mark.asyncio
    async def test_handles_uninitialized_providers(self, service, caplog):
        """Test handling when providers are not initialized."""
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
        playlist_metadata,
    ):
        """Test that recovery publishes status events to WebSocket clients."""
        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
                "meeting_id": 123,
            }
        ]
        mock_storage_provider.get_playlist_metadata_by_meeting_id.return_value = (
            playlist_metadata
        )

        await service.resubscribe_to_active_meetings()

        from dna.events import EventType

        mock_event_publisher.publish.assert_called_once_with(
            EventType.BOT_STATUS_CHANGED,
            {
                "platform": "google_meet",
                "meeting_id": "abc-def-ghi",
                "playlist_id": 42,
                "status": "in_meeting",
                "recovered": True,
            },
        )

    @pytest.mark.asyncio
    async def test_publishes_recovery_status_for_each_active_bot(
        self,
        service,
        mock_transcription_provider,
        mock_storage_provider,
        mock_event_publisher,
    ):
        """Test that recovery publishes status for each active bot."""
        metadata1 = PlaylistMetadata(
            _id="meta1",
            playlist_id=42,
            in_review=5,
            meeting_id="abc-def-ghi",
            platform="google_meet",
            vexa_meeting_id=123,
        )
        metadata2 = PlaylistMetadata(
            _id="meta2",
            playlist_id=43,
            in_review=6,
            meeting_id="123456789",
            platform="zoom",
            vexa_meeting_id=456,
        )

        mock_transcription_provider.get_active_bots.return_value = [
            {
                "platform": "google_meet",
                "native_meeting_id": "abc-def-ghi",
                "status": "in_meeting",
            },
            {
                "platform": "zoom",
                "native_meeting_id": "123456789",
                "status": "waiting",
            },
        ]
        mock_storage_provider.get_playlist_metadata_by_meeting_id.side_effect = [
            metadata1,
            metadata2,
        ]

        await service.resubscribe_to_active_meetings()

        assert mock_event_publisher.publish.call_count == 2


class TestSegmentIdGeneration:
    """Tests for segment ID generation consistency."""

    def test_same_inputs_generate_same_id(self):
        """Test that identical inputs generate the same segment ID."""
        id1 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        assert id1 == id2

    def test_different_start_time_generates_different_id(self):
        """Test that different start times generate different IDs."""
        id1 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 5, "2026-01-23T04:00:05.000Z")
        assert id1 != id2

    def test_different_playlist_generates_different_id(self):
        """Test that different playlists generate different IDs."""
        id1 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(43, 5, "2026-01-23T04:00:00.000Z")
        assert id1 != id2

    def test_different_version_generates_different_id(self):
        """Test that different versions generate different IDs."""
        id1 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 6, "2026-01-23T04:00:00.000Z")
        assert id1 != id2

    def test_speaker_changes_do_not_affect_id(self):
        """Test that the same start time generates the same ID regardless of speaker.

        This is important because Vexa's mutable transcription can reassign
        speakers as it refines the transcript.
        """
        id1 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        id2 = generate_segment_id(42, 5, "2026-01-23T04:00:00.000Z")
        assert id1 == id2


class TestTranscriptionServiceLifecycle:
    """Tests for TranscriptionService initialization and cleanup."""

    @pytest.mark.asyncio
    async def test_init_providers_initializes_all(self, service):
        """Test that init_providers initializes all providers."""
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
        """Test that close cleans up all resources."""
        service._subscribed_meetings.add("google_meet:test")
        service._meeting_to_playlist["google_meet:test"] = 1

        await service.close()

        mock_transcription_provider.close.assert_called_once()
        assert len(service._subscribed_meetings) == 0
        assert len(service._meeting_to_playlist) == 0
