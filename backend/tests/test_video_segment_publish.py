"""Tests for the pure video-segment cut-list builder and Zoom alignment helper.

Slice 1 of the movie-file-segmenting feature. These functions are pure: no
storage, no provider, no ffmpeg, no FastAPI. They replay segmentation decisions
already encoded in the stored transcript segments' wall-clock timestamps.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from dna.models.stored_segment import StoredSegment
from dna.video_segment_publish import (
    build_video_cuts_payload,
    parse_recording_t0_from_zoom_folder,
)


def _segment(
    *,
    segment_id: str,
    version_id: int = 10,
    start: str,
    end: str,
    playlist_id: int = 1,
) -> StoredSegment:
    """Build a StoredSegment with the wall-clock fields the builder reads."""
    ts = datetime(2026, 5, 27, 12, 0, 0, tzinfo=timezone.utc)
    return StoredSegment(
        _id="mongo_" + segment_id,
        segment_id=segment_id,
        playlist_id=playlist_id,
        version_id=version_id,
        text="hello",
        speaker="Speaker A",
        language="en",
        absolute_start_time=start,
        absolute_end_time=end,
        vexa_updated_at=None,
        created_at=ts,
        updated_at=ts,
    )


# Recording starts at 2026-05-27T10:00:00Z. A long-enough duration that nothing
# clamps unless a test deliberately uses out-of-range times.
T0 = datetime(2026, 5, 27, 10, 0, 0, tzinfo=timezone.utc)
DURATION = 3600.0  # one hour


class TestParseRecordingT0FromZoomFolder:
    """Folder name -> recording_t0 (UTC), via the ZOOM_RECORDING_TIMEZONE zone."""

    def test_parses_basic_folder_name_as_new_york(self, monkeypatch):
        monkeypatch.setenv("ZOOM_RECORDING_TIMEZONE", "America/New_York")
        folder = "2026-05-27 06.44.49 Cameron Target's Zoom Meeting"

        t0 = parse_recording_t0_from_zoom_folder(folder)

        # 2026-05-27 is EDT (UTC-4): 06:44:49 local -> 10:44:49 UTC.
        assert t0 == datetime(2026, 5, 27, 10, 44, 49, tzinfo=timezone.utc)
        assert t0.tzinfo == timezone.utc

    def test_winter_date_uses_est_offset(self, monkeypatch):
        monkeypatch.setenv("ZOOM_RECORDING_TIMEZONE", "America/New_York")
        # 2026-01-15 is EST (UTC-5): 06:00:00 local -> 11:00:00 UTC.
        t0 = parse_recording_t0_from_zoom_folder("2026-01-15 06.00.00 Meeting")

        assert t0 == datetime(2026, 1, 15, 11, 0, 0, tzinfo=timezone.utc)

    def test_default_timezone_is_new_york_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("ZOOM_RECORDING_TIMEZONE", raising=False)
        t0 = parse_recording_t0_from_zoom_folder("2026-05-27 06.44.49 Meeting")

        assert t0 == datetime(2026, 5, 27, 10, 44, 49, tzinfo=timezone.utc)

    def test_respects_overridden_timezone(self, monkeypatch):
        monkeypatch.setenv("ZOOM_RECORDING_TIMEZONE", "UTC")
        t0 = parse_recording_t0_from_zoom_folder("2026-05-27 06.44.49 Meeting")

        assert t0 == datetime(2026, 5, 27, 6, 44, 49, tzinfo=timezone.utc)

    def test_folder_name_without_title_still_parses(self, monkeypatch):
        monkeypatch.setenv("ZOOM_RECORDING_TIMEZONE", "UTC")
        t0 = parse_recording_t0_from_zoom_folder("2026-05-27 06.44.49")

        assert t0 == datetime(2026, 5, 27, 6, 44, 49, tzinfo=timezone.utc)

    def test_leading_and_trailing_whitespace_tolerated(self, monkeypatch):
        monkeypatch.setenv("ZOOM_RECORDING_TIMEZONE", "UTC")
        t0 = parse_recording_t0_from_zoom_folder("  2026-05-27 06.44.49 Meeting  ")

        assert t0 == datetime(2026, 5, 27, 6, 44, 49, tzinfo=timezone.utc)

    def test_unparseable_folder_name_raises_value_error(self):
        with pytest.raises(ValueError):
            parse_recording_t0_from_zoom_folder("not a zoom folder")

    def test_empty_folder_name_raises_value_error(self):
        with pytest.raises(ValueError):
            parse_recording_t0_from_zoom_folder("")


class TestBuildVideoCutsPayload:
    """Cut-list construction is a pure replay of stored-segment timestamps."""

    def test_empty_input_returns_empty_list(self):
        result = build_video_cuts_payload({}, recording_t0=T0, recording_duration_seconds=DURATION)

        assert result == []

    def test_single_version_single_cut(self):
        # One contiguous run: 10:05:00 -> 10:05:30, i.e. 300s..330s into the video.
        segments = {
            10: [
                _segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z"),
                _segment(segment_id="b", start="2026-05-27T10:05:10Z", end="2026-05-27T10:05:30Z"),
            ]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert len(result) == 1
        cut_list = result[0]
        assert cut_list.version_id == 10
        assert len(cut_list.cuts) == 1
        cut = cut_list.cuts[0]
        assert cut.video_in_seconds == 300.0
        assert cut.video_out_seconds == 330.0
        assert cut.transcript_segment_ids == ["a", "b"]

    def test_single_version_multi_cut_split_on_gap(self):
        # Two runs separated by a 60s gap (>> default threshold).
        segments = {
            10: [
                _segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z"),
                _segment(segment_id="b", start="2026-05-27T10:06:10Z", end="2026-05-27T10:06:20Z"),
            ]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        cuts = result[0].cuts
        assert len(cuts) == 2
        assert (cuts[0].video_in_seconds, cuts[0].video_out_seconds) == (300.0, 310.0)
        assert (cuts[1].video_in_seconds, cuts[1].video_out_seconds) == (370.0, 380.0)
        assert cuts[0].transcript_segment_ids == ["a"]
        assert cuts[1].transcript_segment_ids == ["b"]

    def test_small_gap_under_threshold_stays_one_cut(self):
        # 1.5s gap with default threshold 2.0 -> same run.
        segments = {
            10: [
                _segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z"),
                _segment(segment_id="b", start="2026-05-27T10:05:11.5Z", end="2026-05-27T10:05:20Z"),
            ]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert len(result[0].cuts) == 1
        assert result[0].cuts[0].transcript_segment_ids == ["a", "b"]

    def test_gap_threshold_is_configurable(self):
        segments = {
            10: [
                _segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z"),
                _segment(segment_id="b", start="2026-05-27T10:05:15Z", end="2026-05-27T10:05:20Z"),
            ]
        }
        # 5s gap. threshold 2 -> split; threshold 10 -> single.
        split = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION, gap_seconds=2.0)
        joined = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION, gap_seconds=10.0)

        assert len(split[0].cuts) == 2
        assert len(joined[0].cuts) == 1

    def test_multi_version_grouped_and_ordered_by_version_id(self):
        segments = {
            20: [_segment(segment_id="x", version_id=20, start="2026-05-27T10:10:00Z", end="2026-05-27T10:10:10Z")],
            10: [_segment(segment_id="a", version_id=10, start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z")],
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert [cl.version_id for cl in result] == [10, 20]
        assert result[0].cuts[0].transcript_segment_ids == ["a"]
        assert result[1].cuts[0].transcript_segment_ids == ["x"]

    def test_unsorted_segments_are_sorted_by_start(self):
        # Provide out-of-order; builder must sort by absolute_start_time. The
        # two segments are within the gap threshold so they form one run.
        segments = {
            10: [
                _segment(segment_id="b", start="2026-05-27T10:05:11Z", end="2026-05-27T10:05:30Z"),
                _segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z"),
            ]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        cut = result[0].cuts[0]
        assert cut.transcript_segment_ids == ["a", "b"]
        assert cut.video_in_seconds == 300.0
        assert cut.video_out_seconds == 330.0

    def test_cut_entirely_before_recording_is_dropped(self):
        # Segment ends before t0 -> negative offsets -> dropped.
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T09:00:00Z", end="2026-05-27T09:00:10Z")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert result[0].cuts == []

    def test_cut_entirely_after_recording_is_dropped(self):
        # Starts after the recording ends (>3600s) -> dropped.
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T11:30:00Z", end="2026-05-27T11:30:10Z")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert result[0].cuts == []

    def test_cut_overlapping_start_is_clamped_to_zero(self):
        # Starts 30s before t0, ends 30s after -> clamp in to 0.0.
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T09:59:30Z", end="2026-05-27T10:00:30Z")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        cut = result[0].cuts[0]
        assert cut.video_in_seconds == 0.0
        assert cut.video_out_seconds == 30.0

    def test_cut_overlapping_end_is_clamped_to_duration(self):
        # Duration 100s; run is 90s..130s -> clamp out to 100.
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T10:01:30Z", end="2026-05-27T10:02:10Z")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=100.0)

        cut = result[0].cuts[0]
        assert cut.video_in_seconds == 90.0
        assert cut.video_out_seconds == 100.0

    def test_body_hash_is_stable_across_rebuilds(self):
        segments = {
            10: [
                _segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z"),
                _segment(segment_id="b", start="2026-05-27T10:06:10Z", end="2026-05-27T10:06:20Z"),
            ]
        }

        first = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)
        second = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert first[0].body_hash == second[0].body_hash
        assert first[0].body_hash  # non-empty

    def test_body_hash_changes_when_cuts_change(self):
        base = {
            10: [_segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:10Z")]
        }
        changed = {
            10: [_segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:20Z")]
        }

        h1 = build_video_cuts_payload(base, recording_t0=T0, recording_duration_seconds=DURATION)[0].body_hash
        h2 = build_video_cuts_payload(changed, recording_t0=T0, recording_duration_seconds=DURATION)[0].body_hash

        assert h1 != h2

    def test_version_with_only_out_of_bounds_segments_yields_empty_cuts(self):
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T09:00:00Z", end="2026-05-27T09:00:10Z")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert len(result) == 1
        assert result[0].version_id == 10
        assert result[0].cuts == []

    def test_zero_length_run_inside_bounds_is_dropped(self):
        # A degenerate segment whose start == end collapses to a zero-length
        # cut after clamping and must be dropped rather than emitted.
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T10:05:00Z", end="2026-05-27T10:05:00Z")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        assert result[0].cuts == []

    def test_naive_absolute_timestamps_treated_as_utc(self):
        # No tz suffix -> must be read as UTC, not host-local.
        segments = {
            10: [_segment(segment_id="a", start="2026-05-27T10:05:00", end="2026-05-27T10:05:10")]
        }

        result = build_video_cuts_payload(segments, recording_t0=T0, recording_duration_seconds=DURATION)

        cut = result[0].cuts[0]
        assert cut.video_in_seconds == 300.0
        assert cut.video_out_seconds == 310.0
