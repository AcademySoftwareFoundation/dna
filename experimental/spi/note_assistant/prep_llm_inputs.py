
import argparse
import csv
import re
import datetime
import difflib
from dataclasses import dataclass
from typing import List, Optional, Tuple, Dict

@dataclass
class SpeakerTurn:
    """Represents a single speaker turn with timestamp and text."""
    timestamp: datetime.datetime
    speaker: str
    dialogue: str
    review_segment: str = ""  # Optional review_segment information

@dataclass
class VttSegment:
    """Represents a single VTT segment with start/end times and text."""
    start_time: datetime.timedelta
    end_time: datetime.timedelta
    text: str

def parse_gemini_transcript(filepath: str) -> Tuple[datetime.datetime, List[SpeakerTurn]]:
    """
    Parse the Gemini-generated transcript file.
    
    Returns:
        Tuple containing the meeting start time and a list of speaker turns.
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Extract meeting start time from the first line
    title_line = lines[0].strip()
    date_time_match = re.search(r'(\d{4}/\d{2}/\d{2}\s+\d{1,2}:\d{2})', title_line)
    if not date_time_match:
        raise ValueError(f"Could not extract meeting start time from: {title_line}")
    
    # Parse the meeting start time
    meeting_start_str = date_time_match.group(1)
    meeting_start = datetime.datetime.strptime(meeting_start_str, "%Y/%m/%d %H:%M")
    
    # Skip header lines to find where the transcript starts
    transcript_start_idx = -1
    for i, line in enumerate(lines):
        if line.strip() == "Transcript":
            transcript_start_idx = i + 1
            break
    
    if transcript_start_idx == -1:
        raise ValueError("Could not find 'Transcript' marker in the file")
    
    # Process the transcript lines
    current_marker_time = datetime.timedelta()
    current_speaker = None
    turns = []
    
    for line in lines[transcript_start_idx:]:
        line = line.strip()
        if not line:
            continue
            
        # Skip footer lines starting with "Meeting ended after"
        if line.startswith("Meeting ended after"):
            break
        
        # Check if this is a time marker (e.g. "00:05:00")
        time_marker_match = re.match(r'^(\d{2}):(\d{2}):(\d{2})$', line)
        if time_marker_match:
            hours, minutes, seconds = map(int, time_marker_match.groups())
            current_marker_time = datetime.timedelta(
                hours=hours, 
                minutes=minutes, 
                seconds=seconds
            )
            continue
        
        # Check if this is a speaker line
        speaker_match = re.match(r'^([^:]+):\s*(.*)$', line)
        if speaker_match:
            # If we already have a speaker, add their turn before starting a new one
            if current_speaker and turns and turns[-1].speaker == current_speaker:
                # Don't create a new turn, this is just to avoid extra logic below
                pass
            
            speaker, text = speaker_match.groups()
            current_speaker = speaker
            
            # Calculate absolute timestamp
            absolute_time = meeting_start + current_marker_time
            
            turns.append(SpeakerTurn(
                timestamp=absolute_time,
                speaker=speaker,
                dialogue=text
            ))
        elif current_speaker and turns:
            # This is a continuation line, append to the previous speaker's dialogue
            turns[-1].dialogue += " " + line
    
    # Aggregate consecutive turns from the same speaker
    aggregated_turns = []
    for turn in turns:
        if (aggregated_turns and 
            aggregated_turns[-1].speaker == turn.speaker and 
            aggregated_turns[-1].timestamp == turn.timestamp):
            # Same speaker, same timestamp - append to previous turn
            aggregated_turns[-1].dialogue += " " + turn.dialogue
        else:
            # New speaker or new timestamp - add as new turn
            aggregated_turns.append(turn)
    
    return meeting_start, aggregated_turns


def parse_review_timestamps(filepath: str) -> List[Tuple[datetime.datetime, str]]:
    """
    Parse the review timestamp file to extract timestamps and review segments.
    
    Returns:
        List of tuples containing timestamp and review segment.
    """
    review_segments = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    review_segment_pattern = r'^(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d+):\s*(.+)$'
    
    for line in lines:
        line = line.strip()
        if not line or ":" not in line:
            continue
            
        match = re.match(review_segment_pattern, line)
        if match:
            month, day, year, hour, minute, second, microsec, review_segment = match.groups()
            
            # Convert two-digit year to four-digit
            year_int = int(year)
            if year_int < 50:  # Assume 20xx for years less than 50
                year = f"20{year}"
            else:  # Assume 19xx for years 50+
                year = f"19{year}"
                
            # Create datetime object
            timestamp = datetime.datetime(
                int(year), int(month), int(day),
                int(hour), int(minute), int(second),
                int(microsec) if len(microsec) <= 6 else int(microsec[:6])
            )
            
            review_segments.append((timestamp, review_segment))
    
    return sorted(review_segments, key=lambda x: x[0])


def assign_reviews_to_turns(
    turns: List[SpeakerTurn], 
    reviews: List[Tuple[datetime.datetime, str]],
    meeting_start: datetime.datetime
) -> List[SpeakerTurn]:
    """
    Assign reviews to speaker turns based on closest timestamps.
    
    Returns:
        List of SpeakerTurn objects with review information.
    """
    if not reviews:
        return turns
        
    # Calculate time differences between first review and meeting start
    # This helps align the two time streams
    review_start = reviews[0][0]
    time_offset = meeting_start - review_start

    # Create a list of aligned review timestamps
    aligned_reviews = [(t + time_offset, review) for t, review in reviews]
    
    current_review_idx = 0
    updated_turns = []
    
    for turn in turns:
        # Find the closest review that doesn't come after this turn
        while (current_review_idx + 1 < len(aligned_reviews) and 
               aligned_reviews[current_review_idx + 1][0] <= turn.timestamp):
            current_review_idx += 1
            
        # Assign the review if available
        if current_review_idx < len(aligned_reviews):
            review = aligned_reviews[current_review_idx][1]
        else:
            review = ""
            
        updated_turns.append(SpeakerTurn(
            timestamp=turn.timestamp,
            speaker=turn.speaker,
            dialogue=turn.dialogue,
            review_segment=review
        ))
    
    return updated_turns


def parse_whisper_vtt(filepath: str) -> List[VttSegment]:
    """Parse the Whisper VTT file into segments."""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    segments = []
    i = 0
    
    # Skip the WEBVTT header
    while i < len(lines) and not lines[i].strip().startswith('00:'):
        i += 1
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Parse timestamp line
        timestamp_match = re.match(
            r'(\d{2}):(\d{2})[\.:](\d{3})\s+-->\s+(\d{2}):(\d{2})[\.:](\d{3})', 
            line
        )
        
        if timestamp_match:
            start_min, start_sec, start_ms, end_min, end_sec, end_ms = map(
                int, timestamp_match.groups())
            
            start_time = datetime.timedelta(
                minutes=start_min,
                seconds=start_sec,
                milliseconds=start_ms
            )
            
            end_time = datetime.timedelta(
                minutes=end_min,
                seconds=end_sec,
                milliseconds=end_ms
            )
            
            # Get the text (next line)
            i += 1
            if i < len(lines):
                text = lines[i].strip()
                segments.append(VttSegment(start_time, end_time, text))
            
        i += 1
    
    return segments


def align_with_vtt(
    turns: List[SpeakerTurn], 
    vtt_segments: List[VttSegment], 
    meeting_start: datetime.datetime
) -> List[SpeakerTurn]:
    """
    Align Gemini transcript turns with Whisper VTT segments for more accurate timestamps.
    
    Returns:
        List of SpeakerTurn objects with updated timestamps.
    """
    aligned_turns = []
    last_assigned_time = datetime.timedelta()
    vtt_idx = 0
    
    for turn in turns:
        turn_offset = turn.timestamp - meeting_start
        
        # Find the best matching VTT segment
        best_match = None
        best_score = -1
        best_vtt_idx = vtt_idx
        
        # Look ahead in VTT segments to find a good match
        for j in range(vtt_idx, min(vtt_idx + 20, len(vtt_segments))):
            segment = vtt_segments[j]
            
            # Skip segments that would move time backwards
            if segment.start_time < last_assigned_time:
                continue
                
            # Use difflib to compare text similarity
            score = difflib.SequenceMatcher(
                None, 
                turn.dialogue.lower(), 
                segment.text.lower()
            ).ratio()
            
            if score > best_score:
                best_score = score
                best_match = segment
                best_vtt_idx = j
        
        # If we found a good match, use its timestamp
        if best_match and best_score > 0.3:  # Threshold for accepting a match
            new_timestamp = meeting_start + best_match.start_time
            vtt_idx = best_vtt_idx + 1  # Move past this segment
            last_assigned_time = best_match.start_time
        else:
            # Fall back to Gemini-derived timestamp
            # Ensure we don't go backwards in time
            if turn_offset < last_assigned_time:
                new_timestamp = meeting_start + last_assigned_time
            else:
                new_timestamp = turn.timestamp
                last_assigned_time = turn_offset
        
        aligned_turns.append(SpeakerTurn(
            timestamp=new_timestamp,
            speaker=turn.speaker,
            dialogue=turn.dialogue,
            review_segment=turn.review_segment  # Preserve review_segment if it exists
        ))
    
    return aligned_turns

def get_initials(full_name):
    """Extracts initials from a full name.

    - For names with two or more parts (e.g., "John Doe"), it returns the
      first letter of the first part and the first letter of the second part,
      both uppercased (e.g., "JD").
    - For names with a single part (e.g., "John" or "J"), it returns the
      first letter of that part, uppercased (e.g., "J").
    - For empty strings or strings with only whitespace, it returns an
      empty string.

    Args:
        full_name (str): The full name string.

    Returns:
        str: The extracted initials, uppercased, or an empty string.
    """
    parts = full_name.strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    else:
        return ''.join([p[0].upper() for p in parts if p])

def extract_shot_id(path: str) -> str:
    """
    Extracts the second and third significant segments from a path-like string.

    The function splits the path by '/', filters out empty segments (e.g.,
    from leading/trailing or double slashes), and returns the second and
    third non-empty segments joined by '/'. If fewer than three non-empty
    segments exist, it returns "N/A".

    Examples:
        - "/Project/Shot/VersionID/Artist" -> "Shot/VersionID"
        - "/alpha/beta/gamma"                     -> "beta/gamma"
        - "/alpha"                                -> "N/A"
        - "" or "///"                             -> "N/A"

    Args:
        path: The input string, typically a file path or a similar
              slash-separated identifier.
    """
    parts = path.strip().split('/')
    meaningful_parts = [part for part in parts if part]  # Filter out empty strings

    if len(meaningful_parts) >= 3:  # Need at least three parts for 2nd and 3rd
        return f"{meaningful_parts[1]}/{meaningful_parts[2]}"  # 2nd is index 1, 3rd is index 2
    else:
        return "N/A"  # Not enough segments to extract the 2nd and 3rd

def write_review_dialogues_csv(turns: List[SpeakerTurn], output_file: str):
    """
    Write a CSV file with dialogues grouped by review.
    Each row contains a review and all dialogues for that review.
    
    Format:
    timestamp, shot/id, conversation
    where conversation is formatted as "speaker1:dialogue\nspeaker2:dialogue..."
    
    Args:
        turns: List of speaker turns with review information
        output_file: Path to write the output CSV
    """
    # Group turns by review
    review_groups = {}
    
    for turn in turns:
        review = turn.review_segment
        if not review:
            review = "unknown"  # Use "unknown" for turns without a review
            
        if review not in review_groups:
            # For each review, store first timestamp and accumulate dialogues
            review_groups[review] = {
                'timestamp': turn.timestamp,
                'dialogues': []
            }
        
        initials = get_initials(turn.speaker)
        
        # Add this turn's dialogue to the review group
        review_groups[review]['dialogues'].append(f"{initials}:{turn.dialogue}")
    
    # Write to CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_NONNUMERIC)
        writer.writerow(['timestamp', 'shot/id', 'conversation'])
        
        # Sort reviews by their first occurrence timestamp
        sorted_reviews = sorted(review_groups.items(), 
                              key=lambda x: x[1]['timestamp'])
        
        for review, data in sorted_reviews:
            timestamp_str = data['timestamp'].strftime('%H:%M:%S')
            conversation = '\n'.join(data['dialogues'])
            shot_id = extract_shot_id(review)            
            writer.writerow([timestamp_str, shot_id, conversation])
    
def main():
    parser = argparse.ArgumentParser(
        description='Create data from various sources into a format suitable for LLM based analysis'
    )
    parser.add_argument('--gemini_transcript', required=True, help='Path to the Gemini transcript file')
    parser.add_argument('--vtt', help='Optional path to Whisper VTT file for granular timestamp alignment')
    parser.add_argument('--review_timestamps', help='Optional path to review timestamps file for assigning review segments to turns')
    parser.add_argument('review_dialogues_csv', help='Output CSV file path for dialogues grouped by review segments')
    
    args = parser.parse_args()
    
    if args.gemini_transcript is None:
        # Currently only supports transcripts from Gemini
        # TODO: support Zoom and other providers
        print("Error: --gemini_transcript is required")
        return
    
    # Parse the Gemini transcript
    meeting_start, turns = parse_gemini_transcript(args.gemini_transcript)
    
    # If VTT file is provided, align timestamps for more granular data
    # This may be needed in case of gemini where the timestamps are only in 5 minute intervals
    if args.vtt:
        vtt_segments = parse_whisper_vtt(args.vtt)
        turns = align_with_vtt(turns, vtt_segments, meeting_start)
    
    # If review_timestamps file is provided, assign review segments to turns
    if args.review_timestamps:
        review_segments = parse_review_timestamps(args.review_timestamps)
        turns = assign_reviews_to_turns(turns, review_segments, meeting_start)

    # Write the review_segment_dialogues CSV (now a required output)
    write_review_dialogues_csv(turns, args.review_dialogues_csv)

if __name__ == "__main__":
    main()