"""Tests for Chrome extension WebSocket message models."""

import pytest
from pydantic import ValidationError

from dna.models.extension_transcript import (
    ExtensionMeetingStatusFrame,
    ExtensionRegisterMessage,
    ExtensionTranscriptFrame,
    ExtensionTranscriptSegment,
    parse_extension_message,
)


class TestExtensionTranscriptSegment:
    """Tests for ExtensionTranscriptSegment."""

    def test_valid_segment(self):
        seg = ExtensionTranscriptSegment(
            segment_id="sess:speaker-0:1",
            text="hello world",
            speaker="Alice",
            language="en",
            start_time=0.0,
            end_time=1.0,
            absolute_start_time="2026-04-20T19:00:00.000Z",
            absolute_end_time="2026-04-20T19:00:01.000Z",
            updated_at="2026-04-20T19:00:01.500Z",
        )
        assert seg.segment_id == "sess:speaker-0:1"
        assert seg.text == "hello world"

    def test_rejects_empty_text(self):
        with pytest.raises(ValidationError):
            ExtensionTranscriptSegment(
                segment_id="sess:speaker-0:1",
                text="",
                absolute_start_time="2026-04-20T19:00:00.000Z",
                absolute_end_time="2026-04-20T19:00:01.000Z",
            )


class TestExtensionRegisterMessage:
    """Tests for ExtensionRegisterMessage."""

    def test_valid_register(self):
        msg = ExtensionRegisterMessage(
            action="register",
            platform="google_meet",
            meeting_id="abc-def-ghi",
        )
        assert msg.action == "register"
        assert msg.platform == "google_meet"
        assert msg.meeting_id == "abc-def-ghi"

    def test_rejects_wrong_action(self):
        with pytest.raises(ValidationError):
            ExtensionRegisterMessage(
                action="subscribe",
                platform="google_meet",
                meeting_id="abc-def-ghi",
            )


class TestExtensionTranscriptFrame:
    """Tests for ExtensionTranscriptFrame."""

    def test_valid_transcript_frame(self):
        frame = ExtensionTranscriptFrame(
            type="transcript",
            speaker="Alice",
            confirmed=[
                {
                    "segment_id": "sess:speaker-0:1",
                    "text": "hello",
                    "absolute_start_time": "2026-04-20T19:00:00.000Z",
                    "absolute_end_time": "2026-04-20T19:00:01.000Z",
                }
            ],
            pending=[],
            ts="2026-04-20T19:00:00.000Z",
        )
        assert frame.type == "transcript"
        assert len(frame.confirmed) == 1

    def test_rejects_wrong_type(self):
        with pytest.raises(ValidationError):
            ExtensionTranscriptFrame(
                type="transcript.mutable",
                speaker="Alice",
                confirmed=[],
                pending=[],
            )


class TestExtensionMeetingStatusFrame:
    """Tests for ExtensionMeetingStatusFrame."""

    def test_valid_status(self):
        frame = ExtensionMeetingStatusFrame(
            type="meeting.status", status="transcribing"
        )
        assert frame.status == "transcribing"

    def test_rejects_invalid_status(self):
        with pytest.raises(ValidationError):
            ExtensionMeetingStatusFrame(type="meeting.status", status="unknown")


class TestParseExtensionMessage:
    """Tests for parse_extension_message dispatcher."""

    def test_parses_register(self):
        msg = parse_extension_message(
            {
                "action": "register",
                "platform": "google_meet",
                "meeting_id": "abc-def-ghi",
            }
        )
        assert isinstance(msg, ExtensionRegisterMessage)

    def test_parses_transcript(self):
        msg = parse_extension_message(
            {
                "type": "transcript",
                "speaker": "Alice",
                "confirmed": [],
                "pending": [],
                "ts": "2026-04-20T19:00:00.000Z",
            }
        )
        assert isinstance(msg, ExtensionTranscriptFrame)

    def test_parses_meeting_status(self):
        msg = parse_extension_message({"type": "meeting.status", "status": "completed"})
        assert isinstance(msg, ExtensionMeetingStatusFrame)

    def test_rejects_unknown_message(self):
        with pytest.raises(ValueError, match="Unknown extension message"):
            parse_extension_message({"type": "unknown"})
