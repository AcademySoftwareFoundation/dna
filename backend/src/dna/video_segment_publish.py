"""Pure cut-list builder and Zoom alignment helper for video segmenting.

Slice 1 of the movie-file-segmenting feature. The video segmenter is a *replay*
of segmentation decisions already made live during the review meeting: each
stored transcript segment carries wall-clock timestamps, and the spans between
gaps (Vexa pauses) and version toggles are already encoded in those timestamps.
Nothing here invents segmentation — it only translates wall-clock spans into
video offsets relative to a known recording start.

Kept pure on purpose: no storage, no provider, no ffmpeg, no FastAPI. Callers
live in main.py (the upload/publish endpoints) and tests.
"""

import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from zoneinfo import ZoneInfo

from dna.models.stored_segment import StoredSegment

# Gap between consecutive segments above which a new cut begins. A gap means
# either Vexa was paused or a different version was in-review during that
# interval — either way it is a cut boundary. Env-configurable; the default is
# a starting guess to be validated against real meeting data.
DEFAULT_SEGMENT_RUN_GAP_SECONDS = float(os.getenv("SEGMENT_RUN_GAP_SECONDS", "2.0"))

# Zoom names its recording folder in the host's local time, e.g.
# "2026-05-27 06.44.49 Cameron Target's Zoom Meeting". Stored segments are UTC,
# so we attach this zone to the parsed naive datetime before converting to UTC.
# Env-configurable (IANA name); defaults to America/New_York for the PoC.
DEFAULT_RECORDING_TIMEZONE = "America/New_York"

# "YYYY-MM-DD HH.MM.SS" prefix; the meeting title (if any) follows and is ignored.
_ZOOM_FOLDER_RE = re.compile(
    r"^(?P<y>\d{4})-(?P<mo>\d{2})-(?P<d>\d{2})\s+"
    r"(?P<h>\d{2})\.(?P<mi>\d{2})\.(?P<s>\d{2})"
)


@dataclass(slots=True)
class VideoCut:
    """One rendered clip: a [in, out) span of the recording, in seconds."""

    video_in_seconds: float
    video_out_seconds: float
    transcript_segment_ids: list[str] = field(default_factory=list)


@dataclass(slots=True)
class VersionCutList:
    """All cuts for a single version, plus a stable hash for idempotence."""

    version_id: int
    cuts: list[VideoCut]
    body_hash: str


def _recording_timezone() -> ZoneInfo:
    """The zone Zoom folder names are written in (env-configurable)."""
    name = os.getenv("ZOOM_RECORDING_TIMEZONE", DEFAULT_RECORDING_TIMEZONE)
    return ZoneInfo(name)


def parse_recording_t0_from_zoom_folder(folder_name: str) -> datetime:
    """Parse a Zoom recording folder name into the recording's UTC start instant.

    Zoom folders are named "YYYY-MM-DD HH.MM.SS <meeting title>" in the host's
    local time. We read that local wall-clock, attach ZOOM_RECORDING_TIMEZONE,
    and convert to UTC so it can be subtracted from the (UTC) segment timestamps.

    Raises ValueError if the folder name does not start with a Zoom timestamp.
    """
    match = _ZOOM_FOLDER_RE.match(folder_name.strip())
    if match is None:
        raise ValueError(
            f"Could not parse a Zoom recording start time from folder name: "
            f"{folder_name!r}. Expected a 'YYYY-MM-DD HH.MM.SS ...' prefix."
        )
    parts = {k: int(v) for k, v in match.groupdict().items()}
    local = datetime(
        parts["y"], parts["mo"], parts["d"],
        parts["h"], parts["mi"], parts["s"],
        tzinfo=_recording_timezone(),
    )
    return local.astimezone(timezone.utc)


def _parse_utc(raw: str) -> datetime:
    """Parse a stored segment ISO timestamp as UTC.

    Naive timestamps are UTC per the StoredSegment contract; don't let
    astimezone() guess from the host TZ. Handles the trailing-'Z' form that
    datetime.fromisoformat rejected before 3.11.
    """
    normalized = raw.replace("Z", "+00:00") if raw.endswith("Z") else raw
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _body_hash(version_id: int, cuts: list[VideoCut]) -> str:
    """Stable sha256 over a version's cut list for republish idempotence.

    Offsets are rounded to milliseconds so float repr noise can't perturb the
    hash when the same inputs are rebuilt.
    """
    canonical = json.dumps(
        {
            "version_id": version_id,
            "cuts": [
                {
                    "in": round(c.video_in_seconds, 3),
                    "out": round(c.video_out_seconds, 3),
                    "segment_ids": list(c.transcript_segment_ids),
                }
                for c in cuts
            ],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


def build_video_cuts_payload(
    segments_by_version: dict[int, list[StoredSegment]],
    *,
    recording_t0: datetime,
    recording_duration_seconds: float,
    gap_seconds: float = DEFAULT_SEGMENT_RUN_GAP_SECONDS,
) -> list[VersionCutList]:
    """Translate stored segments into per-version video cut lists.

    For each version (emitted in ascending version_id order):
      1. Sort its segments by wall-clock start.
      2. Group into runs, starting a new run wherever the gap from the previous
         segment's end to the next segment's start exceeds ``gap_seconds``.
      3. Emit one cut per run: [first.start - t0, last.end - t0) in seconds.
      4. Drop cuts entirely outside [0, recording_duration]; clamp partial
         overlaps to that range.

    Versions whose segments all fall outside the recording are still returned,
    with an empty ``cuts`` list, so the caller can report "nothing to publish".
    """
    result: list[VersionCutList] = []

    for version_id in sorted(segments_by_version):
        parsed = sorted(
            (
                (_parse_utc(s.absolute_start_time), _parse_utc(s.absolute_end_time), s.segment_id)
                for s in segments_by_version[version_id]
            ),
            key=lambda t: (t[0], t[1]),
        )

        runs: list[list[tuple[datetime, datetime, str]]] = []
        for seg in parsed:
            if runs and (seg[0] - runs[-1][-1][1]).total_seconds() <= gap_seconds:
                runs[-1].append(seg)
            else:
                runs.append([seg])

        cuts: list[VideoCut] = []
        for run in runs:
            video_in = (run[0][0] - recording_t0).total_seconds()
            video_out = (run[-1][1] - recording_t0).total_seconds()
            # Entirely outside the recording window -> no media to cut.
            if video_out <= 0 or video_in >= recording_duration_seconds:
                continue
            video_in = max(0.0, video_in)
            video_out = min(recording_duration_seconds, video_out)
            if video_out <= video_in:
                continue
            cuts.append(
                VideoCut(
                    video_in_seconds=video_in,
                    video_out_seconds=video_out,
                    transcript_segment_ids=[s[2] for s in run],
                )
            )

        result.append(
            VersionCutList(
                version_id=version_id,
                cuts=cuts,
                body_hash=_body_hash(version_id, cuts),
            )
        )

    return result
