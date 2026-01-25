import argparse
import csv
import os
import subprocess
import tempfile

import whisper


def extract_audio_from_video(video_file_path: str, audio_file_path: str, duration: float = None) -> bool:
    """
    Extracts audio from a video file and saves it as an MP3 file using ffmpeg.

    Args:
        video_file_path (str): The path to the input video file.
        audio_file_path (str): The path to save the output MP3 audio file.
        duration (float, optional): Duration in seconds to extract. If None, extracts entire audio.

    Returns:
        bool: True if extraction was successful, False otherwise.
    """
    if not os.path.exists(video_file_path):
        print(f"Error: Video file not found at '{video_file_path}'")
        return False

    try:
        # Build ffmpeg command
        cmd = ['ffmpeg', '-i', video_file_path, '-y']  # -y to overwrite output file
        
        if duration is not None:
            cmd.extend(['-t', str(duration)])
            print(f"Extracting audio for first {duration} seconds")
        
        # Audio extraction options
        cmd.extend([
            '-vn',  # No video
            '-acodec', 'mp3',  # Audio codec
            '-ar', '16000',  # Sample rate (16kHz is good for speech)
            '-ac', '1',  # Mono audio
            audio_file_path
        ])
        
        # Run ffmpeg
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"Successfully extracted audio to '{audio_file_path}'")
            return True
        else:
            print(f"Error: ffmpeg failed with return code {result.returncode}")
            print(f"Error output: {result.stderr}")
            return False
            
    except FileNotFoundError:
        print("Error: ffmpeg not found. Please install ffmpeg.")
        return False
    except Exception as e:
        print(f"An error occurred during audio extraction: {e}")
        return False


def transcribe_audio(audio_file_path: str, model_name: str = "base", verbose: bool = False) -> dict:
    """
    Transcribes audio using OpenAI's Whisper model.

    Args:
        audio_file_path (str): The path to the audio file.
        model_name (str): The Whisper model to use (tiny, base, small, medium, large).
        verbose (bool): Print detailed progress information.

    Returns:
        dict: The transcription result with timestamps.
    """
    model = None
    try:
        if verbose:
            print(f"Loading Whisper model '{model_name}'...")

        model = whisper.load_model(model_name)

        if verbose:
            print(f"Model loaded successfully. Starting transcription...")
            print("This may take several minutes depending on the audio length and model size...")

            # Get audio duration for progress estimation
            try:
                import librosa
                audio_duration = librosa.get_duration(filename=audio_file_path)
                print(f"Audio duration: {audio_duration:.1f} seconds")

                # Rough time estimates based on model size (these are approximate)
                model_speed_multipliers = {
                    'tiny': 32, 'base': 16, 'small': 8, 'medium': 4, 'large': 2
                }
                estimated_time = audio_duration / model_speed_multipliers.get(model_name, 8)
                print(f"Estimated processing time: {estimated_time:.1f} seconds")
            except ImportError:
                if verbose:
                    print("Install librosa for audio duration estimation: pip install librosa")
            except Exception as e:
                if verbose:
                    print(f"Could not estimate audio duration: {e}")

        # Use verbose parameter to show progress if available
        if verbose:
            result = model.transcribe(audio_file_path, word_timestamps=True, verbose=True)
        else:
            result = model.transcribe(audio_file_path, word_timestamps=True, verbose=False)

        if verbose:
            segments_count = len(result.get('segments', []))
            print(f"Transcription completed successfully!")
            print(f"Generated {segments_count} transcript segments")

        return result
    except Exception as e:
        print(f"An error occurred during transcription: {e}")
        return None
    finally:
        # Explicitly delete model and free memory
        if model is not None:
            del model
            import gc
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()
            if verbose:
                print("Released Whisper model from memory")


def save_transcript_to_csv(transcript_result: dict, output_csv_path: str) -> bool:
    """
    Saves the transcript to a CSV file with timestamps and dialogue.

    Args:
        transcript_result (dict): The result from Whisper transcription.
        output_csv_path (str): The path to save the CSV file.

    Returns:
        bool: True if successful, False otherwise.
    """
    try:
        with open(output_csv_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['start_time', 'end_time', 'text']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            
            # Extract segments with timestamps
            for segment in transcript_result.get('segments', []):
                writer.writerow({
                    'start_time': f"{segment['start']:.2f}",
                    'end_time': f"{segment['end']:.2f}",
                    'text': segment['text'].strip()
                })
        
        print(f"Transcript saved to '{output_csv_path}'")
        return True
    except Exception as e:
        print(f"An error occurred while saving CSV: {e}")
        return False


def process_media_file(input_file_path: str, output_csv_path: str, model_name: str = "base", duration: float = None, verbose: bool = False, cache_audio_path: str = None) -> bool:
    """
    Processes a media file (.mp4 or .mp3) to extract transcript.

    Args:
        input_file_path (str): Path to the input media file.
        output_csv_path (str): Path to save the output CSV file.
        model_name (str): Whisper model to use for transcription.
        duration (float, optional): Duration in seconds to process. If None, processes entire file.
        verbose (bool): Print detailed progress information.
        cache_audio_path (str, optional): Path to cache the extracted audio file. If provided and exists,
                                         skips audio extraction. If provided and doesn't exist, saves
                                         extracted audio to this path for future use.

    Returns:
        bool: True if successful, False otherwise.
    """
    if not os.path.exists(input_file_path):
        print(f"Error: Input file not found at '{input_file_path}'")
        return False

    if verbose:
        print(f"Processing media file: {input_file_path}")
        print(f"Using Whisper model: {model_name}")
        if duration:
            print(f"Processing duration: {duration} seconds")

    file_extension = os.path.splitext(input_file_path)[1].lower()

    # Determine if we need to extract audio or can use the file directly
    if file_extension == '.mp3':
        audio_file_path = input_file_path
        temp_audio_file = None
        if verbose:
            print("Input is MP3, using directly for transcription")
    elif file_extension == '.mp4':
        # Check if cached audio exists
        if cache_audio_path and os.path.exists(cache_audio_path):
            audio_file_path = cache_audio_path
            temp_audio_file = None
            if verbose:
                print(f"Using cached audio file: {cache_audio_path}")
        else:
            # Determine where to save extracted audio
            if cache_audio_path:
                # Save to cache location
                audio_file_path = cache_audio_path
                temp_audio_file = None
                # Create parent directory if needed
                os.makedirs(os.path.dirname(cache_audio_path), exist_ok=True)
                if verbose:
                    print(f"Input is MP4, extracting audio to cache: {audio_file_path}")
            else:
                # Create temporary audio file
                temp_audio_file = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
                audio_file_path = temp_audio_file.name
                temp_audio_file.close()
                if verbose:
                    print(f"Input is MP4, extracting audio to temporary file: {audio_file_path}")

            # Extract audio from video
            if not extract_audio_from_video(input_file_path, audio_file_path, duration):
                if temp_audio_file:
                    os.unlink(audio_file_path)
                return False
    else:
        print(f"Error: Unsupported file format '{file_extension}'. Supported formats: .mp4, .mp3")
        return False

    # If duration is specified and we're using a full audio file (cached or MP3),
    # create a temporary trimmed version to save transcription time
    temp_trimmed_audio = None
    transcription_audio_path = audio_file_path

    if duration is not None:
        # Check if the audio file is longer than the requested duration
        # We'll create a trimmed version regardless to ensure we only transcribe what's needed
        temp_trimmed_audio = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        trimmed_path = temp_trimmed_audio.name
        temp_trimmed_audio.close()

        if verbose:
            print(f"Creating trimmed audio file (first {duration}s) to save transcription time...")

        # Use ffmpeg to extract just the first N seconds
        try:
            cmd = [
                'ffmpeg', '-i', audio_file_path, '-y',
                '-t', str(duration),
                '-acodec', 'copy',  # Copy codec to avoid re-encoding (faster)
                trimmed_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                transcription_audio_path = trimmed_path
                if verbose:
                    print(f"Trimmed audio created: {trimmed_path}")
            else:
                if verbose:
                    print(f"Warning: Failed to create trimmed audio, will transcribe full file")
                    print(f"FFmpeg error: {result.stderr}")
                # Clean up failed temp file
                try:
                    os.unlink(trimmed_path)
                except:
                    pass
                temp_trimmed_audio = None
        except Exception as e:
            if verbose:
                print(f"Warning: Could not create trimmed audio: {e}")
            # Clean up failed temp file
            try:
                os.unlink(trimmed_path)
            except:
                pass
            temp_trimmed_audio = None

    try:
        # Transcribe audio
        if verbose:
            print(f"Transcribing audio using Whisper model '{model_name}'...")
            if temp_trimmed_audio:
                print(f"Transcribing trimmed audio ({duration}s) instead of full cached file")
            print("This may take several minutes depending on the audio length and model size...")
        else:
            print(f"Transcribing audio using Whisper model '{model_name}'...")
        transcript_result = transcribe_audio(transcription_audio_path, model_name, verbose)

        if transcript_result is None:
            return False

        if verbose:
            segments_count = len(transcript_result.get('segments', []))
            total_duration = transcript_result.get('segments', [{}])[-1].get('end', 0) if segments_count > 0 else 0
            print(f"Transcription completed! Found {segments_count} segments spanning {total_duration:.1f} seconds")

        # Save to CSV
        success = save_transcript_to_csv(transcript_result, output_csv_path)

        # Explicitly delete transcript_result to free memory (can be very large for long videos)
        del transcript_result
        import gc
        gc.collect()

        return success
    finally:
        # Clean up temporary trimmed audio file if created
        if temp_trimmed_audio:
            try:
                os.unlink(transcription_audio_path)
                if verbose:
                    print(f"Cleaned up temporary trimmed audio file")
            except OSError:
                pass

        # Clean up temporary audio file if created (but not cached files)
        if file_extension == '.mp4' and temp_audio_file:
            try:
                os.unlink(audio_file_path)
                if verbose:
                    print(f"Cleaned up temporary audio file")
            except OSError:
                pass


def main():
    """
    Main function to handle command-line arguments for audio transcription.
    """
    parser = argparse.ArgumentParser(
        description="Extract audio transcript from .mp4 or .mp3 files using Whisper and save as CSV."
    )
    parser.add_argument("input_file", help="Path to the input media file (.mp4 or .mp3).")
    parser.add_argument("-o", "--output", help="Path for the output CSV file. If not provided, it will be the same as the input file with a .csv extension.")
    parser.add_argument("-m", "--model", default="base", choices=["tiny", "base", "small", "medium", "large"], 
                       help="Whisper model to use for transcription (default: base).")
    parser.add_argument("-d", "--duration", type=float, help="Duration in seconds to process from the beginning of the file. If not specified, processes the entire file.")
    parser.add_argument("-v", "--verbose", action="store_true", help="Print detailed progress information.")
    
    args = parser.parse_args()

    # Determine output file path
    if args.output:
        output_file = args.output
    else:
        base_name = os.path.splitext(args.input_file)[0]
        output_file = f"{base_name}_transcript.csv"

    # Process the media file
    success = process_media_file(args.input_file, output_file, args.model, args.duration, args.verbose)
    
    if success:
        print(f"Transcript successfully saved to '{output_file}'")
    else:
        print("Failed to process the media file.")
        exit(1)

if __name__ == "__main__":
    main()