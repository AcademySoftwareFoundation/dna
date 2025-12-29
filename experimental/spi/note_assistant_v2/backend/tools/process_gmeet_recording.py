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

    args = parser.parse_args()

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
        # No --output specified: use current directory (legacy behavior)
        args.output = f"{sg_basename}_processed.csv"

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
        # Stage 1: Extract Google Meet Data
        # ===================================================================
        gmeet_csv = os.path.join(temp_dir, "gmeet_data.csv")

        print("=== Stage 1: Extracting Google Meet Data ===")
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
            keep_intermediate=args.keep_intermediate
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

        # If we got a recording directory, update output paths
        if recording_dir and output_is_dir:
            # Update final CSV path
            args.output = os.path.join(recording_dir, f"{sg_basename}_processed.csv")

            # Update timeline CSV path if specified
            if args.timeline_csv and not os.path.dirname(args.timeline_csv):
                args.timeline_csv = os.path.join(recording_dir, args.timeline_csv)

        print(f"✓ Stage 1 complete ({format_duration(timing['stage1'])})")
        print()

        # ===================================================================
        # Stage 2: Combine with ShotGrid Data
        # ===================================================================
        combined_csv = os.path.join(temp_dir, "combined_data.csv")

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
            args.reference_threshold,
            version_column=args.version_column
        )

        # Add remaining SG versions not in transcript
        remaining_sg_versions = set(sg_data.keys()) - processed_sg_versions
        for version_num in sorted(remaining_sg_versions, key=lambda x: int(x) if x.isdigit() else 0):
            output_rows.append({
                'shot': sg_data[version_num].get('shot', ''),
                args.version_column: sg_data[version_num].get('jts', ''),
                'notes': sg_data[version_num]['notes'],
                'conversation': '',
                'timestamp': '',
                'reference_versions': '',
                'version_id': version_num
            })

        # Write combined CSV
        with open(combined_csv, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ['shot', args.version_column, 'notes', 'conversation', 'timestamp', 'reference_versions', 'version_id']
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

                success = send_csv_email(
                    args.recipient_email,
                    args.output,
                    drive_url=args.drive_url,
                    thumbnail_url=args.thumbnail_url,
                    timeline_csv_path=args.timeline_csv,
                    subject=args.email_subject,
                    execution_time=format_duration(total_time),
                    timing_breakdown=timing
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
            if recording_dir:
                print(f"Kept intermediate files in: {recording_dir}")
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
