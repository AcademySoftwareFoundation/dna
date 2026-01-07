#!/usr/bin/env python3
"""
Script to combine ShotGrid notes with Google Meet transcript data.

This script takes a ShotGrid CSV export and a Google Meet transcript CSV,
matches them by version numbers, and creates a combined output with:
- timestamp: earliest timestamp for each version
- version_id: the version number from ShotGrid  
- conversation: all transcript conversations for that version
- sg_summary: the notes from ShotGrid
- reference_versions: additional versions discussed but not in ShotGrid
"""

import argparse
import csv
import re
import sys
from collections import defaultdict, OrderedDict
from typing import Dict, List, Tuple, Optional, Set
from datetime import datetime, timedelta


def extract_version_number(text: str, pattern: str) -> Optional[str]:
    """Extract version number from text using regex pattern."""
    if not text or not pattern:
        return None
    
    match = re.search(pattern, str(text))
    if match:
        return match.group(1) if match.groups() else match.group(0)
    
    # If no pattern match, try to use the text as-is if it's numeric
    text_str = str(text).strip()
    if text_str.isdigit():
        return text_str
    
    return None


def load_sg_data(filepath: str, version_column: str, pattern: str) -> Dict[str, Dict]:
    """Load ShotGrid data and extract version numbers."""
    sg_data = {}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            if version_column not in row:
                continue
                
            version_raw = row[version_column]
            version_num = extract_version_number(version_raw, pattern)
            
            if version_num:
                sg_data[version_num] = {
                    'notes': row.get('notes', row.get('Notes', '')),
                    'shot': row.get('shot', row.get('Shot', '')),
                    'jts': version_raw,
                    'row': row
                }
    
    return sg_data


def load_transcript_data(filepath: str, version_column: str, pattern: str) -> Tuple[Dict[str, List], List]:
    """Load transcript data and group by version number."""
    transcript_data = defaultdict(list)
    chronological_order = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            version_raw = row.get(version_column, '')
            version_num = extract_version_number(version_raw, pattern)
            
            transcript_entry = {
                'timestamp': row.get('timestamp', ''),
                'speaker': row.get('speaker_name', ''),
                'text': row.get('transcript_text', ''),
                'version_raw': version_raw,
                'version_num': version_num
            }
            
            chronological_order.append(transcript_entry)
            
            if version_num:
                transcript_data[version_num].append(transcript_entry)
    
    return dict(transcript_data), chronological_order


def format_conversation(conversations: List[Dict]) -> str:
    """Format conversation entries into a readable string with version markers."""
    if not conversations:
        return ""

    # Sort by timestamp to maintain chronological order
    sorted_conversations = sorted(conversations, key=lambda x: x.get('timestamp', ''))

    formatted_lines = []
    previous_version = None

    for conv in sorted_conversations:
        speaker = conv.get('speaker', 'Unknown')
        text = conv.get('text', '').strip()
        version_num = conv.get('version_num')
        timestamp = conv.get('timestamp', '')

        # Insert version marker when version changes
        if version_num and version_num != previous_version:
            formatted_lines.append(f"[{version_num}, {timestamp}]")
            previous_version = version_num

        if text:
            # We have actual transcript text
            formatted_lines.append(f"{speaker}: {text}")
        elif speaker and speaker != 'Unknown':
            # We don't have transcript text but we have speaker info
            # This indicates a conversation occurred but text wasn't captured
            formatted_lines.append(f"{speaker}: [conversation occurred]")

    return '\n'.join(formatted_lines)


def get_earliest_timestamp(conversations: List[Dict]) -> str:
    """Get the earliest timestamp from a list of conversations."""
    if not conversations:
        return ""
    
    timestamps = [conv.get('timestamp', '') for conv in conversations if conv.get('timestamp')]
    return min(timestamps) if timestamps else ""


def parse_timestamp(timestamp_str: str) -> Optional[datetime]:
    """Parse timestamp string to datetime object."""
    if not timestamp_str:
        return None
    
    try:
        # Handle format: HH:MM:SS or MM:SS:SS
        parts = timestamp_str.split(':')
        if len(parts) == 3:
            hours, minutes, seconds = map(int, parts)
            # Use a fixed date since we only care about time differences
            return datetime(2000, 1, 1, hours, minutes, seconds)
    except (ValueError, TypeError):
        pass
    
    return None


def calculate_time_difference(start_time: str, end_time: str) -> float:
    """Calculate time difference in seconds between two timestamp strings."""
    start_dt = parse_timestamp(start_time)
    end_dt = parse_timestamp(end_time)
    
    if start_dt and end_dt:
        diff = end_dt - start_dt
        return diff.total_seconds()
    
    return 0.0


def analyze_version_discussions(chronological_order: List[Dict], sg_data: Dict[str, Dict], 
                              reference_threshold: int) -> List[Dict]:
    """Analyze transcript to identify main discussions vs brief references."""
    
    if not chronological_order:
        return []
    
    discussions = []
    current_discussion = None
    
    for i, entry in enumerate(chronological_order):
        version_num = entry['version_num']
        timestamp = entry['timestamp']
        
        # Skip entries without version or timestamp
        if not version_num or not timestamp:
            if current_discussion:
                current_discussion['conversations'].append(entry)
            continue
        
        # Check if this version exists in SG data
        is_sg_version = version_num in sg_data
        
        # If this is the first entry or no current discussion
        if not current_discussion:
            if is_sg_version:
                current_discussion = {
                    'version_id': version_num,
                    'start_time': timestamp,
                    'end_time': timestamp,
                    'conversations': [entry],
                    'reference_versions': [],
                    'is_sg_version': True
                }
            continue
        
        # Check if we're continuing with the current main version
        if version_num == current_discussion['version_id']:
            # Always continue the same discussion - no need to check time gaps for the same version
            current_discussion['conversations'].append(entry)
            current_discussion['end_time'] = timestamp
            continue
        
        # We're switching to a different version
        # Calculate how long the current version was discussed
        if current_discussion:
            # Check if this version already exists in discussions
            existing_discussion_for_current = None
            for disc in discussions:
                if disc['version_id'] == current_discussion['version_id']:
                    existing_discussion_for_current = disc
                    break

            if existing_discussion_for_current:
                # Merge current discussion back into the existing one (version mentioned again later)
                # CRITICAL: Only extend if they're different objects (avoid extending list with itself!)
                if existing_discussion_for_current is not current_discussion:
                    existing_discussion_for_current['conversations'].extend(current_discussion['conversations'])
                    if current_discussion['end_time'] > existing_discussion_for_current['end_time']:
                        existing_discussion_for_current['end_time'] = current_discussion['end_time']
            else:
                # No existing discussion for this version, decide whether to save or merge
                current_duration = calculate_time_difference(
                    current_discussion['start_time'],
                    current_discussion['end_time']
                )

                # If current discussion was brief (< threshold) and we have previous discussions
                if current_duration < reference_threshold and len(discussions) > 0:
                    # Merge current discussion as reference to the previous main discussion
                    prev_main = discussions[-1]
                    # Only add to reference_versions if it's not the same version as the previous main
                    existing_ref_ids = [v_id for v_id, _ in prev_main['reference_versions']]
                    if (current_discussion['version_id'] not in existing_ref_ids and
                        current_discussion['version_id'] != prev_main['version_id']):
                        prev_main['reference_versions'].append((current_discussion['version_id'], current_discussion['start_time']))
                    prev_main['conversations'].extend(current_discussion['conversations'])
                    # Update end time if current discussion was later
                    if current_discussion['end_time'] > prev_main['end_time']:
                        prev_main['end_time'] = current_discussion['end_time']
                else:
                    # Current discussion was substantial or it's the first one, save it
                    discussions.append(current_discussion)
        
        # Start new discussion with this version
        if is_sg_version:
            # Check if this version already has a discussion - if so, merge into it
            existing_discussion = None
            for disc in discussions:
                if disc['version_id'] == version_num:
                    existing_discussion = disc
                    break

            if existing_discussion:
                # Merge into existing discussion
                existing_discussion['conversations'].append(entry)
                existing_discussion['end_time'] = timestamp
                current_discussion = existing_discussion
            else:
                # Create new discussion
                current_discussion = {
                    'version_id': version_num,
                    'start_time': timestamp,
                    'end_time': timestamp,
                    'conversations': [entry],
                    'reference_versions': [],
                    'is_sg_version': True
                }
        else:
            # This is a reference version, add to previous main discussion if exists
            if discussions:
                # Only add to reference_versions if it's not the same version as the main discussion
                existing_ref_ids = [v_id for v_id, _ in discussions[-1]['reference_versions']]
                if (version_num not in existing_ref_ids and
                    version_num != discussions[-1]['version_id']):
                    discussions[-1]['reference_versions'].append((version_num, timestamp))
                discussions[-1]['conversations'].append(entry)
                discussions[-1]['end_time'] = timestamp
                current_discussion = discussions[-1]
            else:
                # No previous main discussion, treat as main for now
                current_discussion = {
                    'version_id': version_num,
                    'start_time': timestamp,
                    'end_time': timestamp,
                    'conversations': [entry],
                    'reference_versions': [],
                    'is_sg_version': False
                }
    
    # Handle the final discussion
    if current_discussion:
        # Check if this version already exists in discussions
        existing_discussion_for_final = None
        for disc in discussions:
            if disc['version_id'] == current_discussion['version_id']:
                existing_discussion_for_final = disc
                break

        if existing_discussion_for_final:
            # Merge final discussion back into existing one
            # CRITICAL: Only extend if they're different objects (avoid extending list with itself!)
            if existing_discussion_for_final is not current_discussion:
                existing_discussion_for_final['conversations'].extend(current_discussion['conversations'])
                if current_discussion['end_time'] > existing_discussion_for_final['end_time']:
                    existing_discussion_for_final['end_time'] = current_discussion['end_time']
        else:
            # No existing discussion for this version, decide whether to save or merge
            current_duration = calculate_time_difference(
                current_discussion['start_time'],
                current_discussion['end_time']
            )

            if current_duration < reference_threshold and len(discussions) > 0 and current_discussion['is_sg_version']:
                # Final discussion was brief, merge it as reference to previous
                prev_main = discussions[-1]
                # Only add to reference_versions if it's not the same version as the previous main
                existing_ref_ids = [v_id for v_id, _ in prev_main['reference_versions']]
                if (current_discussion['version_id'] not in existing_ref_ids and
                    current_discussion['version_id'] != prev_main['version_id']):
                    prev_main['reference_versions'].append((current_discussion['version_id'], current_discussion['start_time']))
                prev_main['conversations'].extend(current_discussion['conversations'])
                if current_discussion['end_time'] > prev_main['end_time']:
                    prev_main['end_time'] = current_discussion['end_time']
            else:
                discussions.append(current_discussion)
    
    return discussions


def process_transcript_versions_with_time_analysis(transcript_data: Dict[str, List],
                                                 chronological_order: List,
                                                 sg_data: Dict[str, Dict],
                                                 reference_threshold: int) -> Tuple[List[Dict], Set[str]]:
    """Process transcript versions using time-based analysis for references.

    Output always uses 'version_id' as the column name.
    """

    # Analyze discussions with time-based logic
    discussions = analyze_version_discussions(chronological_order, sg_data, reference_threshold)

    output_rows = []
    processed_sg_versions = set()

    # Handle conversations that appear before any SG version is identified
    pre_discussion_conversations = []
    first_sg_version_found = False

    for entry in chronological_order:
        version_num = entry.get('version_num')
        
        # If we haven't found the first SG version yet, collect all conversations
        if not first_sg_version_found:
            if version_num and version_num in sg_data:
                # Found the first SG version, stop collecting pre-discussions
                first_sg_version_found = True
                break
            else:
                # This is either no version or a non-SG version, collect it
                pre_discussion_conversations.append(entry)
        else:
            break

    # Process each discussion
    for discussion in discussions:
        version_num = discussion['version_id']
        
        # If this is an SG version, create output row
        if version_num in sg_data:
            processed_sg_versions.add(version_num)
            
            # For the first SG discussion, include pre-discussion conversations
            all_conversations = discussion['conversations']
            if len(output_rows) == 0 and pre_discussion_conversations:
                all_conversations = pre_discussion_conversations + all_conversations
            
            timestamp = get_earliest_timestamp(all_conversations)
            conversation_text = format_conversation(all_conversations)
            notes = sg_data[version_num]['notes']
            shot = sg_data[version_num].get('shot', '')
            # Format reference versions with timestamps: "version_id:timestamp,..."
            ref_versions_str = ','.join([f"{v_id}:{ts}" for v_id, ts in discussion['reference_versions']]) if discussion['reference_versions'] else ''

            # Calculate duration in seconds
            duration_seconds = calculate_time_difference(discussion['start_time'], discussion['end_time'])

            output_rows.append({
                'timestamp': timestamp,
                'shot': shot,
                'version_id': version_num,
                'reference_versions': ref_versions_str,
                'conversation': conversation_text,         # Will be renamed to transcription in llm_service
                'notes': notes,                            # Renamed from sg_summary
                'duration_seconds': duration_seconds
            })

    return output_rows, processed_sg_versions


def main():
    parser = argparse.ArgumentParser(
        description="Combine ShotGrid notes with Google Meet transcript data"
    )
    
    parser.add_argument('sg_file', 
                       help='Path to ShotGrid CSV file')
    parser.add_argument('transcript_file',
                       help='Path to Google Meet transcript CSV file')
    parser.add_argument('--version-column',
                       required=True,
                       help='Column name for version field in ShotGrid CSV')
    parser.add_argument('--reference-threshold',
                       type=int,
                       default=30,
                       help='Time threshold in seconds for brief references (default: 30)')
    parser.add_argument('--output',
                       required=True,
                       help='Output CSV file path')
    
    args = parser.parse_args()
    
    # Parse version column - single value for SG, gmeet always uses 'version_id'
    sg_version_column = args.version_column.strip()
    transcript_version_column = 'version_id'  # gmeet_data.csv always uses this column name

    # Use simple digit extraction pattern (assumes version columns contain plain numbers)
    version_pattern = r'(\d+)'

    # Load data
    print(f"Loading ShotGrid data from {args.sg_file}...")
    sg_data = load_sg_data(args.sg_file, sg_version_column, version_pattern)
    print(f"Found {len(sg_data)} ShotGrid versions")

    print(f"Loading transcript data from {args.transcript_file}...")
    transcript_data, chronological_order = load_transcript_data(
        args.transcript_file, transcript_version_column, version_pattern
    )
    print(f"Found {len(transcript_data)} transcript versions")
    
    # Process transcript versions with time-based analysis
    print(f"Processing transcript with time-based reference detection (threshold: {args.reference_threshold}s)...")
    output_rows, processed_sg_versions = process_transcript_versions_with_time_analysis(
        transcript_data, chronological_order, sg_data, args.reference_threshold
    )
    
    # Add remaining SG versions that weren't discussed in transcript
    remaining_sg_versions = set(sg_data.keys()) - processed_sg_versions
    print(f"Found {len(remaining_sg_versions)} SG versions not discussed in transcript")
    
    for version_num in sorted(remaining_sg_versions, key=lambda x: int(x) if x.isdigit() else 0):
        sg_info = sg_data[version_num]
        output_rows.append({
            'timestamp': '',
            'shot': sg_info.get('shot', ''),
            'version_id': version_num,
            'reference_versions': '',
            'conversation': '',
            'notes': sg_info['notes'],
            'duration_seconds': 0.0
        })
    
    # Write output CSV
    print(f"Writing combined data to {args.output}...")
    with open(args.output, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['timestamp', 'duration_seconds', 'shot', 'version_id', 'reference_versions', 'conversation', 'notes']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        
        writer.writeheader()
        for row in output_rows:
            writer.writerow(row)
    
    print(f"Successfully created {args.output} with {len(output_rows)} rows")
    
    # Print summary
    versions_with_transcript = sum(1 for row in output_rows if row['conversation'])
    versions_with_references = sum(1 for row in output_rows if row['reference_versions'])
    undiscussed_versions = len(remaining_sg_versions)
    
    print(f"\nSummary:")
    print(f"- Total output rows: {len(output_rows)}")
    print(f"- Versions with transcript: {versions_with_transcript}")
    print(f"- Versions with reference versions: {versions_with_references}")
    print(f"- Undiscussed SG versions: {undiscussed_versions}")
    print(f"- Reference threshold used: {args.reference_threshold} seconds")


if __name__ == '__main__':
    main()
