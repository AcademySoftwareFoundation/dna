#!/usr/bin/env python3
"""
Speaker Name and Version ID Detection Tool

This script detects speaker names and optionally version IDs from video conference screenshots or video files.
It automatically detects speaker panels and version ID regions using computer vision and/or AI models,
then extracts text from those regions using OCR to identify speaker names and version identifiers.

Key Features:
- Automatic speaker panel detection (no manual bounding box required)
- Optional version ID detection with regex pattern matching
- Support for both image files and video files
- Batch processing for efficient video analysis
- OCR engine: EasyOCR with GPU acceleration when available
- Verbose diagnostics and debug crops to troubleshoot OCR behavior
- Time-based processing with start time offset support
- Outputs results in CSV format with timestamps

Detection Methods:
- CV (Computer Vision): Fast edge detection method for speaker panels
- LLM (Large Language Model): AI-powered detection using Google Gemini
- CV+LLM: Tries CV first, falls back to LLM if needed (default)
- OCR Pattern Matching: Uses regex patterns to find version IDs in detected regions

Usage Examples:
    # Process a single image for speaker names only
    python get_onscreen_text.py screenshot.png -v

    # Process a video with default 5-second intervals
    python get_onscreen_text.py meeting.mp4 -v

    # Process video with version ID detection
    python get_onscreen_text.py meeting.mp4 --version-pattern "v\\d+\\.\\d+\\.\\d+" -v

    # Process with custom interval and output file
    python get_onscreen_text.py meeting.mp4 --interval 2.0 -o speakers.csv

    # Process only 5 minutes starting from 2 minutes into the video
    python get_onscreen_text.py meeting.mp4 --start-time 120 --duration 300 --verbose

    # Detect build numbers and speaker names
    python get_onscreen_text.py meeting.mp4 --version-pattern "proj-\\d+" --interval 1.0

    # Use full image OCR without speaker panel detection
    python get_onscreen_text.py frame.png --no-crop -v

Requirements:
- OpenCV (cv2)
- NumPy
- PIL (Pillow)
- EasyOCR (default OCR engine)
- FFmpeg (for video processing)
- Google Generative AI (optional, for LLM fallback)
- python-dotenv

Note: This script imports detection functions from get_speaker_bbox.py and get_version_id_bbox.py

Architecture:
The tool uses a modular approach with separate detection functions:
- get_speaker_bbox.py: Detects speaker panel regions using CV/LLM methods
- get_version_id_bbox.py: Detects version ID regions using OCR + regex pattern matching
- get_onscreen_text.py: Orchestrates the detection pipeline and processes video files

Workflow:
1. Sample frames from video to calculate average bounding boxes for consistent detection
2. Extract frames at specified intervals using optimized FFmpeg batch processing
3. For each frame:
   - Crop to speaker panel region and run OCR for name detection
   - Crop to version ID region (if pattern provided) and run OCR + regex matching
4. Post-process results to sanitize similar names and output to CSV format

Output Format:
- Single detection: CSV with columns [timestamp, speaker_name]
- Dual detection: CSV with columns [timestamp, speaker_name, version_id]
- Debug mode: Saves extracted frames and cropped regions with timestamp-based naming
"""

import argparse
import os
import re
import csv
import subprocess
import tempfile
import numpy as np
from typing import Optional
from PIL import Image
import easyocr
import logging
import difflib
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import multiprocessing
import threading

# Import speaker bbox detection functions
from get_speaker_bbox import detect_speaker_bbox_cv, detect_speaker_bbox_llm

# Import version ID bbox detection function
from get_version_id_bbox import detect_version_id_bbox_ocr


def _process_bbox_sample_worker(args):
    """
    Worker function for parallel bounding box detection from sample frames.
    This function is designed to be called by ThreadPoolExecutor for bbox averaging.
    
    Args:
        args: Tuple containing (frame_path, timestamp, version_pattern, verbose)
        
    Returns:
        Tuple of (timestamp, speaker_bbox, version_bbox, success)
    """
    frame_path, timestamp, version_pattern, verbose = args
    
    speaker_bbox = None
    version_bbox = None
    success = False
    
    if os.path.exists(frame_path):
        try:
            # Detect speaker panel bbox
            speaker_bbox = get_speaker_bbox(frame_path, method="cv+llm", verbose=False)  # Disable verbose in parallel
            
            # Detect version ID bbox if pattern provided
            if version_pattern:
                try:
                    result = detect_version_id_bbox_ocr(frame_path, version_pattern, debug=False)
                    if result and result.get("found_version_text") and result.get("bounding_box"):
                        version_bbox = result["bounding_box"]
                except Exception as e:
                    if verbose:
                        print(f"  -> Version ID detection failed for frame at {timestamp:.2f}s: {e}")
            
            success = True
            
        except Exception as e:
            if verbose:
                print(f"  -> Error processing sample frame at {timestamp:.2f}s: {e}")
    
    return timestamp, speaker_bbox, version_bbox, success


def perform_ocr(target_img: Image.Image, reader: easyocr.Reader = None, verbose: bool = False):
    """
    Perform OCR using EasyOCR only, with default settings.
    Returns a list of (text, confidence) tuples.
    """
    results = []
    if reader is None:
        reader = easyocr.Reader(['en'])
    target_array = np.array(target_img)
    try:
        ocr_results = reader.readtext(target_array)
    except Exception as e:
        if verbose:
            print(f"EasyOCR failed: {e}")
        ocr_results = []
    for (_bbox, text, confidence) in ocr_results:
        if verbose:
            print(f"[easyocr] raw: text='{text}' conf={float(confidence):.2f}")
        results.append((text, float(confidence)))
    return results


def get_speaker_bbox(image_path: str, method: str = "cv+llm", verbose: bool = False) -> dict:
    """
    Automatically detect speaker panel bounding box from an image.
    
    Args:
        image_path: Path to the image file
        method: Detection method ("cv", "llm", or "cv+llm")
        verbose: If True, print progress information
        
    Returns:
        Dictionary with normalized bounding box coordinates or None if not found
    """
    result = None
    
    if method in ("cv", "cv+llm"):
        try:
            result = detect_speaker_bbox_cv(image_path, debug=False)
            if verbose:
                print("Speaker panel detected using CV method")
        except Exception as e:
            if verbose:
                print(f"CV detection failed: {e}")
    
    if result is None and method in ("llm", "cv+llm"):
        try:
            result = detect_speaker_bbox_llm(image_path)
            if verbose:
                print("Speaker panel detected using LLM method")
        except Exception as e:
            if verbose:
                print(f"LLM detection failed: {e}")
    
    if result and result.get("found_speaker_panel") and result.get("bounding_box"):
        return result["bounding_box"]
    
    if verbose:
        print("No speaker panel found")
    return None


def get_video_duration(video_path: str) -> float:
    """
    Get the duration of a video file in seconds using ffprobe.
    
    Args:
        video_path: Path to the video file
        
    Returns:
        Duration in seconds, or None if error
    """
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"Error getting video duration: {e}")
        return None


def extract_frame_at_time(video_path: str, timestamp: float, output_path: str) -> bool:
    """
    Extract a single frame from a video at a specific timestamp.
    
    Args:
        video_path: Path to the video file
        timestamp: Time in seconds
        output_path: Path to save the extracted frame
        
    Returns:
        True if successful, False otherwise
    """
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-ss", str(timestamp),
            "-vframes", "1",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error extracting frame at {timestamp}s: {e}")
        return False


def extract_frames_batch(video_path: str, timestamps: list, temp_dir: str, frame_start_number: int = 0, verbose: bool = False) -> dict:
    """
    Extract multiple frames from a video at specified timestamps using FFmpeg.
    Uses single-pass extraction with -vf fps=... if timestamps are regularly spaced.
    """
    result = {}
    if not timestamps:
        return result

    # Check if timestamps are regularly spaced
    if len(timestamps) > 1:
        interval = timestamps[1] - timestamps[0]
        is_regular = all(abs((timestamps[i] - timestamps[i-1]) - interval) < 1e-3 for i in range(2, len(timestamps)))
    else:
        is_regular = True

    if is_regular:
        # Use single-pass extraction
        fps = 1.0 / (timestamps[1] - timestamps[0]) if len(timestamps) > 1 else 1.0
        start_time = timestamps[0]  # Start from the first timestamp
        if verbose:
            print(f"Using single-pass FFmpeg extraction with fps={fps:.4f}, starting at {start_time:.2f}s")
        output_pattern = os.path.join(temp_dir, "frame_%04d.png")
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-ss", str(start_time),  # Seek to the start time
            "-vf", f"fps={fps}",
            output_pattern
        ]
        if verbose:
            print(f"FFmpeg command: {' '.join(cmd)}")
        subprocess.run(cmd, capture_output=True, check=True)
        # Map output frames to timestamps
        for i, timestamp in enumerate(timestamps):
            frame_path = os.path.join(temp_dir, f"frame_{i+1:04d}.png")
            if os.path.exists(frame_path):
                result[timestamp] = frame_path
            else:
                if verbose:
                    print(f"Warning: Frame for timestamp {timestamp:.2f}s was not created")
        if verbose:
            print(f"Successfully extracted {len(result)}/{len(timestamps)} frames (single-pass)")
        return result
    else:
        # Fallback to old method for irregular timestamps
        if verbose:
            print("Timestamps are not regular, using multi-seek extraction.")
        # ...existing code for multi-seek extraction...
        cmd = ["ffmpeg", "-y", "-i", video_path]
        for i, timestamp in enumerate(timestamps):
            frame_number = frame_start_number + i
            frame_path = os.path.join(temp_dir, f"frame_{frame_number:04d}_{timestamp:.2f}s.png")
            cmd.extend([
                "-ss", str(timestamp),
                "-t", "0.04",
                "-vframes", "1",
                frame_path
            ])
        subprocess.run(cmd, capture_output=True, check=True)
        for i, timestamp in enumerate(timestamps):
            frame_number = frame_start_number + i
            frame_path = os.path.join(temp_dir, f"frame_{frame_number:04d}_{timestamp:.2f}s.png")
            if os.path.exists(frame_path):
                result[timestamp] = frame_path
            else:
                if verbose:
                    print(f"Warning: Frame at {timestamp:.2f}s was not created")
        if verbose:
            print(f"Successfully extracted {len(result)}/{len(timestamps)} frames (multi-seek)")
        return result


def get_average_bounding_boxes(video_path, duration, version_pattern=None, sample_count=4, verbose=False, start_time=0.0, parallel=False):
    """
    Samples frames at evenly spaced intervals and averages the detected bounding boxes.
    Extracts frames only once and runs both speaker and version ID detection on the same frames.
    
    Args:
        video_path: Path to the video file
        duration: Video duration in seconds
        version_pattern: Regex pattern for version ID detection (optional)
        sample_count: Number of sample frames to use
        verbose: Print progress information
        start_time: Start time offset in seconds (default: 0.0)
        parallel: Use parallel processing for bounding box detection (default: False)
        
    Returns:
        Tuple of (avg_speaker_bbox, avg_version_bbox) where each is a dict with normalized coordinates or None
    """
    sample_fracs = [0.2, 0.4, 0.6, 0.8][:sample_count]
    # Apply start_time offset to sampling timestamps
    effective_duration = duration - start_time
    sample_timestamps = [start_time + (effective_duration * frac) for frac in sample_fracs]
    speaker_bboxes = []
    version_bboxes = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        if verbose:
            print(f"Extracting {len(sample_timestamps)} sample frames for bbox detection...")
            if parallel:
                print("Using parallel processing for sample frame bbox detection...")
        
        # First, extract all sample frames
        extracted_frames = {}
        for i, ts in enumerate(sample_timestamps):
            frame_path = os.path.join(temp_dir, f"sample_{i:02d}.png")
            if extract_frame_at_time(video_path, ts, frame_path):
                extracted_frames[ts] = frame_path
            else:
                if verbose:
                    print(f"Failed to extract frame at {ts:.2f}s")
        
        if not extracted_frames:
            if verbose:
                print("No sample frames could be extracted")
            return None, None
        
        if parallel and len(extracted_frames) > 1:
            # Use parallel processing for bounding box detection
            if verbose:
                print(f"Processing {len(extracted_frames)} sample frames in parallel...")
            
            # Prepare arguments for parallel processing
            parallel_args = []
            for timestamp in sample_timestamps:
                frame_path = extracted_frames.get(timestamp)
                if frame_path and os.path.exists(frame_path):
                    parallel_args.append((frame_path, timestamp, version_pattern, verbose))
            
            # Process frames in parallel using threading
            max_workers = min(4, len(parallel_args))  # Limit workers for bbox detection
            if verbose:
                print(f"Using {max_workers} threaded workers for bbox detection")
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                parallel_results = list(executor.map(_process_bbox_sample_worker, parallel_args))
            
            # Collect results
            for timestamp, speaker_bbox, version_bbox, success in parallel_results:
                if success:
                    if speaker_bbox:
                        speaker_bboxes.append(speaker_bbox)
                        if verbose:
                            print(f"  -> Speaker bbox at {timestamp:.2f}s: {speaker_bbox}")
                    
                    if version_bbox:
                        version_bboxes.append(version_bbox)
                        if verbose:
                            print(f"  -> Version bbox at {timestamp:.2f}s: {version_bbox}")
                else:
                    if verbose:
                        print(f"  -> Failed to process frame at {timestamp:.2f}s")
        
        else:
            # Use sequential processing (original logic)
            for i, ts in enumerate(sample_timestamps):
                frame_path = extracted_frames.get(ts)
                if frame_path and os.path.exists(frame_path):
                    if verbose:
                        print(f"Processing sample frame at {ts:.2f}s...")
                    
                    # Detect speaker panel bbox
                    speaker_bbox = get_speaker_bbox(frame_path, method="cv+llm", verbose=verbose)
                    if speaker_bbox:
                        speaker_bboxes.append(speaker_bbox)
                        if verbose:
                            print(f"  -> Speaker bbox: {speaker_bbox}")
                    
                    # Detect version ID bbox if pattern provided
                    if version_pattern:
                        try:
                            result = detect_version_id_bbox_ocr(frame_path, version_pattern, debug=False)
                            if result and result.get("found_version_text") and result.get("bounding_box"):
                                version_bboxes.append(result["bounding_box"])
                                if verbose:
                                    print(f"  -> Version bbox: {result['bounding_box']}")
                        except Exception as e:
                            if verbose:
                                print(f"  -> Version ID detection failed: {e}")
        
        # Calculate average speaker bbox
        avg_speaker_bbox = None
        if speaker_bboxes:
            avg_speaker_bbox = {key: sum(b[key] for b in speaker_bboxes) / len(speaker_bboxes) for key in ['x', 'y', 'width', 'height']}
            if verbose:
                print(f"Average speaker panel bbox: {avg_speaker_bbox}")
        else:
            if verbose:
                print("No speaker panel detected in any sample frames.")
        
        # Calculate average version bbox
        avg_version_bbox = None
        if version_pattern:
            if version_bboxes:
                avg_version_bbox = {key: sum(b[key] for b in version_bboxes) / len(version_bboxes) for key in ['x', 'y', 'width', 'height']}
                if verbose:
                    print(f"Average version ID bbox: {avg_version_bbox}")
            else:
                if verbose:
                    print("No version ID detected in any sample frames.")
        
        return avg_speaker_bbox, avg_version_bbox
        
    finally:
        import shutil
        shutil.rmtree(temp_dir)


def get_average_speaker_bbox(video_path, duration, sample_count=4, verbose=False, parallel=False):
    """
    Legacy function for backward compatibility.
    Samples frames at evenly spaced intervals and averages the detected speaker panel bounding boxes.
    Returns the average bbox as a dict with normalized coordinates.
    """
    avg_speaker_bbox, _ = get_average_bounding_boxes(video_path, duration, version_pattern=None, sample_count=sample_count, verbose=verbose, parallel=parallel)
    return avg_speaker_bbox


def get_average_version_bbox(video_path, duration, version_pattern, sample_count=4, verbose=False, parallel=False):
    """
    Legacy function for backward compatibility.
    Samples frames at evenly spaced intervals and averages the detected version ID bounding boxes.
    Returns the average bbox as a dict with normalized coordinates.
    """
    _, avg_version_bbox = get_average_bounding_boxes(video_path, duration, version_pattern=version_pattern, sample_count=sample_count, verbose=verbose, parallel=parallel)
    return avg_version_bbox


def detect_version_id_from_image(image_path: str,
                                pattern: str, 
                                reader: easyocr.Reader = None,
                                verbose: bool = True,
                                debug_dir: str = None,
                                fixed_bbox: dict = None,
                                timestamp_filename: str = None) -> str:
    """
    Detects version ID from an image file using OCR and regex pattern matching.
    Uses the version ID bounding box to crop the relevant region first.
    
    Args:
        image_path: Path to the image file
        pattern: Regex pattern to match against detected text
        reader: EasyOCR reader instance (will create new one if None)
        verbose: Print detailed progress information
        debug_dir: Directory to save debug images (optional)
        fixed_bbox: Pre-calculated bounding box for version ID region (optional)
        timestamp_filename: Timestamp string for debug file naming (optional)
        
    Returns:
        Detected version ID string, or None if not found
    """
    if not os.path.exists(image_path):
        return None
    
    # Load image
    img = Image.open(image_path)
    width, height = img.size
    
    # Determine which image to process
    if fixed_bbox:
        # Use the provided average version bbox to crop
        crop_left = int(fixed_bbox['x'] * width)
        crop_top = int(fixed_bbox['y'] * height) 
        crop_right = int((fixed_bbox['x'] + fixed_bbox['width']) * width)
        crop_bottom = int((fixed_bbox['y'] + fixed_bbox['height']) * height)
        
        # Ensure coordinates are within image bounds
        crop_left = max(0, min(crop_left, width))
        crop_top = max(0, min(crop_top, height))
        crop_right = max(crop_left, min(crop_right, width))
        crop_bottom = max(crop_top, min(crop_bottom, height))
        
        target_img = img.crop((crop_left, crop_top, crop_right, crop_bottom))
        region_name = "version_bbox"
        
        if verbose:
            print(f"Using version ID bounding box: ({crop_left}, {crop_top}, {crop_right}, {crop_bottom})")
            print(f"Crop dimensions: {crop_right - crop_left}x{crop_bottom - crop_top}")
        
        # Save cropped region if debug directory is provided
        if debug_dir:
            if timestamp_filename:
                cropped_path = os.path.join(debug_dir, f"frame_{timestamp_filename}_version_region.png")
            else:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                cropped_path = os.path.join(debug_dir, f"{base_name}_version_region.png")
            target_img.save(cropped_path)
            if verbose:
                print(f"Saved version region to: {cropped_path}")
    else:
        # Fall back to full image if no bbox provided
        target_img = img
        region_name = "full_image"
        if verbose:
            print("No version bbox provided, using full image for version detection")
    
    # Perform OCR on the target region
    if verbose:
        print(f"Performing OCR on {region_name} for version detection...")
        tw, th = target_img.size
        print(f"Target OCR image size: {tw}x{th}")
    
    texts = perform_ocr(target_img, reader=reader, verbose=verbose)
    
    # Apply regex pattern matching to find version IDs
    import re
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        if verbose:
            print(f"Invalid regex pattern '{pattern}': {e}")
        return None
    
    matches = []
    if verbose:
        print(f"Searching for pattern '{pattern}' in {len(texts)} OCR results")
    
    for text, confidence in texts:
        match = regex.search(text)
        if match:
            matched_text = match.group()
            matches.append((matched_text, confidence, text))
            if verbose:
                print(f"  -> Pattern match: '{matched_text}' in '{text}' (conf: {confidence:.2f})")
        elif verbose:
            print(f"  -> No match in: '{text}' (conf: {confidence:.2f})")
    
    if not matches:
        if verbose:
            print("No version ID pattern matches found")
        return None
    
    # Return best match (highest confidence)
    best_match = max(matches, key=lambda x: x[1])
    if verbose:
        print(f"Best version match: '{best_match[0]}' (confidence: {best_match[1]:.2f})")
    
    return best_match[0]


def detect_speaker_name_from_image(image_path: str, 
                                   reader: easyocr.Reader = None, 
                                   verbose: bool = True,
                                   debug_dir: str = None,
                                   no_crop: bool = False,
                                   fixed_bbox: dict = None,
                                   timestamp_filename: str = None) -> str:
    """
    Detects speaker name from an image file using OCR and text filtering.
    Automatically detects speaker panel bounding box and processes that region.
    Uses EasyOCR with default settings.
    
    Args:
        image_path: Path to the image file
        reader: EasyOCR reader instance (will create new one if None)
        verbose: Print detailed progress information
        debug_dir: Directory to save debug images (optional)
        no_crop: Skip speaker panel detection and use entire image
        fixed_bbox: Pre-calculated bounding box for speaker panel (optional)
        timestamp_filename: Timestamp string for debug file naming (optional)
        
    Returns:
        Detected speaker name string, or None if not found
    """
    if not os.path.exists(image_path):
        return None
    
    # Load image
    img = Image.open(image_path)
    width, height = img.size
    
    # Determine which image to process
    if no_crop:
        # Skip speaker panel detection and use the entire image
        target_img = img
        region_name = "full_image"
        if verbose:
            print("Skipping speaker panel detection, using entire image for OCR")
            print(f"Crop dimensions (full image): {width}x{height}")
        
        # Save cropped/full image if debug directory is provided
        if debug_dir:
            if timestamp_filename:
                full_image_path = os.path.join(debug_dir, f"frame_{timestamp_filename}_full_image.png")
            else:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                full_image_path = os.path.join(debug_dir, f"{base_name}_full_image.png")
            target_img.save(full_image_path)
            if verbose:
                print(f"Saved full image to: {full_image_path}")
    else:
        # Automatically detect speaker panel bounding box
        bbox = fixed_bbox if fixed_bbox else get_speaker_bbox(image_path, method="cv+llm", verbose=verbose)
        
        if bbox:
            # Convert normalized coordinates to pixel coordinates
            crop_left = int(bbox['x'] * width)
            crop_top = int(bbox['y'] * height)
            crop_right = int((bbox['x'] + bbox['width']) * width)
            crop_bottom = int((bbox['y'] + bbox['height']) * height)
            
            # Ensure coordinates are within image bounds
            crop_left = max(0, min(crop_left, width))
            crop_top = max(0, min(crop_top, height))
            crop_right = max(crop_left, min(crop_right, width))
            crop_bottom = max(crop_top, min(crop_bottom, height))
            
            target_img = img.crop((crop_left, crop_top, crop_right, crop_bottom))
            region_name = "detected_bbox"
            if verbose:
                print(f"Using detected bounding box: ({crop_left}, {crop_top}, {crop_right}, {crop_bottom})")
                print(f"Crop dimensions: {crop_right - crop_left}x{crop_bottom - crop_top}")
            
            # Save cropped region if debug directory is provided
            if debug_dir:
                if timestamp_filename:
                    cropped_path = os.path.join(debug_dir, f"frame_{timestamp_filename}_speaker_region.png")
                else:
                    base_name = os.path.splitext(os.path.basename(image_path))[0]
                    cropped_path = os.path.join(debug_dir, f"{base_name}_cropped_speaker_region.png")
                target_img.save(cropped_path)
                if verbose:
                    print(f"Saved cropped speaker region to: {cropped_path}")
        else:
            # Fall back to full image if detection failed
            target_img = img
            region_name = "full"
            if verbose:
                print("Speaker panel detection failed, using full image")
                print(f"Crop dimensions (full image fallback): {width}x{height}")
            
            # Save full image if debug directory is provided and no bbox was found
            if debug_dir:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                fallback_path = os.path.join(debug_dir, f"{base_name}_full_image_fallback.png")
                target_img.save(fallback_path)
                if verbose:
                    print(f"Saved full image fallback to: {fallback_path}")
    
    # Initialize OCR if needed and perform OCR via helper
    if verbose:
        print(f"Performing OCR on {region_name} region...")
        # Report target (pre-OCR) image size
        tw, th = target_img.size
        print(f"Target OCR image size: {tw}x{th}")
    texts = perform_ocr(target_img, reader=reader, verbose=verbose)
    
    # Apply existing filtering and scoring logic but using texts list
    all_detected_names = []
    if verbose:
        print(f"Total OCR text candidates: {len(texts)}")
    for (text, confidence) in texts:
        cleaned = re.sub(r'[^\w\s]', '', text).strip()
        if len(cleaned) > 2:
            words = cleaned.split()
            is_name_like = (len(words) >= 2) or (len(words) == 1 and any(c.isupper() for c in cleaned))
            if is_name_like:
                all_detected_names.append((cleaned, confidence, region_name))
                if verbose:
                    print(f"  -> Accepted candidate: '{cleaned}' (confidence: {confidence:.2f})")
            else:
                if verbose:
                    print(f"  -> Rejected (not name-like): '{cleaned}' conf={confidence:.2f}")
        else:
            if verbose:
                print(f"  -> Rejected (too short): '{text}' conf={confidence:.2f}")
    
    # Return best result (prioritize multi-word names that look like person names)
    if all_detected_names:
        scored_names = []
        for name, confidence, region in all_detected_names:
            words = name.split()
            score = confidence
            # Favor human-style names (multi-word, capitalized)
            if len(words) >= 2:
                score += 0.3
                # Extra bonus if both words start with capital (proper name)
                if all(word and word[0].isupper() for word in words):
                    score += 0.2
            scored_names.append((name, score, confidence, region))
        
        scored_names.sort(key=lambda x: x[1], reverse=True)
        best_match = scored_names[0]
        if verbose:
            print(f"Best match from {best_match[3]} region: '{best_match[0]}' (score: {best_match[1]:.2f}, confidence: {best_match[2]:.2f})")
        return best_match[0]
    
    if verbose:
        print("No name-like text found after filtering.")
    return None


def sanitize_speaker_names(timestamps, names, similarity=0.8):
    """
    Post-processes the list of detected speaker names to group similar variations.
    Groups similar names (e.g., 'ason Greenblum' and 'Jason Greenblum') and
    replaces each with the most frequent (or longest) version in its group.
    
    Args:
        timestamps: List of timestamp strings (used for grouping context)
        names: List of detected speaker names to sanitize
        similarity: Similarity threshold for grouping names (0.0-1.0, default: 0.8)
        
    Returns:
        List of sanitized speaker names with consistent spellings
    """
    groups = []
    used = set()
    for i, name in enumerate(names):
        if not name or name in used:
            continue
        group = [name]
        used.add(name)
        for j in range(i+1, len(names)):
            other = names[j]
            if other and other not in used:
                if difflib.SequenceMatcher(None, name.lower(), other.lower()).ratio() >= similarity:
                    group.append(other)
                    used.add(other)
        groups.append(group)
    canonical = {}
    for group in groups:
        count = Counter(group)
        most_common = count.most_common(1)[0][0]
        canonical_name = max([most_common] + group, key=len)
        for n in group:
            canonical[n] = canonical_name
    sanitized = [canonical.get(name, name) if name else "" for name in names]
    return sanitized


# Thread-local storage for EasyOCR readers (one per thread)
_thread_local = threading.local()

def _get_thread_reader():
    """Get or initialize the EasyOCR reader for this thread."""
    if not hasattr(_thread_local, 'reader'):
        import logging
        logging.getLogger('easyocr').setLevel(logging.WARNING)  # Suppress verbose output
        # Use GPU if available since we're using threading, not multiprocessing
        import torch
        use_gpu = torch.cuda.is_available()
        _thread_local.reader = easyocr.Reader(['en'], gpu=use_gpu, verbose=False)
    return _thread_local.reader


def process_frame_threaded(args):
    """
    Process a single frame in threaded execution.
    This function is designed to be called by ThreadPoolExecutor.
    
    Args:
        args: Tuple containing (frame_path, timestamp, version_pattern, fixed_bbox, fixed_version_bbox, no_crop, verbose)
        
    Returns:
        Tuple of (timestamp, speaker_name, version_id, timestamp_str)
    """
    frame_path, timestamp, version_pattern, fixed_bbox, fixed_version_bbox, no_crop, verbose = args
    
    # Get the thread's EasyOCR reader (initialized once per thread)
    reader = _get_thread_reader()
    
    # Format timestamp for results
    hours = int(timestamp // 3600)
    minutes = int((timestamp % 3600) // 60)
    seconds = int(timestamp % 60)
    timestamp_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    if not os.path.exists(frame_path):
        return timestamp, "", "", timestamp_str
    
    try:
        # Detect speaker name
        name = detect_speaker_name_from_image(
            frame_path,
            reader=reader,
            verbose=False,  # Disable verbose in parallel to avoid output chaos
            debug_dir=None,  # No debug in parallel mode
            no_crop=no_crop,
            fixed_bbox=fixed_bbox,
            timestamp_filename=None,
        )
        
        # Detect version ID if pattern is provided
        version_id = None
        if version_pattern:
            version_id = detect_version_id_from_image(
                frame_path,
                version_pattern,
                reader=reader,
                verbose=False,  # Disable verbose in parallel to avoid output chaos
                debug_dir=None,  # No debug in parallel mode
                fixed_bbox=fixed_version_bbox,
                timestamp_filename=None,
            )
        
        return timestamp, name if name else "", version_id if version_id else "", timestamp_str
        
    except Exception as e:
        if verbose:
            print(f"Error processing frame at {timestamp:.2f}s: {e}")
        return timestamp, "", "", timestamp_str


def process_video(video_path: str, interval: float, output_csv: str, 
                 max_duration: float = None, batch_size: int = 20, verbose: bool = False, debug: bool = False, no_crop: bool = False,
                 version_pattern: str = None, start_time: float = 0.0, parallel: bool = False) -> bool:
    """
    Process a video file, extracting frames at intervals and detecting speaker names and optionally version IDs.
    Uses EasyOCR with default settings.
    
    Args:
        video_path: Path to the video file
        interval: Time interval between frame extractions (seconds)
        output_csv: Path to output CSV file
        max_duration: Maximum duration to process (seconds, optional)
        batch_size: Number of frames to process in each batch
        verbose: Print detailed progress information
        debug: Save debug images for troubleshooting
        no_crop: Skip speaker panel detection and process full images
        version_pattern: Regex pattern for version ID detection (optional)
        start_time: Start processing from this time offset in seconds (default: 0.0)
        parallel: Use multiprocessing for parallel frame processing (default: False)
        
    Returns:
        True if successful, False otherwise
    """
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at '{video_path}'")
        return False
    
    # Get video duration
    duration = get_video_duration(video_path)
    if duration is None:
        return False

    # Apply start time offset
    effective_duration = duration - start_time
    if effective_duration <= 0:
        print(f"Start time {start_time}s is beyond video duration {duration}s")
        return False
    
    # Apply max duration limit to effective duration
    if max_duration is not None:
        effective_duration = min(effective_duration, max_duration)
    
    if verbose:
        print(f"Video duration: {duration:.2f}s")
        print(f"Processing from {start_time:.2f}s to {start_time + effective_duration:.2f}s")
        print(f"Effective processing duration: {effective_duration:.2f}s")
        print(f"Frame interval: {interval:.2f}s")
        if parallel:
            print(f"Parallel processing enabled with {multiprocessing.cpu_count()} CPU cores")
    
    # Sample and average bounding boxes before frame processing
    fixed_bbox = None
    fixed_version_bbox = None
    if not no_crop or version_pattern:
        # Only extract sample frames if we need either speaker bbox detection or version bbox detection
        # Note: We sample from the entire video duration, not just the processing range
        video_duration = get_video_duration(video_path)
        avg_speaker_bbox, avg_version_bbox = get_average_bounding_boxes(
            video_path, 
            video_duration, 
            version_pattern=version_pattern if version_pattern else None, 
            sample_count=4, 
            verbose=verbose,
            parallel=parallel  # Pass through parallel processing flag for bbox detection
            # Note: Intentionally not passing start_time here - we want to sample the entire video
        )
        
        if not no_crop:
            fixed_bbox = avg_speaker_bbox
        
        if version_pattern:
            fixed_version_bbox = avg_version_bbox
    
    # Initialize OCR reader once (reuse for all frames) if not using parallel processing
    reader = None
    if not parallel:
        import torch
        use_gpu = torch.cuda.is_available()
        reader = easyocr.Reader(['en'], gpu=use_gpu)
        if verbose:
            print("CUDA available:", torch.cuda.is_available())
            print("CUDA device count:", torch.cuda.device_count())
            if torch.cuda.is_available():
                print("Current device:", torch.cuda.current_device())
                print("Device name:", torch.cuda.get_device_name(torch.cuda.current_device()))
    
    # Calculate all timestamps that need to be processed
    all_timestamps = []
    current_time = start_time  # Start from the specified offset
    max_time = start_time + effective_duration
    while current_time < max_time:
        all_timestamps.append(current_time)
        current_time += interval
    
    if verbose:
        print(f"Will process {len(all_timestamps)} frames in batches of {batch_size}")
    
    # Create temporary directory for extracted frames
    shm_base = '/dev/shm'
    use_shm = os.path.exists(shm_base) and os.access(shm_base, os.W_OK)
    if verbose:
        if use_shm:
            print(f"Using shared memory for temp frames: {shm_base}")
        else:
            print("/dev/shm not available or not writable, using disk for temp frames.")
    if debug:
        mode_suffix = "full_images" if no_crop else "cropped_regions"
        debug_dir = f"debug_{mode_suffix}_{os.path.basename(video_path).split('.')[0]}"
        os.makedirs(debug_dir, exist_ok=True)
        if no_crop:
            print(f"Debug mode: Full images will be saved in '{debug_dir}' directory")
        else:
            print(f"Debug mode: Cropped speaker regions will be saved in '{debug_dir}' directory")
        # Still need a temp dir for the full frames during processing
        if use_shm:
            temp_dir = os.path.join(shm_base, f"note_assistant_frames_{os.getpid()}")
            os.makedirs(temp_dir, exist_ok=True)
        else:
            temp_dir_context = tempfile.TemporaryDirectory()
            temp_dir = temp_dir_context.name
    else:
        debug_dir = None
        if use_shm:
            temp_dir = os.path.join(shm_base, f"note_assistant_frames_{os.getpid()}")
            os.makedirs(temp_dir, exist_ok=True)
        else:
            temp_dir_context = tempfile.TemporaryDirectory()
            temp_dir = temp_dir_context.name
    
    try:
        results = []
        version_results = []
        timestamps = []
        frame_counter = 0
        
        # Process frames in batches
        for batch_start in range(0, len(all_timestamps), batch_size):
            batch_end = min(batch_start + batch_size, len(all_timestamps))
            batch_timestamps = all_timestamps[batch_start:batch_end]
            
            if verbose:
                print(f"Processing batch {batch_start//batch_size + 1}/{(len(all_timestamps) + batch_size - 1)//batch_size} "
                      f"({len(batch_timestamps)} frames)...")
            
            # Extract frames for this batch
            extracted_frames = extract_frames_batch(video_path, batch_timestamps, temp_dir, 
                                                   frame_start_number=frame_counter, verbose=verbose)
            frame_counter += len(batch_timestamps)
            
            if parallel and not debug:
                # Use parallel processing with threading (avoids multiprocessing CUDA issues)
                if verbose:
                    print(f"Processing {len(batch_timestamps)} frames in parallel...")
                
                # Prepare arguments for parallel processing
                parallel_args = []
                for timestamp in batch_timestamps:
                    frame_path = extracted_frames.get(timestamp)
                    if frame_path and os.path.exists(frame_path):
                        parallel_args.append((
                            frame_path, timestamp, version_pattern,
                            fixed_bbox, fixed_version_bbox, no_crop, False
                        ))
                
                # Process frames in parallel using threading (not multiprocessing)
                max_workers = min(8, multiprocessing.cpu_count())  # Can use more threads than processes
                if verbose:
                    print(f"Using {max_workers} threaded workers for parallel processing")
                
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    parallel_results = list(executor.map(process_frame_threaded, parallel_args))
                
                # Collect results
                for timestamp in batch_timestamps:
                    # Find result for this timestamp
                    frame_result = None
                    for result in parallel_results:
                        if result[0] == timestamp:
                            frame_result = result
                            break
                    
                    if frame_result:
                        _, name, version_id, timestamp_str = frame_result
                        results.append(name)
                        version_results.append(version_id)
                        timestamps.append(timestamp_str)
                        
                        if verbose and (name or version_id):
                            output_parts = []
                            if name:
                                output_parts.append(f"Speaker: {name}")
                            if version_id:
                                output_parts.append(f"Version: {version_id}")
                            print(f"  -> {timestamp_str} Detected: {', '.join(output_parts)}")
                    else:
                        # Frame not processed
                        hours = int(timestamp // 3600)
                        minutes = int((timestamp % 3600) // 60)
                        seconds = int(timestamp % 60)
                        timestamp_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                        
                        results.append("")
                        version_results.append("")
                        timestamps.append(timestamp_str)
                        if verbose:
                            print(f"  -> Failed to process frame at {timestamp:.2f}s")
            else:
                # Use sequential processing (existing logic)
                for timestamp in batch_timestamps:
                    if verbose:
                        progress = (batch_start + (timestamp - batch_timestamps[0]) / interval) / len(all_timestamps) * 100
                        print(f"Processing frame at {timestamp:.2f}s ({progress:.1f}%)...")
                    frame_path = extracted_frames.get(timestamp)
                    if frame_path and os.path.exists(frame_path):
                        # Format timestamp for file naming (HH_MM_SS)
                        hours = int(timestamp // 3600)
                        minutes = int((timestamp % 3600) // 60)
                        seconds = int(timestamp % 60)
                        timestamp_filename = f"{hours:02d}_{minutes:02d}_{seconds:02d}"
                        
                        if verbose:
                            print(f"Processing timestamp: {timestamp:.2f}s -> {hours:02d}:{minutes:02d}:{seconds:02d}")
                        
                        # Save the full extracted frame in debug mode
                        if debug_dir:
                            full_image_path = os.path.join(debug_dir, f"frame_{timestamp_filename}_full.png")
                            try:
                                Image.open(frame_path).save(full_image_path)
                                if verbose:
                                    print(f"Saved full extracted frame to: {full_image_path}")
                            except Exception as e:
                                if verbose:
                                    print(f"Failed to save full extracted frame: {e}")
                        # Detect speaker name (and save cropped region if applicable)
                        name = detect_speaker_name_from_image(
                            frame_path,
                            reader=reader,
                            verbose=verbose,
                            debug_dir=debug_dir,
                            no_crop=no_crop,
                            fixed_bbox=fixed_bbox,
                            timestamp_filename=timestamp_filename if debug_dir else None,
                        )
                        
                        # Detect version ID if pattern is provided
                        version_id = None
                        if version_pattern:
                            version_id = detect_version_id_from_image(
                                frame_path,
                                version_pattern,
                                reader=reader,
                                verbose=verbose,
                                debug_dir=debug_dir,
                                fixed_bbox=fixed_version_bbox,
                                timestamp_filename=timestamp_filename if debug_dir else None,
                            )
                        
                        # Format timestamp as HH:MM:SS
                        hours = int(timestamp // 3600)
                        minutes = int((timestamp % 3600) // 60)
                        seconds = int(timestamp % 60)
                        timestamp_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                        
                        results.append(name if name else "")
                        version_results.append(version_id if version_id else "")
                        timestamps.append(timestamp_str)
                        
                        if verbose and (name or version_id):
                            output_parts = []
                            if name:
                                output_parts.append(f"Speaker: {name}")
                            if version_id:
                                output_parts.append(f"Version: {version_id}")
                            print(f"  -> Detected: {', '.join(output_parts)}")
                    else:
                        # Frame extraction failed for this timestamp
                        hours = int(timestamp // 3600)
                        minutes = int((timestamp % 3600) // 60)
                        seconds = int(timestamp % 60)
                        timestamp_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                        
                        results.append("")
                        version_results.append("")
                        timestamps.append(timestamp_str)
                        if verbose:
                            print(f"  -> Failed to extract frame at {timestamp:.2f}s")

            # Clean up frames from this batch to free memory
            # (Only delete frames, not the temp_dir itself - we'll reuse it for next batch)
            if not debug:  # Don't delete if in debug mode
                for timestamp in batch_timestamps:
                    frame_path = extracted_frames.get(timestamp)
                    if frame_path and os.path.exists(frame_path):
                        try:
                            os.remove(frame_path)
                        except Exception as e:
                            if verbose:
                                print(f"Warning: Failed to delete frame {frame_path}: {e}")
                if verbose:
                    print(f"Cleaned up {len(batch_timestamps)} frames from batch")

        # Write results to CSV
        try:
            # Sanitize names before saving
            sanitized_results = sanitize_speaker_names(timestamps, results)
            with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                # Include version_id column if version detection was enabled
                if version_pattern:
                    writer.writerow(['timestamp', 'speaker_name', 'version_id'])
                    for ts, name, version in zip(timestamps, sanitized_results, version_results):
                        writer.writerow([ts, name, version])
                else:
                    writer.writerow(['timestamp', 'speaker_name'])
                    for ts, name in zip(timestamps, sanitized_results):
                        writer.writerow([ts, name])
            
            print(f"\nResults saved to: {output_csv}")
            print(f"Processed {len(results)} frames")
            detected_count = sum(1 for name in sanitized_results if name)
            print(f"Detected speaker names in {detected_count} frames")
            if version_pattern:
                version_detected_count = sum(1 for version in version_results if version)
                print(f"Detected version IDs in {version_detected_count} frames")
            if debug:
                mode_desc = "full images" if no_crop else "cropped speaker regions"
                print(f"Debug {mode_desc} preserved in: {debug_dir}")
            return True
        except Exception as e:
            print(f"Error writing CSV file: {e}")
            return False
    
    finally:
        # Clean up temporary directory (always cleanup since we always use temp dir for full frames)
        if 'temp_dir_context' in locals():
            temp_dir_context.cleanup()
        elif use_shm and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)


def main():
    """
    Main function to handle command-line arguments for speaker name and version ID detection.
    Supports both image files and video files with comprehensive detection options.
    """
    parser = argparse.ArgumentParser(
        description="Detect speaker names and optionally version IDs from Google Meet frames or video recordings."
    )
    parser.add_argument("input_file", help="Path to the input file (image: .png, .jpg) or video (.mp4).")
    parser.add_argument("--interval", type=float, default=5.0,
                       help="Time interval in seconds between frame extractions (for video files only, default: 5.0).")
    parser.add_argument("--duration", type=float,
                       help="Maximum duration in seconds to process (for video files only). If not specified, processes the entire video.")
    parser.add_argument("--start-time", type=float, default=0.0,
                       help="Start processing from this time offset in seconds (for video files only, default: 0.0).")
    parser.add_argument("-o", "--output", help="Output CSV file path (for video files only). If not provided, will be input filename with .csv extension.")
    parser.add_argument("--batch-size", type=int, default=20,
                       help="Number of frames to extract in each batch (default: 20). Higher values may be faster but use more memory.")
    parser.add_argument("-v", "--verbose", action="store_true",
                       help="Print verbose progress information.")
    parser.add_argument("--debug", action="store_true",
                       help="Keep temporary frame images after processing for troubleshooting.")
    parser.add_argument("--no-crop", action="store_true",
                       help="Skip speaker panel detection and process the entire image with OCR.")
    parser.add_argument("--version-pattern", type=str,
                       help="Regex pattern to detect version IDs (e.g., 'v\\d+\\.\\d+\\.\\d+' for version numbers, 'proj-\\d+' for build numbers).")
    parser.add_argument("--parallel", action="store_true",
                       help="Enable parallel processing using multiple CPU cores (faster but disables debug mode for videos).")
    args = parser.parse_args()
    
    # Check if input is a video file
    video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm']
    is_video = any(args.input_file.lower().endswith(ext) for ext in video_extensions)
    
    if is_video:
        # Process video file
        output_csv = args.output
        if not output_csv:
            # Generate output filename from input
            base_name = os.path.splitext(args.input_file)[0]
            output_csv = f"{base_name}_speakers.csv"
        
        success = process_video(
            args.input_file,
            args.interval,
            output_csv,
            max_duration=args.duration,
            batch_size=args.batch_size,
            verbose=args.verbose,
            debug=args.debug,
            no_crop=args.no_crop,
            version_pattern=args.version_pattern,
            start_time=args.start_time,
            parallel=args.parallel,
        )
        if not success:
            exit(1)
    else:
        # Process image file (original functionality)
        debug_dir = None
        if args.debug:
            # Create debug directory for single image processing
            base_name = os.path.splitext(os.path.basename(args.input_file))[0]
            mode_suffix = "full_image" if args.no_crop else "cropped_region"
            debug_dir = f"debug_{mode_suffix}_{base_name}"
            os.makedirs(debug_dir, exist_ok=True)
            if args.no_crop:
                print(f"Debug mode: Full image will be saved in '{debug_dir}' directory")
            else:
                print(f"Debug mode: Cropped speaker region will be saved in '{debug_dir}' directory")
        
        # Initialize EasyOCR reader for single image processing
        import torch
        use_gpu = torch.cuda.is_available()
        reader = easyocr.Reader(['en'], gpu=use_gpu)
        
        name = detect_speaker_name_from_image(
            args.input_file,
            reader=reader,
            verbose=True,
            debug_dir=debug_dir,
            no_crop=args.no_crop,
        )
        
        # Detect version ID if pattern is provided
        version_id = None
        if args.version_pattern:
            version_id = detect_version_id_from_image(
                args.input_file,
                args.version_pattern,
                reader=reader,
                verbose=True,
                debug_dir=debug_dir,
                fixed_bbox=None,  # No averaging for single image, will fall back to full image
            )
        
        # Display results
        results_found = []
        if name:
            results_found.append(f"Speaker name: {name}")
        if version_id:
            results_found.append(f"Version ID: {version_id}")
        
        if results_found:
            print(f"Detected: {', '.join(results_found)}")
        else:
            print("No speaker name or version ID detected.")


if __name__ == "__main__":
    main()

