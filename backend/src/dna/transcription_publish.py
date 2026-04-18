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
    # 空白 segment 先過濾，不然後面會出現 "Speaker: " 這種空行
    cleaned = [s for s in segments if s.text and s.text.strip()]

    # 以 (時間, 文字 hash 前 12 碼) 當 key，重複的留較新的 updated_at
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
        # 同一個人連續講話時合併成一行，減少 SG 上的行數雜訊
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
    # ISO 8601 的 Z 字尾 fromisoformat 吃不下，先換成 +00:00
    normalized = raw.replace("Z", "+00:00") if raw.endswith("Z") else raw
    return datetime.fromisoformat(normalized).astimezone(timezone.utc).date()
