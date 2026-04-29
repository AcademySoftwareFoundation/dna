"""Tests for the TranscriptionService."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.events import EventType
from dna.models.playlist_metadata import PlaylistMetadata
from dna.models.stored_segment import StoredSegment
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



class TestOnVexaEvent:
    """Tests for Vexa event forwarding."""

    @pytest.mark.asyncio
    async def test_forwards_transcript_updated(self, service):
        """`transcript.updated` must route to on_transcription_updated so the
        flat `{type:"transcript", ...}` broadcast happens. The legacy
        `TRANSCRIPTION_UPDATED` publish has been removed — nothing
        subscribed and the flat envelope carries the full payload."""
        from unittest.mock import AsyncMock

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
