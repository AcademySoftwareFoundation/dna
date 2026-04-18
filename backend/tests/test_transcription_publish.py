"""Tests for the publish-transcript payload builder."""

from datetime import date, datetime, timezone
from hashlib import sha256

from dna.models.stored_segment import StoredSegment
from dna.transcription_publish import build_transcript_payload


def _segment(
    *,
    segment_id: str = "seg1",
    text: str,
    speaker: str | None = "Speaker A",
    start: str = "2026-04-15T10:00:00Z",
    end: str = "2026-04-15T10:00:05Z",
    updated_at: datetime | None = None,
) -> StoredSegment:
    ts = updated_at or datetime(2026, 4, 15, 10, 0, 5, tzinfo=timezone.utc)
    return StoredSegment(
        _id="mongo_" + segment_id,
        segment_id=segment_id,
        playlist_id=1,
        version_id=10,
        text=text,
        speaker=speaker,
        language="en",
        absolute_start_time=start,
        absolute_end_time=end,
        vexa_updated_at=None,
        created_at=ts,
        updated_at=ts,
    )


class TestBuildTranscriptPayload:
    """build_transcript_payload 在不同輸入下的行為。"""

    def test_empty_list_returns_empty_body(self):
        payload = build_transcript_payload([])

        assert payload.body == ""
        assert payload.segments_count == 0
        assert payload.body_hash == sha256(b"").hexdigest()
        # 沒有 segment 時退而求其次取今天，主要是讓呼叫端不用處理 None
        assert payload.meeting_date == datetime.now(timezone.utc).date()

    def test_single_segment_renders_one_line(self):
        segments = [_segment(text="Hello world", speaker="Cameron")]

        payload = build_transcript_payload(segments)

        assert payload.body == "Cameron: Hello world"
        assert payload.segments_count == 1
        assert payload.meeting_date == date(2026, 4, 15)

    def test_exact_duplicate_segments_keep_latest_updated(self):
        earlier = _segment(
            segment_id="a",
            text="first draft",
            start="2026-04-15T10:00:00Z",
            updated_at=datetime(2026, 4, 15, 10, 0, 10, tzinfo=timezone.utc),
        )
        later = _segment(
            segment_id="a",
            text="first draft",
            start="2026-04-15T10:00:00Z",
            updated_at=datetime(2026, 4, 15, 10, 0, 20, tzinfo=timezone.utc),
        )

        payload = build_transcript_payload([earlier, later])

        assert payload.segments_count == 1
        assert payload.body.endswith("first draft")

    def test_out_of_order_segments_are_sorted_by_start_time(self):
        later = _segment(
            segment_id="b",
            text="second",
            speaker="Alex",
            start="2026-04-15T10:01:00Z",
        )
        earlier = _segment(
            segment_id="a",
            text="first",
            speaker="Alex",
            start="2026-04-15T10:00:00Z",
        )

        payload = build_transcript_payload([later, earlier])

        assert payload.body.index("first") < payload.body.index("second")

    def test_consecutive_same_speaker_collapses_to_one_line(self):
        segments = [
            _segment(
                segment_id="1",
                text="hello",
                speaker="A",
                start="2026-04-15T10:00:00Z",
            ),
            _segment(
                segment_id="2",
                text="again",
                speaker="A",
                start="2026-04-15T10:00:01Z",
            ),
            _segment(
                segment_id="3",
                text="my turn",
                speaker="B",
                start="2026-04-15T10:00:02Z",
            ),
        ]

        payload = build_transcript_payload(segments)

        assert payload.body.splitlines() == ["A: hello again", "B: my turn"]
        assert payload.segments_count == 3

    def test_body_hash_is_stable_across_input_permutations(self):
        a = _segment(segment_id="a", text="one", start="2026-04-15T10:00:00Z")
        b = _segment(segment_id="b", text="two", start="2026-04-15T10:00:05Z")
        c = _segment(segment_id="c", text="three", start="2026-04-15T10:00:10Z")

        forward = build_transcript_payload([a, b, c])
        reversed_order = build_transcript_payload([c, b, a])

        assert forward.body == reversed_order.body
        assert forward.body_hash == reversed_order.body_hash

    def test_missing_speaker_is_rendered_as_unknown(self):
        segments = [_segment(speaker=None, text="what's this?")]

        payload = build_transcript_payload(segments)

        assert payload.body == "Unknown: what's this?"

    def test_whitespace_only_text_is_dropped(self):
        segments = [
            _segment(segment_id="1", text="valid"),
            _segment(
                segment_id="2",
                text="   ",
                start="2026-04-15T10:00:05Z",
            ),
        ]

        payload = build_transcript_payload(segments)

        assert payload.body == "Speaker A: valid"
        assert payload.segments_count == 1

    def test_naive_start_time_treated_as_utc(self):
        """沒時區的時間戳要當成 UTC；不可以讓 astimezone 用本機時區去 infer。"""
        segments = [
            _segment(
                segment_id="1",
                text="late night",
                # 主機時區若非 UTC，naive + astimezone 會把日期推到 04-16
                start="2026-04-15T23:30:00",
                end="2026-04-15T23:30:05",
            )
        ]

        payload = build_transcript_payload(segments)

        assert payload.meeting_date == date(2026, 4, 15)
