"""Tests for the Transcription Provider Base."""

from unittest import mock

import pytest

from dna.models.transcription import Platform
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
    get_transcription_provider,
)


class TestTranscriptionProviderBase:
    """Tests for TranscriptionProviderBase class."""

    def test_init(self):
        """Test that TranscriptionProviderBase can be instantiated."""
        provider = TranscriptionProviderBase()
        assert provider is not None

    @pytest.mark.asyncio
    async def test_dispatch_bot_raises_not_implemented(self):
        """Test that dispatch_bot raises NotImplementedError."""
        provider = TranscriptionProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.dispatch_bot(
                Platform.GOOGLE_MEET, "meeting-id", 1, None, None, None
            )

    @pytest.mark.asyncio
    async def test_stop_bot_raises_not_implemented(self):
        """Test that stop_bot raises NotImplementedError."""
        provider = TranscriptionProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.stop_bot(Platform.GOOGLE_MEET, "meeting-id")

    @pytest.mark.asyncio
    async def test_get_bot_status_raises_not_implemented(self):
        """Test that get_bot_status raises NotImplementedError."""
        provider = TranscriptionProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_bot_status(Platform.GOOGLE_MEET, "meeting-id")

    @pytest.mark.asyncio
    async def test_get_transcript_raises_not_implemented(self):
        """Test that get_transcript raises NotImplementedError."""
        provider = TranscriptionProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_transcript(Platform.GOOGLE_MEET, "meeting-id")

    @pytest.mark.asyncio
    async def test_subscribe_to_meeting_raises_not_implemented(self):
        """Test that subscribe_to_meeting raises NotImplementedError."""
        provider = TranscriptionProviderBase()

        async def callback(event_type, data):
            pass

        with pytest.raises(NotImplementedError):
            await provider.subscribe_to_meeting("google_meet", "meeting-id", callback)

    @pytest.mark.asyncio
    async def test_unsubscribe_from_meeting_raises_not_implemented(self):
        """Test that unsubscribe_from_meeting raises NotImplementedError."""
        provider = TranscriptionProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.unsubscribe_from_meeting("google_meet", "meeting-id")

    @pytest.mark.asyncio
    async def test_get_active_bots_raises_not_implemented(self):
        """Test that get_active_bots raises NotImplementedError."""
        provider = TranscriptionProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.get_active_bots()

    def test_register_meeting_id_mapping_does_nothing(self):
        """Test that register_meeting_id_mapping does nothing by default."""
        provider = TranscriptionProviderBase()
        provider.register_meeting_id_mapping(1, "google_meet", "meeting-id")

    @pytest.mark.asyncio
    async def test_close_does_nothing(self):
        """Test that close does nothing by default."""
        provider = TranscriptionProviderBase()
        await provider.close()


class TestGetTranscriptionProvider:
    """Tests for get_transcription_provider factory function."""

    def test_returns_vexa_provider_by_default(self):
        """Test that factory returns VexaTranscriptionProvider by default."""
        with mock.patch.dict("os.environ", {}, clear=True):
            from dna.transcription_providers.vexa import VexaTranscriptionProvider

            provider = get_transcription_provider()
            assert isinstance(provider, VexaTranscriptionProvider)

    def test_returns_vexa_provider_when_configured(self):
        """Test that factory returns VexaTranscriptionProvider when configured."""
        with mock.patch.dict("os.environ", {"TRANSCRIPTION_PROVIDER": "vexa"}):
            from dna.transcription_providers.vexa import VexaTranscriptionProvider

            provider = get_transcription_provider()
            assert isinstance(provider, VexaTranscriptionProvider)

    def test_raises_error_for_unknown_provider(self):
        """Test that factory raises ValueError for unknown provider."""
        with mock.patch.dict("os.environ", {"TRANSCRIPTION_PROVIDER": "unknown"}):
            with pytest.raises(ValueError, match="Unknown transcription provider"):
                get_transcription_provider()
