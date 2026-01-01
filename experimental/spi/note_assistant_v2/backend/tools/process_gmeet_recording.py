#!/usr/bin/env python3
"""
End-to-End Google Meet Recording Processing Pipeline

Orchestrates the complete workflow:
1. Extract Google Meet data (audio transcript + visual detection)
2. Combine with ShotGrid playlist data
3. Generate LLM summaries for each version
4. Email results to specified recipient

Configuration: All settings loaded from ../.env file

Usage:
    python process_gmeet_recording.py <video_input> <sg_playlist_csv> \
        --version-pattern "v\d+\.\d+\.\d+" \
        --version-column "version" \
        --model gemini-2.5-pro \
        [recipient_email] \
        [options]
"""

import argparse
import os
import sys
import csv
import tempfile
import shutil
import time
from dotenv import load_dotenv

# Load .env from parent directory
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(parent_dir, '.env'))

# Add parent directory to sys.path for imports
sys.path.insert(0, parent_dir)
sys.path.insert(0, os.path.dirname(__file__))

# Import from existing scripts
from get_data_from_google_meet import extract_google_meet_data
from combine_data_from_gmeet_and_sg import (
    load_sg_data,
    load_transcript_data,
    process_transcript_versions_with_time_analysis
)
from llm_service import (
    process_csv_with_llm_summaries,
    get_available_models_for_enabled_providers,
    llm_clients
)
from email_service import send_csv_email
from google_drive_utils import sanitize_filename


def format_duration(seconds: float) -> str:
    """Format seconds into human-readable duration (Xh Ym Zs)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours}h {minutes}m {secs}s"
    elif minutes > 0:
        return f"{minutes}m {secs}s"
    else:
        return f"{secs}s"


def extract_meeting_metadata(gmeet_csv: str, verbose: bool = False):
    """
    Extract meeting metadata from gmeet_data.csv.

    Args:
        gmeet_csv: Path to gmeet_data.csv file
        verbose: Enable verbose output

    Returns:
        dict with:
            - participants: list of unique speaker names
            - meeting_duration: formatted duration string (e.g., "45m 30s")
            - duration_seconds: total duration in seconds
    """
    if not os.path.exists(gmeet_csv):
        return None

    participants = set()
    start_time = None
    end_time = None

    try:
        with open(gmeet_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Collect speaker names
                speaker = row.get('speaker_name', '').strip()
                if speaker:
                    participants.add(speaker)

                # Track time range
                timestamp_str = row.get('timestamp', '').strip()
                if timestamp_str:
                    # Convert HH:MM:SS to seconds
                    parts = timestamp_str.split(':')
                    if len(parts) == 3:
                        hours, minutes, seconds = map(int, parts)
                        time_seconds = hours * 3600 + minutes * 60 + seconds

                        if start_time is None or time_seconds < start_time:
                            start_time = time_seconds
                        if end_time is None or time_seconds > end_time:
                            end_time = time_seconds
    except Exception as e:
        if verbose:
            print(f"Warning: Could not extract meeting metadata: {e}")
        return None

    # Calculate duration
    duration_seconds = 0
    if start_time is not None and end_time is not None:
        duration_seconds = end_time - start_time

    metadata = {
        'participants': sorted(list(participants)),
        'meeting_duration': format_duration(duration_seconds) if duration_seconds > 0 else None,
        'duration_seconds': duration_seconds
    }

    if verbose:
        print(f"Meeting metadata extracted:")
        print(f"  Participants: {metadata['participants']}")
        print(f"  Duration: {metadata['meeting_duration']}")

    return metadata


def cleanup_and_exit(temp_dir, error_msg):
    """Clean up temporary directory and exit with error."""
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    print(f"Error: {error_msg}")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Process Google Meet recording with ShotGrid data and generate LLM summaries"
    )

    # Required arguments
    parser.add_argument("video_input", help="Video file path OR Google Drive URL/ID")
    parser.add_argument("sg_playlist_csv", help="ShotGrid playlist CSV export")
    parser.add_argument("--version-pattern", required=True, help="Regex pattern for version ID extraction")
    parser.add_argument("--version-column", required=True, help="Version column name in ShotGrid CSV")
    parser.add_argument("--model", required=True, help="LLM model name (provider auto-detected)")

    # Optional arguments
    parser.add_argument("recipient_email", nargs='?', default=None,
                       help="Email address for results (optional - if omitted, only CSV is produced)")
    parser.add_argument("--output",
                       help="Output path: directory for organized outputs (requires --project) "
                            "OR specific CSV file path (legacy mode). "
                            "Directory mode: final CSV → {output}/{project}/{basename}_processed.csv, "
                            "cached recordings → {output}/{project}/recordings/")
    parser.add_argument("--prompt-type", default="short", help="LLM prompt type (default: short)")
    parser.add_argument("--reference-threshold", type=int, default=30,
                       help="Time threshold for reference detection (default: 30)")
    parser.add_argument("--audio-model", default="base", help="Whisper model (default: base)")
    parser.add_argument("--frame-interval", type=float, default=5.0,
                       help="Frame extraction interval (default: 5.0)")
    parser.add_argument("--batch-size", type=int, default=20,
                       help="Number of frames to process in each batch for visual detection (default: 20)")
    parser.add_argument("--start-time", type=float, default=0.0,
                       help="Video start offset in seconds (default: 0.0)")
    parser.add_argument("--duration", type=float, default=None,
                       help="Max video duration to process (default: None)")
    parser.add_argument("--parallel", action="store_true",
                       help="Enable parallel audio+visual processing")
    parser.add_argument("--drive-url", default=None,
                       help="Google Drive URL for video (optional - enables clickable timestamp links in email)")
    parser.add_argument("--thumbnail-url", default=None,
                       help="Base URL for version thumbnails (optional). Version ID will be appended. Example: 'http://thumbs.example.com/images/project-'")
    parser.add_argument("--timeline-csv", default=None,
                       help="Output CSV path for chronological version timeline (optional). Shows when each version appears in the video.")
    parser.add_argument("--email-subject", default="Dailies Review Data - Version Notes and Summaries",
                       help="Custom email subject")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--keep-intermediate", action="store_true",
                       help="Keep intermediate CSV files for debugging")
    parser.add_argument("--project", type=str, default=None,
                       help="Project name for organizing outputs (required when --output is a directory)")
    parser.add_argument("--force-download", action="store_true",
                       help="Force re-download from Google Drive even if cached version exists")

    # Stage-skipping arguments
    parser.add_argument("--transcript-csv", default=None,
                       help="Path to existing transcript.csv to skip audio transcription (Stage 1a)")
    parser.add_argument("--visual-csv", default=None,
                       help="Path to existing visual.csv to skip visual detection (Stage 1b)")
    parser.add_argument("--gmeet-csv", default=None,
                       help="Path to existing gmeet_data.csv to skip entire Stage 1")
    parser.add_argument("--combined-csv", default=None,
                       help="Path to existing gmeet_and_sg_data.csv to skip Stages 1-2")

    args = parser.parse_args()

    # Validate stage-skipping arguments
    if args.gmeet_csv and args.combined_csv:
        parser.error("--gmeet-csv and --combined-csv are mutually exclusive")

    if args.gmeet_csv and (args.transcript_csv or args.visual_csv):
        parser.error("--gmeet-csv cannot be used with --transcript-csv or --visual-csv")

    if args.combined_csv and (args.transcript_csv or args.visual_csv or args.gmeet_csv):
        parser.error("--combined-csv cannot be used with other stage-skip arguments")

    # Validate that provided CSV files exist
    for arg_name, csv_path in [('--transcript-csv', args.transcript_csv),
                                ('--visual-csv', args.visual_csv),
                                ('--gmeet-csv', args.gmeet_csv),
                                ('--combined-csv', args.combined_csv)]:
        if csv_path:
            if not os.path.exists(csv_path):
                parser.error(f"{arg_name}: File not found: {csv_path}")
            if not os.path.isfile(csv_path):
                parser.error(f"{arg_name}: Path is not a file: {csv_path}")

    # Determine if output is directory or file
    output_is_dir = False
    output_dir = None
    sg_basename = os.path.splitext(os.path.basename(args.sg_playlist_csv))[0]

    if args.output:
        # Check if output is a directory (doesn't end with .csv)
        if not args.output.endswith('.csv'):
            output_is_dir = True
            output_dir = args.output

            # Require --project for directory mode
            if not args.project:
                parser.error("--project is required when --output is a directory path")

            # Note: We don't create the full directory structure here because we need
            # the recording name from Google Drive metadata first.
            # The structure will be: {output_dir}/{project}/{recording_name}/
            # This will be created in extract_google_meet_data()

            # For now, just ensure output_dir exists
            os.makedirs(output_dir, exist_ok=True)
        else:
            # File mode (legacy behavior)
            output_dir_parent = os.path.dirname(args.output)
            if output_dir_parent:
                os.makedirs(output_dir_parent, exist_ok=True)
    else:
        # No --output specified: use email subject as filename
        output_filename = sanitize_filename(args.email_subject)
        args.output = f"{output_filename}.csv"

    # Infer provider from model name
    provider = None
    for client_key, client_info in llm_clients.items():
        if client_info['model'] == args.model:
            provider = client_info['provider']
            break

    if not provider:
        available_models = get_available_models_for_enabled_providers()
        print(f"Error: Model '{args.model}' not found or provider not enabled")
        print(f"Available models: {[m['model_name'] for m in available_models]}")
        sys.exit(1)

    # Initialize timing tracking
    timing = {}
    script_start_time = time.time()

    # Create temp directory for intermediate files
    # Note: When using output_dir mode with --keep-intermediate, the directory
    # structure will be created by extract_google_meet_data() after it gets
    # the recording name from Google Drive metadata
    temp_dir = tempfile.mkdtemp(prefix="gmeet_recording_")

    print("=== Google Meet Recording Processing Pipeline ===")
    print(f"Input: {args.video_input}")
    print(f"ShotGrid: {args.sg_playlist_csv}")
    if args.recipient_email:
        print(f"Recipient: {args.recipient_email}")
    print(f"Model: {args.model}")
    print(f"Provider: {provider} (auto-detected)")
    print(f"Temp directory: {temp_dir}")
    print()

    try:
        # ===================================================================
        # Stage 1: Extract Google Meet Data (or use existing)
        # ===================================================================
        recording_dir = None

        if args.gmeet_csv:
            # Use provided gmeet CSV instead of processing
            print("=== Stage 1: Using existing gmeet_data.csv ===")
            print(f"Input: {args.gmeet_csv}")
            gmeet_csv = args.gmeet_csv
            timing['stage1'] = 0.0

            # Still process video_input for recording_dir if in output_dir mode
            # This is needed for organizing output files properly
            if output_is_dir and args.video_input:
                # Import here to avoid circular imports
                from google_drive_utils import is_google_drive_url, get_file_id_from_url

                if is_google_drive_url(args.video_input):
                    file_id = get_file_id_from_url(args.video_input)
                    recording_name = file_id
                else:
                    # Local file - use filename
                    recording_name = os.path.splitext(os.path.basename(args.video_input))[0]

                recording_name = sanitize_filename(recording_name)
                recording_dir = os.path.join(output_dir, args.project, recording_name)
                os.makedirs(recording_dir, exist_ok=True)

            if args.verbose:
                print("Stage 1 skipped - no timing data available")
            print()

        elif args.combined_csv:
            # Skip both Stage 1 and Stage 2
            print("=== Stages 1-2: Using existing gmeet_and_sg_data.csv ===")
            print(f"Input: {args.combined_csv}")
            gmeet_csv = None  # Won't be used
            timing['stage1'] = 0.0

            # Still process video_input for recording_dir if in output_dir mode
            if output_is_dir and args.video_input:
                from google_drive_utils import is_google_drive_url, get_file_id_from_url

                if is_google_drive_url(args.video_input):
                    file_id = get_file_id_from_url(args.video_input)
                    recording_name = file_id
                else:
                    recording_name = os.path.splitext(os.path.basename(args.video_input))[0]

                recording_name = sanitize_filename(recording_name)
                recording_dir = os.path.join(output_dir, args.project, recording_name)
                os.makedirs(recording_dir, exist_ok=True)

            if args.verbose:
                print("Stages 1-2 skipped - will proceed directly to Stage 3")
            print()

        else:
            # Run Stage 1 normally (with optional partial skips)
            gmeet_csv = os.path.join(temp_dir, "gmeet_data.csv")

            print("=== Stage 1: Extracting Google Meet Data ===")
            if args.transcript_csv:
                print(f"Using existing transcript: {args.transcript_csv}")
            if args.visual_csv:
                print(f"Using existing visual: {args.visual_csv}")

            stage1_start = time.time()
            result = extract_google_meet_data(
                video_path=args.video_input,
                version_pattern=args.version_pattern,
                output_csv=gmeet_csv,
                audio_model=args.audio_model,
                frame_interval=args.frame_interval,
                start_time=args.start_time,
                duration=args.duration,
                batch_size=args.batch_size,
                verbose=args.verbose,
                parallel=args.parallel,
                drive_credentials=None,  # Will use default from .env
                timeline_csv_path=args.timeline_csv,
                version_column_name=args.version_column,
                output_dir=output_dir if output_is_dir else None,
                project=args.project if output_is_dir else None,
                force_download=args.force_download,
                sg_basename=sg_basename,
                keep_intermediate=args.keep_intermediate,
                # NEW: Pass partial skip CSVs
                existing_transcript_csv=args.transcript_csv,
                existing_visual_csv=args.visual_csv
            )

            # Handle result - can be tuple (success, recording_dir, stage1_timing) or (success, stage1_timing)
            if isinstance(result, tuple):
                if len(result) == 3:
                    # With output_dir: (success, recording_dir, stage1_timing)
                    success, recording_dir, stage1_timing = result
                else:
                    # Without output_dir: (success, stage1_timing)
                    success, stage1_timing = result
                    recording_dir = None

                # Merge stage1 detailed timing into main timing dict
                timing.update(stage1_timing)
            else:
                # Backward compatibility if function doesn't return timing
                success = result
                recording_dir = None

            if not success:
                cleanup_and_exit(temp_dir, "Failed to extract Google Meet data")

            timing['stage1'] = time.time() - stage1_start

            print(f"✓ Stage 1 complete ({format_duration(timing['stage1'])})")
            print()

        # If we got a recording directory, update output paths
        if recording_dir and output_is_dir:
            # Update final CSV path using email subject
            output_filename = sanitize_filename(args.email_subject)
            args.output = os.path.join(recording_dir, f"{output_filename}.csv")

            # Update timeline CSV path if specified
            if args.timeline_csv and not os.path.dirname(args.timeline_csv):
                args.timeline_csv = os.path.join(recording_dir, args.timeline_csv)

        # ===================================================================
        # Stage 2: Combine with ShotGrid Data (or use existing)
        # ===================================================================
        if args.combined_csv:
            # Use provided combined CSV instead of processing
            print("=== Stage 2: Using existing gmeet_and_sg_data.csv ===")
            print(f"Input: {args.combined_csv}")
            combined_csv = args.combined_csv
            timing['stage2'] = 0.0

            if args.verbose:
                print("Stage 2 skipped - no timing data available")
            print()

        else:
            # Run Stage 2 normally
            combined_csv = os.path.join(temp_dir, "gmeet_and_sg_data.csv")

            print("=== Stage 2: Combining with ShotGrid Data ===")
            stage2_start = time.time()

            # Load ShotGrid data (using provided version column)
            sg_data = load_sg_data(
                args.sg_playlist_csv,
                args.version_column,
                args.version_pattern
            )
            print(f"Loaded {len(sg_data)} ShotGrid versions")

            # Load transcript data (always uses 'version_id' from Stage 1 output)
            transcript_data, chronological_order = load_transcript_data(
                gmeet_csv,
                'version_id',  # Output from stage 1 always uses this column name
                args.version_pattern
            )
            print(f"Loaded {len(transcript_data)} transcript versions")

            # Process and merge
            output_rows, processed_sg_versions = process_transcript_versions_with_time_analysis(
                transcript_data,
                chronological_order,
                sg_data,
                args.reference_threshold
            )

            # Add remaining SG versions not in transcript
            remaining_sg_versions = set(sg_data.keys()) - processed_sg_versions
            for version_num in sorted(remaining_sg_versions, key=lambda x: int(x) if x.isdigit() else 0):
                output_rows.append({
                    'shot': sg_data[version_num].get('shot', ''),
                    'version_id': version_num,
                    'notes': sg_data[version_num]['notes'],
                    'conversation': '',
                    'timestamp': '',
                    'reference_versions': '',
                    'duration_seconds': 0
                })

            # Write combined CSV
            with open(combined_csv, 'w', newline='', encoding='utf-8') as f:
                fieldnames = ['shot', 'version_id', 'notes', 'conversation', 'timestamp', 'reference_versions', 'duration_seconds']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(output_rows)

            print(f"Combined data saved: {len(output_rows)} versions")

            timing['stage2'] = time.time() - stage2_start
            print(f"✓ Stage 2 complete ({format_duration(timing['stage2'])})")
            print()

        # ===================================================================
        # Stage 3: Generate LLM Summaries
        # ===================================================================
        print("=== Stage 3: Generating LLM Summaries ===")
        print(f"Using model: {args.model}")
        print(f"Inferred provider: {provider}")

        stage3_start = time.time()
        result = process_csv_with_llm_summaries(
            csv_path=combined_csv,
            output_path=args.output,
            provider=provider,
            model=args.model,
            prompt_type=args.prompt_type
        )

        # Handle result - can be tuple (success, llm_time) or just bool
        if isinstance(result, tuple):
            success, llm_time = result
            timing['llm_summarization'] = llm_time
        else:
            success = result

        if not success:
            cleanup_and_exit(temp_dir, "Failed to generate LLM summaries")

        timing['stage3'] = time.time() - stage3_start
        print(f"LLM summaries saved to: {args.output}")
        print(f"✓ Stage 3 complete ({format_duration(timing['stage3'])})")
        print()

        # ===================================================================
        # Stage 4: Send Email (Optional)
        # ===================================================================
        if args.recipient_email:
            print("=== Stage 4: Sending Email ===")

            try:
                # Calculate total execution time
                total_time = time.time() - script_start_time

                # Extract meeting metadata from gmeet_data.csv
                meeting_metadata = None
                if not args.combined_csv:
                    # Only extract metadata if we have gmeet_csv (not when using --combined-csv)
                    if args.gmeet_csv:
                        # Using provided gmeet_csv
                        meeting_metadata = extract_meeting_metadata(args.gmeet_csv, verbose=args.verbose)
                    elif gmeet_csv and os.path.exists(gmeet_csv):
                        # Using generated gmeet_csv
                        meeting_metadata = extract_meeting_metadata(gmeet_csv, verbose=args.verbose)

                # Prepare meeting info for email
                participants = meeting_metadata['participants'] if meeting_metadata else None
                meeting_duration = meeting_metadata['meeting_duration'] if meeting_metadata else None

                if args.verbose and meeting_metadata:
                    print(f"Including meeting summary in email:")
                    print(f"  Participants: {participants}")
                    print(f"  Meeting Duration: {meeting_duration}")

                success = send_csv_email(
                    args.recipient_email,
                    args.output,
                    drive_url=args.drive_url,
                    thumbnail_url=args.thumbnail_url,
                    timeline_csv_path=args.timeline_csv,
                    subject=args.email_subject,
                    execution_time=format_duration(total_time),
                    timing_breakdown=timing,
                    participants=participants,
                    meeting_duration=meeting_duration
                )
                if success:
                    print(f"Email sent successfully to {args.recipient_email}")
                    if args.verbose:
                        print("✓ Stage 4 complete")
                else:
                    print("Warning: Email send failed (see error messages above)")
                    print("Results are still saved to CSV")
            except Exception as e:
                print(f"Warning: Email send failed with exception: {e}")
                print("Results are still saved to CSV")
            print()
        else:
            print("=== Skipping Email (no recipient provided) ===")
            print()

        # ===================================================================
        # Cleanup
        # ===================================================================
        print("=== Cleanup ===")

        if not args.keep_intermediate:
            shutil.rmtree(temp_dir)
            print(f"Removed temporary files: {temp_dir}")
        else:
            # Copy remaining intermediate files to recording directory
            if recording_dir:
                intermediate_dir = os.path.join(recording_dir, "intermediate")
                os.makedirs(intermediate_dir, exist_ok=True)

                # Determine which intermediate files to copy based on what was generated
                files_to_copy = []

                # Always copy the input ShotGrid CSV for reference
                sg_csv_basename = os.path.basename(args.sg_playlist_csv)
                if os.path.exists(args.sg_playlist_csv):
                    files_to_copy.append(('input ShotGrid CSV', args.sg_playlist_csv, sg_csv_basename))

                # Only copy gmeet_data.csv if we actually ran Stage 1
                if not args.gmeet_csv and not args.combined_csv:
                    files_to_copy.append('gmeet_data.csv')

                # Only copy gmeet_and_sg_data.csv if we actually ran Stage 2
                if not args.combined_csv:
                    files_to_copy.append('gmeet_and_sg_data.csv')

                # Copy files that exist
                for item in files_to_copy:
                    if isinstance(item, tuple):
                        # Tuple format: (label, source_path, dest_filename)
                        label, src, dest_filename = item
                        if os.path.exists(src):
                            dst = os.path.join(intermediate_dir, dest_filename)
                            shutil.copy2(src, dst)
                            print(f"Copied {label} to intermediate/{dest_filename}")
                    else:
                        # String format: filename in temp_dir
                        filename = item
                        src = os.path.join(temp_dir, filename)
                        if os.path.exists(src):
                            dst = os.path.join(intermediate_dir, filename)
                            shutil.copy2(src, dst)
                            print(f"Copied {filename} to intermediate/")

                # Clean up temp directory after copying
                shutil.rmtree(temp_dir)
                print(f"Kept intermediate files in: {intermediate_dir}")
            else:
                print(f"Kept intermediate files in: {temp_dir}")

        # ===================================================================
        # Final Summary
        # ===================================================================
        total_time = time.time() - script_start_time

        print("\n" + "="*60)
        print("Processing Complete!")
        print(f"Total Time: {format_duration(total_time)}")
        print("\nTiming Breakdown:")

        if 'download' in timing:
            print(f"  • Google Drive Download: {format_duration(timing['download'])}")

        # Show parallel processing speedup if available
        if 'parallel_elapsed' in timing and 'parallel_speedup' in timing:
            print(f"  • Audio Transcription: {format_duration(timing['transcription'])} (actual)")
            print(f"  • Visual Detection: {format_duration(timing['visual_detection'])} (actual)")
            sequential_time = timing['transcription'] + timing['visual_detection']
            print(f"    → Sequential would take: {format_duration(sequential_time)}")
            print(f"    → Parallel took: {format_duration(timing['parallel_elapsed'])}")
            print(f"    → Speedup: {timing['parallel_speedup']:.2f}x")
        else:
            # Sequential mode
            if 'transcription' in timing:
                print(f"  • Audio Transcription: {format_duration(timing['transcription'])}")
            if 'visual_detection' in timing:
                print(f"  • Visual Detection (bbox + speaker): {format_duration(timing['visual_detection'])}")

        if 'llm_summarization' in timing:
            print(f"  • LLM Summarization: {format_duration(timing['llm_summarization'])}")

        print("="*60)
        print(f"\nFinal output: {args.output}")
        print("Pipeline completed successfully!")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        cleanup_and_exit(temp_dir, "Processing interrupted")
    except Exception as e:
        import traceback
        traceback.print_exc()
        cleanup_and_exit(temp_dir, f"Unexpected error: {e}")


if __name__ == "__main__":
    main()
