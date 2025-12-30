#!/usr/bin/env python3
"""
Google Meet Data Extractor

This script processes Google Meet video recordings to extract synchronized audio transcripts, speaker names, 
and version IDs, then groups them into coherent speaking segments. It combines functionality 
from both audio transcription and visual text detection to create a unified output.

Key Features:
- Audio transcription using OpenAI's Whisper model
- Speaker name detection using OCR on video frames 
- Version ID detection using regex pattern matching (mandatory)
- Intelligent grouping of transcript segments by speaker and version
- Synchronized output with grouped speaking turns
- True parallel processing using multiprocessing (bypasses Python GIL)

Output Format:
CSV with columns: timestamp, transcript_text, speaker_name, version_id
- Each row represents a complete speaking turn by one person
- Consecutive segments from the same speaker with same version are combined
- Segments are split when speaker changes or version ID changes

Usage Examples:
    # Basic processing with local file
    python get_data_from_google_meet.py meeting.mp4 --version-pattern "v\\d+\\.\\d+\\.\\d+"

    # Google Drive URL
    python get_data_from_google_meet.py "https://drive.google.com/file/d/1a2b3c4d/view" --version-pattern "v\\d+\\.\\d+\\.\\d+" --drive-credentials /path/to/service_account.json

    # Google Drive file ID (OAuth2 - will prompt for login on first run)
    python get_data_from_google_meet.py 1a2b3c4d5e6f7g8h9i --version-pattern "proj-\\d+" --parallel

    # Custom audio model and frame interval
    python get_data_from_google_meet.py meeting.mp4 --version-pattern "proj-\\d+" --audio-model small --frame-interval 3.0

    # Process specific time range
    python get_data_from_google_meet.py meeting.mp4 --version-pattern "v\\d+\\.\\d+\\.\\d+" --start-time 120 --duration 300

Requirements:
- All dependencies from get_audio_transcript.py and get_onscreen_text.py
- FFmpeg for video processing
- OpenAI Whisper for audio transcription
- EasyOCR for text detection
- OpenCV and PIL for image processing
"""

import argparse
import os
import re
import csv
import time
import tempfile
import subprocess
from typing import List, Dict, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import threading
import multiprocessing

# Import functions from existing scripts
from get_audio_transcript import process_media_file
from get_onscreen_text import (
    process_video as process_video_visual,
    get_video_duration,
    sanitize_speaker_names
)


def _run_audio_transcription_worker(video_path: str, transcript_csv: str,
                                   audio_model: str, duration: Optional[float], verbose: bool,
                                   cache_audio_path: Optional[str] = None) -> tuple:
    """
    Worker function for audio transcription in multiprocessing.
    Must be defined at module level for multiprocessing to work.

    Returns:
        Tuple of (success: bool, elapsed_time: float)
    """
    if verbose:
        print("[Audio Process] Starting audio transcription...")

    start_time = time.time()
    success = process_media_file(
        video_path,
        transcript_csv,
        model_name=audio_model,
        duration=duration,
        verbose=verbose,
        cache_audio_path=cache_audio_path
    )
    elapsed = time.time() - start_time

    if verbose:
        print(f"[Audio Process] Completed in {elapsed:.1f}s")

    # Explicit cleanup to free memory before worker terminates
    # This is critical when using ProcessPoolExecutor as workers stay alive
    import gc
    import torch
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        if verbose:
            print("[Audio Process] Cleared GPU cache")
    gc.collect()
    if verbose:
        print("[Audio Process] Released memory")

    return (success, elapsed)


def _run_visual_detection_worker(video_path: str, frame_interval: float, visual_csv: str,
                                duration: Optional[float], batch_size: int, verbose: bool,
                                version_pattern: str, start_time_offset: float) -> tuple:
    """
    Worker function for visual detection in multiprocessing.
    Must be defined at module level for multiprocessing to work.

    Returns:
        Tuple of (success: bool, elapsed_time: float)
    """
    if verbose:
        print("[Visual Process] Starting visual detection...")

    start_time = time.time()
    success = process_video_visual(
        video_path,
        frame_interval,
        visual_csv,
        max_duration=duration,
        batch_size=batch_size,
        verbose=verbose,
        version_pattern=version_pattern,  # Always required
        start_time=start_time_offset,
        parallel=True  # Enable parallel frame processing within visual detection too
    )
    elapsed = time.time() - start_time

    if verbose:
        print(f"[Visual Process] Completed in {elapsed:.1f}s")

    # Explicit cleanup to free memory before worker terminates
    import gc
    import torch
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        if verbose:
            print("[Visual Process] Cleared GPU cache")
    gc.collect()
    if verbose:
        print("[Visual Process] Released memory")

    return (success, elapsed)


def parse_transcript_csv(transcript_csv_path: str) -> List[Dict]:
    """
    Parse the transcript CSV file generated by get_audio_transcript.py
    
    Args:
        transcript_csv_path: Path to the transcript CSV file
        
    Returns:
        List of dictionaries with transcript segments
    """
    transcript_segments = []
    
    if not os.path.exists(transcript_csv_path):
        return transcript_segments
    
    try:
        with open(transcript_csv_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                transcript_segments.append({
                    'start_time': float(row['start_time']),
                    'end_time': float(row['end_time']),
                    'text': row['text'].strip()
                })
    except Exception as e:
        print(f"Error reading transcript CSV: {e}")
    
    return transcript_segments


def parse_visual_csv(visual_csv_path: str) -> List[Dict]:
    """
    Parse the visual detection CSV file generated by get_onscreen_text.py
    
    Args:
        visual_csv_path: Path to the visual detection CSV file
        
    Returns:
        List of dictionaries with visual detections
    """
    visual_detections = []
    
    if not os.path.exists(visual_csv_path):
        return visual_detections
    
    try:
        with open(visual_csv_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                # Convert HH:MM:SS timestamp to seconds
                timestamp_str = row['timestamp']
                time_parts = timestamp_str.split(':')
                timestamp_seconds = int(time_parts[0]) * 3600 + int(time_parts[1]) * 60 + int(time_parts[2])
                
                visual_detections.append({
                    'timestamp': timestamp_seconds,
                    'speaker_name': row.get('speaker_name', '').strip(),
                    'version_id': row.get('version_id', '').strip()
                })
    except Exception as e:
        print(f"Error reading visual CSV: {e}")

    return visual_detections


def extract_version_timeline(visual_csv_path: str, output_csv_path: str, version_column_name: str = 'version_id', verbose: bool = False) -> bool:
    """
    Extract chronological version timeline from visual.csv showing when each version appears in the video.
    Creates a new CSV with one row for every time the version number changes.

    Args:
        visual_csv_path: Path to the visual.csv file (with timestamp, speaker_name, version_id columns)
        output_csv_path: Path to save the timeline CSV
        version_column_name: Column name to use for version in output CSV (default: 'version_id')
        verbose: Whether to print verbose output

    Returns:
        True if successful, False otherwise
    """
    if not os.path.exists(visual_csv_path):
        if verbose:
            print(f"Visual CSV not found: {visual_csv_path}")
        return False

    try:
        timeline_entries = []
        prev_version = None
        current_entry = None

        with open(visual_csv_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                timestamp = row['timestamp']
                speaker_name = row.get('speaker_name', '').strip()
                version_id = row.get('version_id', '').strip()

                # Skip rows without version ID
                if not version_id:
                    continue

                # Detect version change
                if version_id != prev_version:
                    # Save previous entry if exists
                    if current_entry:
                        timeline_entries.append(current_entry)

                    # Start new entry - use custom column name for version
                    current_entry = {
                        'timestamp': timestamp,
                        version_column_name: version_id,
                        'speaker_name': speaker_name
                    }
                    prev_version = version_id

        # Don't forget the last entry
        if current_entry:
            timeline_entries.append(current_entry)

        # Write timeline CSV
        if timeline_entries:
            with open(output_csv_path, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['timestamp', version_column_name, 'speaker_name']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(timeline_entries)

            if verbose:
                print(f"Version timeline saved to: {output_csv_path}")
                print(f"Found {len(timeline_entries)} version changes")
            return True
        else:
            if verbose:
                print("No version changes detected")
            return False

    except Exception as e:
        print(f"Error extracting version timeline: {e}")
        return False


def find_nearest_visual_detection(transcript_time: float, visual_detections: List[Dict]) -> Dict:
    """
    Find the visual detection closest in time to a transcript segment
    
    Args:
        transcript_time: Time in seconds from transcript segment
        visual_detections: List of visual detection records
        
    Returns:
        Dictionary with nearest speaker_name and version_id, or empty strings
    """
    if not visual_detections:
        return {'speaker_name': '', 'version_id': ''}
    
    # Find the detection with minimum time difference
    min_diff = float('inf')
    nearest_detection = {'speaker_name': '', 'version_id': ''}
    
    for detection in visual_detections:
        time_diff = abs(detection['timestamp'] - transcript_time)
        if time_diff < min_diff:
            min_diff = time_diff
            nearest_detection = {
                'speaker_name': detection['speaker_name'],
                'version_id': detection['version_id']
            }
    
    return nearest_detection


def synchronize_data(transcript_segments: List[Dict], visual_detections: List[Dict]) -> List[Dict]:
    """
    Synchronize transcript segments with visual detections
    
    Args:
        transcript_segments: List of transcript segments from audio
        visual_detections: List of visual detections from frames
        
    Returns:
        List of synchronized records with transcript, speaker, and version data
    """
    synchronized_records = []
    
    for segment in transcript_segments:
        # Use the middle of the transcript segment for matching
        segment_mid_time = (segment['start_time'] + segment['end_time']) / 2
        
        # Find nearest visual detection
        nearest_visual = find_nearest_visual_detection(segment_mid_time, visual_detections)
        
        synchronized_records.append({
            'start_time': segment['start_time'],
            'end_time': segment['end_time'],
            'text': segment['text'],
            'speaker_name': nearest_visual['speaker_name'],
            'version_id': nearest_visual['version_id']
        })
    
    return synchronized_records


def group_by_speaker_and_version(synchronized_records: List[Dict]) -> List[Dict]:
    """
    Group consecutive transcript segments by speaker and version ID
    
    Args:
        synchronized_records: List of synchronized transcript records
        
    Returns:
        List of grouped records with concatenated transcript text
    """
    if not synchronized_records:
        return []
    
    grouped_records = []
    current_group = {
        'start_time': synchronized_records[0]['start_time'],
        'text_segments': [synchronized_records[0]['text']],
        'speaker_name': synchronized_records[0]['speaker_name'],
        'version_id': synchronized_records[0]['version_id']
    }
    
    for record in synchronized_records[1:]:
        # Check if this record should be grouped with the current group
        same_speaker = (record['speaker_name'] == current_group['speaker_name'])
        same_version = (record['version_id'] == current_group['version_id'])
        
        if same_speaker and same_version:
            # Add to current group
            current_group['text_segments'].append(record['text'])
        else:
            # Finish current group and start new one
            grouped_records.append({
                'start_time': current_group['start_time'],
                'transcript_text': ' '.join(current_group['text_segments']),
                'speaker_name': current_group['speaker_name'],
                'version_id': current_group['version_id']
            })
            
            # Start new group
            current_group = {
                'start_time': record['start_time'],
                'text_segments': [record['text']],
                'speaker_name': record['speaker_name'],
                'version_id': record['version_id']
            }
    
    # Don't forget the last group
    grouped_records.append({
        'start_time': current_group['start_time'],
        'transcript_text': ' '.join(current_group['text_segments']),
        'speaker_name': current_group['speaker_name'],
        'version_id': current_group['version_id']
    })
    
    return grouped_records


def format_timestamp(seconds: float) -> str:
    """
    Convert seconds to HH:MM:SS format
    
    Args:
        seconds: Time in seconds
        
    Returns:
        Formatted timestamp string
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def extract_google_meet_data(video_path: str, version_pattern: str, output_csv: str,
                           audio_model: str = "base", frame_interval: float = 5.0,
                           start_time: float = 0.0, duration: Optional[float] = None,
                           batch_size: int = 20, verbose: bool = False, parallel: bool = False,
                           drive_credentials: Optional[str] = None, timeline_csv_path: Optional[str] = None,
                           version_column_name: str = 'version_id',
                           output_dir: Optional[str] = None, project: Optional[str] = None,
                           force_download: bool = False, sg_basename: Optional[str] = None,
                           keep_intermediate: bool = False,
                           existing_transcript_csv: Optional[str] = None,
                           existing_visual_csv: Optional[str] = None):
    """
    Extract data from a Google Meet recording: synchronized transcripts, speaker names, and version IDs

    Supports both local video files and Google Drive URLs/file IDs. When a Drive URL is detected,
    the file is automatically downloaded to a temporary location before processing.

    NEW: Supports partial stage skipping by accepting existing transcript.csv or visual.csv files.

    Args:
        video_path: Path to local video file OR Google Drive URL/file ID
        version_pattern: Regex pattern for version ID detection
        output_csv: Path to the output CSV file
        audio_model: Whisper model to use for transcription
        frame_interval: Interval between frame extractions for visual detection
        start_time: Start processing from this time offset
        duration: Maximum duration to process
        verbose: Print detailed progress information
        parallel: Enable parallel processing (audio + visual simultaneously using multiprocessing)
        drive_credentials: Path to Google Drive OAuth2 credentials JSON (default: ../client_secret.json)
        timeline_csv_path: Optional path to save chronological version timeline CSV
        version_column_name: Column name to use for version in timeline CSV (default: 'version_id')
        output_dir: Root output directory for organized mode
        project: Project name for organizing outputs
        force_download: Force re-download even if cached
        sg_basename: ShotGrid CSV basename for naming outputs
        keep_intermediate: Whether to keep intermediate files
        existing_transcript_csv: Path to existing transcript.csv to skip audio transcription (NEW)
        existing_visual_csv: Path to existing visual.csv to skip visual detection (NEW)

    Returns:
        If output_dir is specified: Tuple of (success: bool, recording_dir: str, timing: dict)
        Otherwise: Tuple of (success: bool, timing: dict)
    """
    # Initialize timing tracking
    timing = {}

    # Import Google Drive utilities
    from google_drive_utils import (
        parse_drive_url,
        download_drive_file,
        get_file_metadata,
        get_cached_recording,
        cache_recording
    )

    # Detect if input is a Google Drive URL/ID
    file_id = parse_drive_url(video_path)
    temp_video_path = None
    temp_video_dir = None

    # Variables for caching and directory management
    original_filename = None
    skip_download = False
    recording_dir = None
    intermediate_dir = None

    # Check cache before downloading (if output_dir and project provided)
    if file_id and output_dir:
        if verbose:
            print(f"Detected Google Drive file ID: {file_id}")

        # Set default credentials path if not provided (OAuth2 in parent directory)
        if drive_credentials is None:
            drive_credentials = os.path.join(os.path.dirname(__file__), '..', 'client_secret.json')

        # Get original filename from Google Drive metadata
        metadata = get_file_metadata(file_id, drive_credentials)
        if metadata:
            original_filename = metadata['name']
            file_size = metadata.get('size', 0)

            # Create recording directory structure
            from google_drive_utils import sanitize_filename
            sanitized_name = sanitize_filename(original_filename)
            name_without_ext = sanitized_name.rsplit('.', 1)[0] if '.' in sanitized_name else sanitized_name
            recording_dir = os.path.join(output_dir, project, name_without_ext)

            # Create recording directory
            os.makedirs(recording_dir, exist_ok=True)

            if verbose:
                print(f"Recording directory: {recording_dir}")

            # Check cache before downloading
            if not force_download:
                cached_path = get_cached_recording(
                    file_id, project, output_dir, original_filename,
                    expected_size=file_size, verbose=verbose
                )
                if cached_path:
                    video_path = cached_path
                    skip_download = True
                    if verbose:
                        print(f"Cache hit! Using cached file: {cached_path}")
                else:
                    if verbose:
                        print(f"Cache miss. Downloading from Google Drive...")
            else:
                if verbose:
                    print(f"Force download enabled. Bypassing cache...")

    if file_id and not skip_download:
        # Download from Google Drive
        if verbose:
            print(f"Detected Google Drive file ID: {file_id}")

        # Set default credentials path if not provided (OAuth2 in parent directory)
        if drive_credentials is None:
            drive_credentials = os.path.join(os.path.dirname(__file__), '..', 'client_secret.json')

        # Create temp directory for download
        temp_video_dir = tempfile.mkdtemp(prefix="google_drive_download_")
        temp_video_path = os.path.join(temp_video_dir, "video.mp4")

        try:
            if verbose:
                print(f"Downloading from Google Drive to: {temp_video_path}")

            download_start = time.time()
            success = download_drive_file(file_id, temp_video_path, drive_credentials, verbose)
            timing['download'] = time.time() - download_start

            if not success:
                print("Failed to download file from Google Drive")
                if os.path.exists(temp_video_dir):
                    import shutil
                    shutil.rmtree(temp_video_dir)
                return False

            # Cache the downloaded file if output_dir and original_filename are available
            if output_dir and original_filename:
                cached_path = cache_recording(
                    temp_video_path, file_id, project, output_dir,
                    original_filename, verbose=verbose
                )
                if cached_path:
                    video_path = cached_path
                    # Clean up temp since we have it cached now
                    if temp_video_dir and os.path.exists(temp_video_dir):
                        import shutil
                        shutil.rmtree(temp_video_dir)
                        temp_video_dir = None  # Mark as cleaned
                else:
                    video_path = temp_video_path
            else:
                # Update video_path to point to downloaded file
                video_path = temp_video_path

        except Exception as e:
            print(f"Error downloading from Google Drive: {e}")
            if os.path.exists(temp_video_dir):
                import shutil
                shutil.rmtree(temp_video_dir)
            return False

    # Check if video file exists (works for both local and downloaded files)
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at '{video_path}'")
        return False
    
    if verbose:
        print(f"Processing Google Meet recording: {video_path}")
        print(f"Version pattern: {version_pattern}")
        print(f"Audio model: {audio_model}")
        print(f"Frame interval: {frame_interval}s")
        if start_time > 0:
            print(f"Start time: {start_time}s")
        if duration:
            print(f"Duration limit: {duration}s")
    
    # Create temporary directory for intermediate files
    temp_dir = tempfile.mkdtemp(prefix="google_meet_data_")

    # Determine cache path for extracted audio (if caching is enabled)
    cache_audio_path = None
    if recording_dir:
        cache_audio_path = os.path.join(recording_dir, "audio.mp3")
        if verbose and os.path.exists(cache_audio_path):
            print(f"Cached audio file found: {cache_audio_path}")

    try:
        # Define paths for intermediate CSV files
        transcript_csv = os.path.join(temp_dir, "transcript.csv")
        visual_csv = os.path.join(temp_dir, "visual.csv")

        if verbose:
            print(f"Using temporary directory: {temp_dir}")
        
        if parallel:
            # Run audio transcription and visual detection in parallel using multiprocessing
            # BUT: respect existing CSVs if provided

            tasks_to_run = []
            if not existing_transcript_csv:
                tasks_to_run.append('audio')
            if not existing_visual_csv:
                tasks_to_run.append('visual')

            if not tasks_to_run:
                # Both CSVs provided - just copy them
                if verbose:
                    print("\n=== Both transcript and visual CSVs provided - skipping video processing ===")

                import shutil
                if existing_transcript_csv:
                    shutil.copy2(existing_transcript_csv, transcript_csv)
                    print(f"Copied transcript: {transcript_csv}")
                if existing_visual_csv:
                    shutil.copy2(existing_visual_csv, visual_csv)
                    print(f"Copied visual: {visual_csv}")

                timing['transcription'] = 0.0
                timing['visual_detection'] = 0.0

            elif len(tasks_to_run) == 1:
                # Only one task needed - run sequentially (no benefit from parallel)
                if verbose:
                    print(f"\n=== Only {tasks_to_run[0]} task needed - running sequentially ===")

                if 'audio' in tasks_to_run:
                    # Copy existing visual CSV
                    import shutil
                    shutil.copy2(existing_visual_csv, visual_csv)
                    timing['visual_detection'] = 0.0

                    # Run audio transcription
                    transcription_start = time.time()
                    transcript_success = process_media_file(
                        video_path, transcript_csv, model_name=audio_model,
                        duration=duration, verbose=verbose, cache_audio_path=cache_audio_path
                    )
                    timing['transcription'] = time.time() - transcription_start

                    if not transcript_success:
                        print("Failed to generate audio transcript")
                        return (False, timing)
                else:  # 'visual' in tasks_to_run
                    # Copy existing transcript CSV
                    import shutil
                    shutil.copy2(existing_transcript_csv, transcript_csv)
                    timing['transcription'] = 0.0

                    # Run visual detection
                    visual_start = time.time()
                    visual_success = process_video_visual(
                        video_path, frame_interval, visual_csv,
                        max_duration=duration, batch_size=batch_size, verbose=verbose,
                        version_pattern=version_pattern, start_time=start_time, parallel=True
                    )
                    timing['visual_detection'] = time.time() - visual_start

                    if not visual_success:
                        print("Failed to generate visual detections")
                        return (False, timing)

            else:
                # Both tasks needed - run in parallel (original logic)
                if verbose:
                    print("\n=== Running Audio Transcription and Visual Detection in Parallel (Multiprocessing) ===")

                # Use ProcessPoolExecutor for true parallelism (bypasses GIL)
                # Use 'spawn' method to avoid forking the entire parent process memory
                try:
                    # Set multiprocessing start method to 'spawn' to avoid memory bloat from fork()
                    mp_context = multiprocessing.get_context('spawn')

                    parallel_start = time.time()
                    with ProcessPoolExecutor(max_workers=2, mp_context=mp_context) as executor:
                        # Submit both tasks to separate processes
                        audio_future = executor.submit(
                            _run_audio_transcription_worker,
                            video_path, transcript_csv, audio_model, duration, verbose, cache_audio_path
                        )
                        visual_future = executor.submit(
                            _run_visual_detection_worker,
                            video_path, frame_interval, visual_csv, duration, batch_size,
                            verbose, version_pattern, start_time
                        )

                        # Wait for both to complete and get results (with individual times)
                        transcript_success, transcription_time = audio_future.result()
                        visual_success, visual_time = visual_future.result()

                    parallel_elapsed = time.time() - parallel_start

                    # Store individual task times
                    timing['transcription'] = transcription_time
                    timing['visual_detection'] = visual_time

                    # Store parallel execution time
                    timing['parallel_elapsed'] = parallel_elapsed

                    # Calculate speedup
                    sequential_time = transcription_time + visual_time
                    speedup = sequential_time / parallel_elapsed if parallel_elapsed > 0 else 1.0
                    timing['parallel_speedup'] = speedup

                    if verbose:
                        print(f"\n[Parallel Timing]")
                        print(f"  Audio transcription: {transcription_time:.1f}s")
                        print(f"  Visual detection: {visual_time:.1f}s")
                        print(f"  Sequential would take: {sequential_time:.1f}s")
                        print(f"  Parallel took: {parallel_elapsed:.1f}s")
                        print(f"  Speedup: {speedup:.2f}x")

                except Exception as e:
                    print(f"Error in multiprocessing execution: {e}")
                    print("Falling back to sequential processing...")
                    # Fall back to sequential processing if multiprocessing fails
                    return extract_google_meet_data(
                        video_path, version_pattern, output_csv, audio_model,
                        frame_interval, start_time, duration, batch_size, verbose, parallel=False,
                        existing_transcript_csv=existing_transcript_csv,
                        existing_visual_csv=existing_visual_csv
                    )

                if not transcript_success:
                    print("Failed to generate audio transcript")
                    return (False, timing)

                if not visual_success:
                    print("Failed to generate visual detections")
                    return (False, timing)

                if verbose:
                    print("[Multiprocessing] Both audio transcription and visual detection completed successfully")
                    print(f"Audio transcript saved to: {transcript_csv}")
                    print(f"Visual detections saved to: {visual_csv}")
        
        else:
            # Sequential processing (original behavior)
            # Step 1: Extract audio transcript (or use existing)
            if existing_transcript_csv:
                # Skip audio transcription - use existing file
                if verbose:
                    print("\n=== Step 1: Audio Transcription (SKIPPED) ===")
                    print(f"Using existing transcript: {existing_transcript_csv}")

                # Copy existing CSV to expected location
                import shutil
                shutil.copy2(existing_transcript_csv, transcript_csv)
                timing['transcription'] = 0.0

                if verbose:
                    print(f"Copied to: {transcript_csv}")
            else:
                # Original audio transcription logic
                if verbose:
                    print("\n=== Step 1: Audio Transcription ===")

                transcription_start = time.time()
                transcript_success = process_media_file(
                    video_path,
                    transcript_csv,
                    model_name=audio_model,
                    duration=duration,
                    verbose=verbose,
                    cache_audio_path=cache_audio_path
                )
                timing['transcription'] = time.time() - transcription_start

                if not transcript_success:
                    print("Failed to generate audio transcript")
                    return (False, timing)

                if verbose:
                    print(f"Audio transcript saved to: {transcript_csv}")

            # Step 2: Extract visual detections (or use existing)
            if existing_visual_csv:
                # Skip visual detection - use existing file
                if verbose:
                    print("\n=== Step 2: Visual Detection (SKIPPED) ===")
                    print(f"Using existing visual: {existing_visual_csv}")

                # Copy existing CSV to expected location
                import shutil
                shutil.copy2(existing_visual_csv, visual_csv)
                timing['visual_detection'] = 0.0

                if verbose:
                    print(f"Copied to: {visual_csv}")
            else:
                # Original visual detection logic
                if verbose:
                    print("\n=== Step 2: Visual Detection ===")

                visual_start = time.time()
                visual_success = process_video_visual(
                    video_path,
                    frame_interval,
                    visual_csv,
                    max_duration=duration,
                    batch_size=batch_size,
                    verbose=verbose,
                    version_pattern=version_pattern,  # Always required
                    start_time=start_time,
                    parallel=False  # Sequential frame processing
                )
                timing['visual_detection'] = time.time() - visual_start

                if not visual_success:
                    print("Failed to generate visual detections")
                    return (False, timing)

                if verbose:
                    print(f"Visual detections saved to: {visual_csv}")
        
        # Step 3: Parse and synchronize data
        if verbose:
            print("\n=== Step 3: Data Synchronization ===")
        
        transcript_segments = parse_transcript_csv(transcript_csv)
        visual_detections = parse_visual_csv(visual_csv)
        
        if verbose:
            print(f"Parsed {len(transcript_segments)} transcript segments")
            print(f"Parsed {len(visual_detections)} visual detections")
        
        if not transcript_segments:
            print("No transcript segments found")
            return (False, timing)
        
        # Synchronize transcript with visual data
        synchronized_records = synchronize_data(transcript_segments, visual_detections)
        
        if verbose:
            print(f"Created {len(synchronized_records)} synchronized records")
        
        # Step 4: Group by speaker and version
        if verbose:
            print("\n=== Step 4: Grouping by Speaker and Version ===")
        
        grouped_records = group_by_speaker_and_version(synchronized_records)
        
        if verbose:
            print(f"Grouped into {len(grouped_records)} speaking turns")
        
        # Step 5: Apply speaker name sanitization
        if verbose:
            print("\n=== Step 5: Speaker Name Sanitization ===")
        
        # Extract speaker names for sanitization
        speaker_names = [record['speaker_name'] for record in grouped_records]
        timestamps_for_sanitization = [format_timestamp(record['start_time']) for record in grouped_records]
        
        sanitized_names = sanitize_speaker_names(timestamps_for_sanitization, speaker_names)
        
        # Update records with sanitized names
        for i, record in enumerate(grouped_records):
            record['speaker_name'] = sanitized_names[i]
        
        if verbose:
            unique_speakers = set(name for name in sanitized_names if name)
            print(f"Found {len(unique_speakers)} unique speakers: {list(unique_speakers)}")
        
        # Step 6: Write final CSV output
        if verbose:
            print(f"\n=== Step 6: Writing Output ===")
        
        with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['timestamp', 'transcript_text', 'speaker_name', 'version_id'])
            
            for record in grouped_records:
                timestamp_str = format_timestamp(record['start_time'])
                writer.writerow([
                    timestamp_str,
                    record['transcript_text'],
                    record['speaker_name'],
                    record['version_id']
                ])
        
        print(f"\nResults saved to: {output_csv}")
        print(f"Generated {len(grouped_records)} grouped speaking turns")
        
        # Summary statistics
        segments_with_speakers = sum(1 for record in grouped_records if record['speaker_name'])
        segments_with_versions = sum(1 for record in grouped_records if record['version_id'])
        
        print(f"Speaking turns with detected speakers: {segments_with_speakers}")
        print(f"Speaking turns with detected versions: {segments_with_versions}")

        # Step 7: Extract version timeline if requested
        if timeline_csv_path:
            if verbose:
                print(f"\n=== Step 7: Extracting Version Timeline ===")
            extract_version_timeline(visual_csv, timeline_csv_path, version_column_name=version_column_name, verbose=verbose)

        # Step 8: Copy intermediate files to recording directory if keep_intermediate
        if recording_dir and keep_intermediate:
            import shutil
            intermediate_dir = os.path.join(recording_dir, "intermediate")
            os.makedirs(intermediate_dir, exist_ok=True)

            if verbose:
                print(f"\n=== Copying intermediate files to {intermediate_dir} ===")

            # Copy intermediate CSVs
            for filename in ['transcript.csv', 'visual.csv']:
                src = os.path.join(temp_dir, filename)
                if os.path.exists(src):
                    dst = os.path.join(intermediate_dir, filename)
                    shutil.copy2(src, dst)
                    if verbose:
                        print(f"Copied {filename}")

        # Return tuple with recording directory and timing if output_dir specified
        if output_dir:
            return (True, recording_dir, timing)
        else:
            return (True, timing)

    except Exception as e:
        print(f"Error during processing: {e}")
        if output_dir:
            return (False, None, timing)
        else:
            return (False, timing)
    
    finally:
        # Clean up temporary directory for intermediate files
        import shutil
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                if verbose:
                    print(f"Cleaned up temporary directory: {temp_dir}")
            except Exception as e:
                print(f"Warning: Failed to clean up temporary directory: {e}")

        # Clean up downloaded Google Drive file (only if not cached)
        # Note: temp_video_dir is set to None if file was cached
        if temp_video_dir and os.path.exists(temp_video_dir):
            try:
                shutil.rmtree(temp_video_dir)
                if verbose:
                    print(f"Cleaned up downloaded file: {temp_video_path}")
            except Exception as e:
                print(f"Warning: Failed to clean up downloaded file: {e}")


def main():
    """
    Main function to handle command-line arguments for Google Meet data extraction
    """
    parser = argparse.ArgumentParser(
        description="Extract data from Google Meet recordings: synchronized transcripts, speaker names, and version IDs."
    )
    
    # Required arguments
    parser.add_argument("input_video",
                       help="Path to the input video file (.mp4, .avi, .mov, etc.) OR Google Drive URL/file ID. "
                            "Supported Drive formats: https://drive.google.com/file/d/FILE_ID/view OR FILE_ID")
    parser.add_argument("--version-pattern", required=True, type=str,
                       help="Regex pattern to detect version IDs (e.g., 'v\\d+\\.\\d+\\.\\d+' for version numbers, 'proj-\\d+' for build numbers).")
    
    # Optional arguments
    parser.add_argument("-o", "--output", help="Output CSV file path. If not provided, will be input filename with '_processed.csv' suffix.")
    parser.add_argument("--audio-model", default="base", 
                       choices=["tiny", "base", "small", "medium", "large"],
                       help="Whisper model to use for audio transcription (default: base).")
    parser.add_argument("--frame-interval", "--interval", type=float, default=5.0,
                       help="Time interval in seconds between frame extractions for visual detection (default: 5.0).")
    parser.add_argument("--batch-size", type=int, default=20,
                       help="Number of frames to process in each batch for visual detection (default: 20).")
    parser.add_argument("--start-time", type=float, default=0.0,
                       help="Start processing from this time offset in seconds (default: 0.0).")
    parser.add_argument("--duration", type=float,
                       help="Maximum duration in seconds to process. If not specified, processes the entire video.")
    parser.add_argument("-v", "--verbose", action="store_true",
                       help="Print detailed progress information.")
    parser.add_argument("--parallel", action="store_true",
                       help="Enable parallel processing: run audio transcription and visual detection simultaneously using multiprocessing (faster but uses more CPU/memory resources). Bypasses Python GIL for better performance on multi-core systems.")
    parser.add_argument("--drive-credentials", type=str, default=None,
                       help="Path to Google Drive OAuth2 credentials JSON. Required for Drive URLs. Defaults to ../client_secret.json if not specified.")

    args = parser.parse_args()
    
    # Determine output file path
    if args.output:
        output_csv = args.output
    else:
        base_name = os.path.splitext(args.input_video)[0]
        output_csv = f"{base_name}_processed.csv"
    
    # Process the recording
    success = extract_google_meet_data(
        args.input_video,
        args.version_pattern,
        output_csv,
        audio_model=args.audio_model,
        frame_interval=args.frame_interval,
        start_time=args.start_time,
        duration=args.duration,
        batch_size=args.batch_size,
        verbose=args.verbose,
        parallel=args.parallel,
        drive_credentials=args.drive_credentials
    )
    
    if not success:
        exit(1)


if __name__ == "__main__":
    # Set multiprocessing start method for better cross-platform compatibility
    # 'spawn' is safer for complex imports but 'fork' is faster on Unix-like systems
    try:
        if hasattr(os, 'fork'):
            # Unix-like systems: use 'fork' for better performance
            multiprocessing.set_start_method('fork', force=True)
        else:
            # Windows: must use 'spawn'
            multiprocessing.set_start_method('spawn', force=True)
    except RuntimeError:
        # Start method already set, continue
        pass
    main()
