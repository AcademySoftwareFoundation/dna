"""Build a publishable transcript payload from stored segments.

Converts a list of StoredSegment rows into a single body string plus
a body_hash the caller can use for idempotence checks. Kept pure on
purpose: no storage, no provider, no FastAPI. Callers live in main.py
and the future re-sync CLI.
"""

from dataclasses import dataclass
from datetime import date, datetime, timezone
from hashlib import sha256

from dna.models.stored_segment import StoredSegment


@dataclass(slots=True)
class TranscriptPayload:
    """What the publisher hands to the prodtrack provider."""

    body: str
    meeting_date: date
    body_hash: str
    segments_count: int


def build_transcript_payload(segments: list[StoredSegment]) -> TranscriptPayload:
    """Turn a list of stored segments into a publish-ready payload.

    Rules applied in order: drop whitespace-only text, dedupe exact
    (start_time, text) repeats keeping the latest updated_at, sort by
    start_time, collapse consecutive same-speaker rows, then render
    as "Speaker: text" lines.
    """
    cleaned = [s for s in segments if s.text and s.text.strip()]

    latest: dict[tuple[str, str], StoredSegment] = {}
    for seg in cleaned:
        text_sig = sha256(seg.text.encode("utf-8")).hexdigest()[:12]
        key = (seg.absolute_start_time, text_sig)
        prev = latest.get(key)
        if prev is None or seg.updated_at > prev.updated_at:
            latest[key] = seg

    ordered = sorted(latest.values(), key=lambda s: s.absolute_start_time)

    lines: list[str] = []
    last_speaker: str | None = None
    for seg in ordered:
        speaker = (seg.speaker or "").strip() or "Unknown"
        text = seg.text.strip()
        if lines and speaker == last_speaker:
            lines[-1] = f"{lines[-1]} {text}"
        else:
            lines.append(f"{speaker}: {text}")
            last_speaker = speaker

    body = "\n".join(lines)
    body_hash = sha256(body.encode("utf-8")).hexdigest()
    meeting_date = _first_segment_date(ordered)

    return TranscriptPayload(
        body=body,
        meeting_date=meeting_date,
        body_hash=body_hash,
        segments_count=len(ordered),
    )


def _first_segment_date(ordered: list[StoredSegment]) -> date:
    if not ordered:
        return datetime.now(timezone.utc).date()
    raw = ordered[0].absolute_start_time
    # fromisoformat before 3.11 chokes on the "Z" suffix; normalize first.
    normalized = raw.replace("Z", "+00:00") if raw.endswith("Z") else raw
    dt = datetime.fromisoformat(normalized)
    # Naive timestamps are UTC per the StoredSegment contract; don't let
    # astimezone() guess from the host TZ.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date()
