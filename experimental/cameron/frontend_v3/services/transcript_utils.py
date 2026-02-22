"""
Transcript Utilities
Helper functions for processing and merging transcript segments
Ported from TypeScript version
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Set


def clean_text(text: str) -> str:
    """Clean and normalize text"""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip())


def get_abs_key(segment: Dict[str, Any]) -> str:
    """
    Get a unique key for a segment based on absolute UTC timestamp

    Args:
        segment: Segment dictionary

    Returns:
        Key string for deduplication
    """
    return (
        segment.get("absolute_start_time")
        or segment.get("timestamp")
        or segment.get("created_at")
        or f"no-utc-{segment.get('id', '')}"
    )


def merge_segments_by_absolute_utc(
    prev_segments: List[Dict[str, Any]], incoming_segments: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Merge segments by absolute UTC timestamp, avoiding duplicates

    Args:
        prev_segments: Previously received segments
        incoming_segments: New incoming segments

    Returns:
        Merged and deduplicated segment list
    """
    segment_map = {}

    # Add previous segments to map
    for seg in prev_segments:
        key = get_abs_key(seg)
        if key.startswith("no-utc-"):
            continue  # Skip segments without proper UTC timestamp
        segment_map[key] = {**seg, "text": clean_text(seg.get("text", ""))}

    # Add/update with incoming segments
    for seg in incoming_segments:
        if not seg.get("absolute_start_time"):
            continue  # Only process segments with absolute timestamps

        key = get_abs_key(seg)
        if key.startswith("no-utc-"):
            continue

        existing = segment_map.get(key)
        candidate = {**seg, "text": clean_text(seg.get("text", ""))}

        # If segment exists, only update if incoming is better
        if existing:
            # Prefer segment with updated_at timestamp (newer)
            if existing.get("updated_at") and candidate.get("updated_at"):
                if candidate["updated_at"] < existing["updated_at"]:
                    continue  # Skip older version

            # For mutable segments with same timestamp, prefer longer text
            # (as speech recognition progressively adds more words)
            existing_len = len(existing.get("text", ""))
            candidate_len = len(candidate.get("text", ""))

            if candidate_len < existing_len:
                continue  # Skip shorter text (less complete transcription)

        segment_map[key] = candidate

    # Sort by absolute_start_time
    segments = list(segment_map.values())
    segments.sort(
        key=lambda s: datetime.fromisoformat(
            (s.get("absolute_start_time") or s.get("timestamp")).replace("Z", "+00:00")
        )
    )

    return segments


def split_text_into_sentence_chunks(text: str, max_len: int = 512) -> List[str]:
    """
    Split long text into chunks without breaking sentences

    Args:
        text: Text to split
        max_len: Maximum chunk length

    Returns:
        List of text chunks
    """
    normalized = clean_text(text)
    if len(normalized) <= max_len:
        return [normalized]

    # Split into sentences on punctuation boundaries
    sentences = re.split(r"(?<=[.!?])\s+", normalized)

    if len(sentences) == 1:
        # Single long sentence: return as one chunk to avoid breaking
        return [normalized]

    chunks = []
    current = ""

    for sentence in sentences:
        if not current:
            if len(sentence) > max_len:
                chunks.append(sentence)
            else:
                current = sentence
        elif len(current) + 1 + len(sentence) <= max_len:
            current = current + " " + sentence
        else:
            chunks.append(current)
            if len(sentence) > max_len:
                chunks.append(sentence)
                current = ""
            else:
                current = sentence

    if current:
        chunks.append(current)

    return chunks


class SpeakerGroup:
    """Represents a group of consecutive segments from the same speaker"""

    def __init__(
        self,
        speaker: str,
        start_time: str,
        end_time: str,
        combined_text: str,
        segments: List[Dict[str, Any]],
        is_mutable: bool = False,
        is_highlighted: bool = False,
    ):
        self.speaker = speaker
        self.start_time = start_time
        self.end_time = end_time
        self.combined_text = combined_text
        self.segments = segments
        self.is_mutable = is_mutable
        self.is_highlighted = is_highlighted
        self.timestamp = self._format_timestamp(start_time)

    def _format_timestamp(self, iso_time: str) -> str:
        """Format ISO timestamp as HH:MM:SS in local time"""
        if not iso_time:
            return ""
        try:
            dt = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
            return dt.strftime("%H:%M:%S")
        except:
            return ""


def group_segments_by_speaker(
    segments: List[Dict[str, Any]],
    mutable_segment_ids: Set[str] = None,
    new_mutable_segment_ids: Set[str] = None,
    max_chars: int = 512,
) -> List[SpeakerGroup]:
    """
    Group consecutive segments by speaker and combine text

    Args:
        segments: List of segment dictionaries
        mutable_segment_ids: Set of IDs for segments that are still mutable
        new_mutable_segment_ids: Set of IDs for newly arrived mutable segments
        max_chars: Maximum characters per group before splitting

    Returns:
        List of SpeakerGroup objects
    """
    if not segments:
        return []

    if mutable_segment_ids is None:
        mutable_segment_ids = set()
    if new_mutable_segment_ids is None:
        new_mutable_segment_ids = set()

    # Sort segments by absolute UTC timestamp
    sorted_segments = sorted(
        segments,
        key=lambda s: (
            bool(
                s.get("absolute_start_time")
            ),  # Prioritize segments with absolute time
            datetime.fromisoformat(
                (s.get("absolute_start_time") or s.get("timestamp")).replace(
                    "Z", "+00:00"
                )
            ),
        ),
    )

    groups = []
    current_group = None

    for seg in sorted_segments:
        speaker = seg.get("speaker", "Unknown Speaker")
        text = clean_text(seg.get("text", ""))
        start_time = seg.get("absolute_start_time") or seg.get("timestamp")
        end_time = seg.get("absolute_end_time") or seg.get("timestamp")
        seg_key = get_abs_key(seg)

        seg_is_mutable = seg_key in mutable_segment_ids
        seg_is_highlighted = seg_key in new_mutable_segment_ids

        if not text:
            continue

        # Group consecutive segments from same speaker
        if current_group and current_group.speaker == speaker:
            current_group.combined_text += " " + text
            current_group.end_time = end_time
            current_group.segments.append(seg)
            current_group.is_mutable = current_group.is_mutable or seg_is_mutable
            current_group.is_highlighted = (
                current_group.is_highlighted or seg_is_highlighted
            )
        else:
            if current_group:
                groups.append(current_group)
            current_group = SpeakerGroup(
                speaker=speaker,
                start_time=start_time,
                end_time=end_time,
                combined_text=text,
                segments=[seg],
                is_mutable=seg_is_mutable,
                is_highlighted=seg_is_highlighted,
            )

    if current_group:
        groups.append(current_group)

    # Split long combined text into readable chunks
    split_groups = []
    for group in groups:
        chunks = split_text_into_sentence_chunks(group.combined_text, max_chars)
        if len(chunks) <= 1:
            split_groups.append(group)
        else:
            # Create separate groups for each chunk
            for chunk in chunks:
                split_groups.append(
                    SpeakerGroup(
                        speaker=group.speaker,
                        start_time=group.start_time,
                        end_time=group.end_time,
                        combined_text=chunk,
                        segments=group.segments,
                        is_mutable=group.is_mutable,
                        is_highlighted=group.is_highlighted,
                    )
                )

    return split_groups


def process_segments(segments: List[Dict[str, Any]]) -> List[SpeakerGroup]:
    """
    Process segments: convert, sort, and group by speaker

    Args:
        segments: Raw segment list

    Returns:
        List of grouped and formatted SpeakerGroup objects
    """
    # Filter segments with absolute_start_time and sort
    sorted_segments = sorted(
        [s for s in segments if s.get("absolute_start_time")],
        key=lambda s: datetime.fromisoformat(
            s["absolute_start_time"].replace("Z", "+00:00")
        ),
    )

    # Group by speaker
    return group_segments_by_speaker(sorted_segments)


def format_transcript_for_display(speaker_groups: List[SpeakerGroup]) -> str:
    """
    Format speaker groups into readable transcript text

    Args:
        speaker_groups: List of SpeakerGroup objects

    Returns:
        Formatted transcript string
    """
    lines = []
    for group in speaker_groups:
        timestamp = f"[{group.timestamp}] " if group.timestamp else ""
        lines.append(f"{timestamp}{group.speaker}: {group.combined_text}")

    return "\n".join(lines)
