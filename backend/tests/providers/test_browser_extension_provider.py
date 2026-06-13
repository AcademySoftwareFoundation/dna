"""Tests for the Browser Extension Transcription Provider."""

import asyncio
from unittest import mock

import pytest

from dna.models.transcription import BotStatusEnum, Platform
from dna.transcription_providers.browser_extension import (
    BrowserExtensionTranscriptionProvider,
)


@pytest.fixture
def provider():
    """Create a fresh BrowserExtensionTranscriptionProvider."""
    return BrowserExtensionTranscriptionProvider()


class TestBrowserExtensionProviderDispatch:
    """Tests for dispatch_bot."""

    @pytest.mark.asyncio
    async def test_dispatch_bot_returns_session_without_external_calls(self, provider):
        session = await provider.dispatch_bot(
            Platform.GOOGLE_MEET,
            "abc-def-ghi",
            playlist_id=42,
        )
        assert session.platform == Platform.GOOGLE_MEET
        assert session.meeting_id == "abc-def-ghi"
        assert session.playlist_id == 42
        assert session.status == BotStatusEnum.JOINING
        assert session.vexa_meeting_id is not None

    @pytest.mark.asyncio
    async def test_dispatch_bot_assigns_unique_session_ids(self, provider):
        session1 = await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        session2 = await provider.dispatch_bot(Platform.GOOGLE_MEET, "xyz-abcd-efg", 43)
        assert session1.vexa_meeting_id != session2.vexa_meeting_id


class TestBrowserExtensionProviderStatus:
    """Tests for get_bot_status lifecycle."""

    @pytest.mark.asyncio
    async def test_get_bot_status_after_dispatch(self, provider):
        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        status = await provider.get_bot_status(Platform.GOOGLE_MEET, "abc-def-ghi")
        assert status.status == BotStatusEnum.JOINING

    @pytest.mark.asyncio
    async def test_get_bot_status_unknown_meeting(self, provider):
        status = await provider.get_bot_status(Platform.GOOGLE_MEET, "unknown-meeting")
        assert status.status == BotStatusEnum.IDLE

    @pytest.mark.asyncio
    async def test_stop_bot_marks_session_stopped(self, provider):
        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        result = await provider.stop_bot(Platform.GOOGLE_MEET, "abc-def-ghi")
        assert result is True
        status = await provider.get_bot_status(Platform.GOOGLE_MEET, "abc-def-ghi")
        assert status.status == BotStatusEnum.STOPPED


class TestBrowserExtensionProviderSubscribe:
    """Tests for subscribe and transcript routing."""

    @pytest.mark.asyncio
    async def test_subscribe_registers_callback(self, provider):
        events: list[tuple[str, dict]] = []

        async def on_event(event_type: str, payload: dict):
            events.append((event_type, payload))

        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        await provider.subscribe_to_meeting("google_meet", "abc-def-ghi", on_event)
        assert "google_meet:abc-def-ghi" in provider._subscribed_meetings

    @pytest.mark.asyncio
    async def test_handle_transcript_invokes_callback(self, provider):
        events: list[tuple[str, dict]] = []

        async def on_event(event_type: str, payload: dict):
            events.append((event_type, payload))

        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        await provider.subscribe_to_meeting("google_meet", "abc-def-ghi", on_event)

        await provider.handle_extension_message(
            "google_meet:abc-def-ghi",
            {
                "type": "transcript",
                "speaker": "Alice",
                "confirmed": [
                    {
                        "segment_id": "sess:speaker-0:1",
                        "text": "hello",
                        "absolute_start_time": "2026-04-20T19:00:00.000Z",
                        "absolute_end_time": "2026-04-20T19:00:01.000Z",
                    }
                ],
                "pending": [],
                "ts": "2026-04-20T19:00:00.000Z",
            },
        )

        assert len(events) == 1
        assert events[0][0] == "transcript.updated"
        assert events[0][1]["platform"] == "google_meet"
        assert events[0][1]["meeting_id"] == "abc-def-ghi"
        assert events[0][1]["speaker"] == "Alice"
        assert len(events[0][1]["confirmed"]) == 1

    @pytest.mark.asyncio
    async def test_handle_transcript_unknown_meeting_no_callback(self, provider):
        events: list[tuple[str, dict]] = []

        async def on_event(event_type: str, payload: dict):
            events.append((event_type, payload))

        await provider.handle_extension_message(
            "google_meet:unknown",
            {"type": "transcript", "confirmed": [], "pending": []},
        )
        assert events == []

    @pytest.mark.asyncio
    async def test_handle_meeting_status_invokes_callback(self, provider):
        events: list[tuple[str, dict]] = []

        async def on_event(event_type: str, payload: dict):
            events.append((event_type, payload))

        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        await provider.subscribe_to_meeting("google_meet", "abc-def-ghi", on_event)

        await provider.handle_extension_message(
            "google_meet:abc-def-ghi",
            {"type": "meeting.status", "status": "transcribing"},
        )

        assert len(events) == 1
        assert events[0][0] == "bot.status_changed"
        assert events[0][1]["status"] == "transcribing"

    @pytest.mark.asyncio
    async def test_register_extension_connection(self, provider):
        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        mock_ws = mock.AsyncMock()
        result = await provider.register_extension(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            websocket=mock_ws,
        )
        assert result is not None
        assert result["session_id"] == 1
        assert result["playlist_id"] == 42

    @pytest.mark.asyncio
    async def test_register_extension_unknown_session(self, provider):
        mock_ws = mock.AsyncMock()
        result = await provider.register_extension(
            platform="google_meet",
            meeting_id="unknown",
            websocket=mock_ws,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_stop_bot_sends_stop_to_connected_extension(self, provider):
        mock_ws = mock.AsyncMock()
        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        await provider.register_extension(
            platform="google_meet",
            meeting_id="abc-def-ghi",
            websocket=mock_ws,
        )
        await provider.stop_bot(Platform.GOOGLE_MEET, "abc-def-ghi")
        mock_ws.send_json.assert_called_once()
        call_args = mock_ws.send_json.call_args[0][0]
        assert call_args["type"] == "stop"


class TestBrowserExtensionProviderActiveBots:
    """Tests for get_active_bots."""

    @pytest.mark.asyncio
    async def test_get_active_bots_lists_non_terminal(self, provider):
        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        bots = await provider.get_active_bots()
        assert len(bots) == 1
        assert bots[0]["platform"] == "google_meet"
        assert bots[0]["native_meeting_id"] == "abc-def-ghi"

    @pytest.mark.asyncio
    async def test_get_active_bots_excludes_stopped(self, provider):
        await provider.dispatch_bot(Platform.GOOGLE_MEET, "abc-def-ghi", 42)
        await provider.stop_bot(Platform.GOOGLE_MEET, "abc-def-ghi")
        bots = await provider.get_active_bots()
        assert bots == []


class TestGetTranscriptionProviderBrowserExtension:
    """Tests for factory registration."""

    def test_returns_browser_extension_provider(self):
        with mock.patch.dict(
            "os.environ", {"TRANSCRIPTION_PROVIDER": "browser_extension"}
        ):
            from dna.transcription_providers.browser_extension import (
                BrowserExtensionTranscriptionProvider,
            )
            from dna.transcription_providers.transcription_provider_base import (
                get_transcription_provider,
            )

            provider = get_transcription_provider()
            assert isinstance(provider, BrowserExtensionTranscriptionProvider)
