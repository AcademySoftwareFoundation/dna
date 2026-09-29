"""Tests for the ExtensionTranscriptionProvider."""

import os
from unittest import mock

import pytest

from dna.models.transcription import BotStatusEnum, Platform
from dna.transcription_providers.extension import ExtensionTranscriptionProvider
from dna.transcription_providers.transcription_provider_base import (
    get_transcription_provider,
)


@pytest.fixture
def provider():
    return ExtensionTranscriptionProvider()


class TestExtensionProviderBotLifecycle:
    """The extension owns capture in the browser, so bot methods are no-ops."""

    @pytest.mark.asyncio
    async def test_dispatch_bot_not_implemented(self, provider):
        with pytest.raises(NotImplementedError):
            await provider.dispatch_bot(
                platform=Platform.GOOGLE_MEET,
                meeting_id="abc-def",
                playlist_id=42,
            )

    @pytest.mark.asyncio
    async def test_stop_bot_returns_true(self, provider):
        assert await provider.stop_bot(Platform.GOOGLE_MEET, "abc-def") is True

    @pytest.mark.asyncio
    async def test_get_bot_status_idle(self, provider):
        status = await provider.get_bot_status(Platform.GOOGLE_MEET, "abc-def")
        assert status.status == BotStatusEnum.IDLE
        assert status.platform == Platform.GOOGLE_MEET
        assert status.meeting_id == "abc-def"

    @pytest.mark.asyncio
    async def test_get_transcript_not_implemented(self, provider):
        with pytest.raises(NotImplementedError):
            await provider.get_transcript(Platform.GOOGLE_MEET, "abc-def")

    @pytest.mark.asyncio
    async def test_subscribe_is_noop(self, provider):
        async def _cb(event_type, payload):  # pragma: no cover - never called
            return None

        assert (
            await provider.subscribe_to_meeting("google_meet", "abc-def", _cb) is None
        )

    @pytest.mark.asyncio
    async def test_unsubscribe_is_noop(self, provider):
        assert await provider.unsubscribe_from_meeting("google_meet", "abc-def") is None

    @pytest.mark.asyncio
    async def test_get_active_bots_empty(self, provider):
        assert await provider.get_active_bots() == []

    @pytest.mark.asyncio
    async def test_close_is_noop(self, provider):
        assert await provider.close() is None


class TestExtensionProviderFactory:
    """The factory returns the extension provider when configured."""

    @pytest.mark.parametrize("name", ["browser_extension", "extension"])
    def test_factory_returns_extension_provider(self, name):
        with mock.patch.dict(os.environ, {"TRANSCRIPTION_PROVIDER": name}):
            provider = get_transcription_provider()
        assert isinstance(provider, ExtensionTranscriptionProvider)
