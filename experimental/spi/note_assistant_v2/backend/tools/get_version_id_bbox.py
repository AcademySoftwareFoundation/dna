#!/usr/bin/env python3
"""
Version ID Bounding Box Detection Tool
=====================================

This tool detects and extracts the bounding box of text matching a regex pattern in video frames or images.
It uses EasyOCR to scan the entire image and locate text that matches the specified pattern.

Features:
---------
1. **OCR-based Text Detection:**
   - Uses EasyOCR to detect all text in the image with bounding boxes
   - Filters detected text using provided regex pattern
   - Returns bounding box of matching text

2. **Video Support:**
   - Can extract a frame from an MP4 at a specified timestamp for analysis
   - Same video handling infrastructure as speaker detection tools

3. **CLI Options:**
   - Specify regex pattern for text matching
   - Optionally save the cropped text region image
   - Debug mode for visualizing detection results
   - Support for confidence thresholds

Usage:
------
    python get_version_id_bbox.py <input_image_or_video> --pattern "regex_pattern" [--save-image] [--time <seconds>] [--debug]

Examples:
---------
    # Find version numbers like "v1.2.3" in an image
    python get_version_id_bbox.py frame.png --pattern "v\d+\.\d+\.\d+"
    
    # Find build numbers in a video at 30 seconds
    python get_version_id_bbox.py meeting.mp4 --pattern "build_\d+" --time 30
    
    # Find any text starting with "Version" with debug output
    python get_version_id_bbox.py frame.png --pattern "Version.*" --debug --save-image

Returns:
--------
- Prints a JSON object with normalized bounding box, matched text, confidence, and metadata
- Optionally saves the cropped text region image

Requirements:
-------------
- Python 3, OpenCV, numpy, Pillow, EasyOCR

"""

import os
import sys
import json
import argparse
import re
import logging

import cv2
import numpy as np
from PIL import Image
import easyocr

logging.getLogger("grpc").setLevel(logging.ERROR)

# =========================================================
# Configuration Constants
# =========================================================

# Default padding in pixels to add around detected bounding boxes
DEFAULT_PADDING_PX = 300


# =========================================================
# Video frame extraction (reused from get_speaker_bbox.py)
# =========================================================

def extract_frame_from_video(video_path, time_seconds=None):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps

    if time_seconds is None:
        time_seconds = duration / 2
    elif time_seconds < 0 or time_seconds > duration:
        raise ValueError(f"Time {time_seconds}s is out of video range (0-{duration:.2f}s)")

    target_frame = int(time_seconds * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        raise ValueError(f"Could not extract frame at {time_seconds}s")

    out_path = f"{os.path.splitext(video_path)[0]}_frame_{time_seconds:.2f}s.png"
    cv2.imwrite(out_path, frame)
    return out_path


# =========================================================
# OCR-based Text Detection
# =========================================================

def detect_version_id_bbox_ocr(image_path, pattern, min_confidence=0.5, debug=False, padding=DEFAULT_PADDING_PX):
    """
    Detect text matching a regex pattern and return its bounding box.
    
    Args:
        image_path: Path to the image file
        pattern: Regex pattern to match against detected text
        min_confidence: Minimum OCR confidence threshold (0.0-1.0)
        debug: If True, save debug visualization
        padding: Padding in pixels to add around detected bounding box
        
    Returns:
        Dictionary with detection results or None if not found
    """
    
    # Load image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")

    H, W = img.shape[:2]
    
    # Initialize EasyOCR reader with GPU if available
    try:
        import torch
        use_gpu = torch.cuda.is_available()
        if debug:
            print(f"CUDA available: {torch.cuda.is_available()}", file=sys.stderr)
            if use_gpu:
                print(f"Using GPU for EasyOCR", file=sys.stderr)
            else:
                print(f"Using CPU for EasyOCR", file=sys.stderr)
        reader = easyocr.Reader(['en'], gpu=use_gpu)
    except Exception as e:
        raise RuntimeError(f"Failed to initialize EasyOCR: {e}")
    
    # Perform OCR on entire image
    try:
        ocr_results = reader.readtext(image_path)
    except Exception as e:
        raise RuntimeError(f"OCR failed: {e}")
    
    # Compile regex pattern
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern '{pattern}': {e}")
    
    # Find matching text
    matches = []
    if debug:
        print(f"\nOCR Results Analysis:", file=sys.stderr)
        print(f"Pattern: '{pattern}'", file=sys.stderr)
        print(f"Min confidence threshold: {min_confidence}", file=sys.stderr)
        print(f"Total OCR detections: {len(ocr_results)}", file=sys.stderr)
        print("-" * 60, file=sys.stderr)
    
    for i, (bbox_coords, text, confidence) in enumerate(ocr_results):
        if debug:
            print(f"[{i+1:2d}] Text: '{text}' | Confidence: {confidence:.3f}", file=sys.stderr)
        
        # Check confidence threshold
        if confidence < min_confidence:
            if debug:
                print(f"     ❌ REJECTED: Low confidence ({confidence:.3f} < {min_confidence})", file=sys.stderr)
            continue
        
        # Check if text matches pattern
        pattern_match = regex.search(text)
        if pattern_match:
            if debug:
                print(f"     ✅ ACCEPTED: Pattern match found: '{pattern_match.group()}'", file=sys.stderr)
            
            # Convert EasyOCR bbox format to our format
            # EasyOCR returns [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            x_coords = [coord[0] for coord in bbox_coords]
            y_coords = [coord[1] for coord in bbox_coords]
            
            x_min = int(min(x_coords))
            y_min = int(min(y_coords))
            x_max = int(max(x_coords))
            y_max = int(max(y_coords))
            
            # Calculate width and height
            width = x_max - x_min
            height = y_max - y_min
            
            matches.append({
                'text': text,
                'confidence': confidence,
                'matched_part': pattern_match.group(),
                'bbox_pixel': {
                    'x': x_min,
                    'y': y_min,
                    'width': width,
                    'height': height
                },
                'bbox_normalized': {
                    'x': x_min / W,
                    'y': y_min / H,
                    'width': width / W,
                    'height': height / H
                }
            })
            if debug:
                print(f"     📍 BBox: ({x_min}, {y_min}) to ({x_max}, {y_max}) | Size: {width}x{height}", file=sys.stderr)
        else:
            if debug:
                print(f"     ❌ REJECTED: No pattern match", file=sys.stderr)
        
        if debug:
            print(file=sys.stderr)  # Empty line for readability
    
    if not matches:
        return {
            "found_version_text": False,
            "pattern": pattern,
            "image_width": W,
            "image_height": H
        }
    
    # Select best match (prefer longer, more descriptive matches over short numbers)
    if debug:
        print(f"\nFinal Selection Process:", file=sys.stderr)
        print(f"Total accepted matches: {len(matches)}", file=sys.stderr)
        print("-" * 40, file=sys.stderr)
    
    # Score matches: confidence + bonus for length and specificity
    scored_matches = []
    for match in matches:
        matched_part = match['matched_part']
        confidence = match['confidence']
        
        # Base score is confidence
        score = confidence
        
        # Bonus for longer matches (project identifiers vs just numbers)
        if len(matched_part) >= 6:  # e.g., "proj-9498" is 9 chars
            score += 0.1
        
        # Bonus for containing letters (not just numbers)
        if any(c.isalpha() for c in matched_part):
            score += 0.05
        
        # Penalty for matches that are just numbers
        if matched_part.isdigit():
            score -= 0.5
        
        scored_matches.append((match, score))
    
    # Sort by score (highest first)
    scored_matches.sort(key=lambda x: x[1], reverse=True)
    
    if debug:
        for i, (match, score) in enumerate(scored_matches):
            marker = "🏆 SELECTED" if i == 0 else "   "
            print(f"{marker} [{i+1}] '{match['matched_part']}' | Confidence: {match['confidence']:.3f} | Score: {score:.3f} | Full text: '{match['text']}'", file=sys.stderr)
        print("-" * 40, file=sys.stderr)
    
    best_match = scored_matches[0][0]
    
    # Apply padding to the bounding box
    bbox_pixel = best_match['bbox_pixel']
    padded_bbox_pixel = {
        'x': max(0, bbox_pixel['x'] - padding),
        'y': max(0, bbox_pixel['y'] - padding),
        'width': min(W - max(0, bbox_pixel['x'] - padding), bbox_pixel['width'] + 2 * padding),
        'height': min(H - max(0, bbox_pixel['y'] - padding), bbox_pixel['height'] + 2 * padding)
    }
    
    # Convert padded pixel coordinates to normalized
    padded_bbox_norm = {
        'x': padded_bbox_pixel['x'] / W,
        'y': padded_bbox_pixel['y'] / H,
        'width': padded_bbox_pixel['width'] / W,
        'height': padded_bbox_pixel['height'] / H
    }
    
    if debug:
        print(f"Original BBox: {bbox_pixel}", file=sys.stderr)
        print(f"Padded BBox (+{padding}px): {padded_bbox_pixel}", file=sys.stderr)
    
    # Debug visualization
    if debug:
        debug_img = img.copy()
        bbox = best_match['bbox_pixel']
        cv2.rectangle(
            debug_img,
            (bbox['x'], bbox['y']),
            (bbox['x'] + bbox['width'], bbox['y'] + bbox['height']),
            (0, 255, 0),
            3
        )
        
        # Add text label
        cv2.putText(
            debug_img,
            best_match['text'],
            (bbox['x'], bbox['y'] - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 255, 0),
            2
        )
        
        debug_path = os.path.splitext(image_path)[0] + "_version_debug.png"
        cv2.imwrite(debug_path, debug_img)
        print(f"Debug visualization saved to: {debug_path}", file=sys.stderr)
    
    return {
        "found_version_text": True,
        "bounding_box": padded_bbox_norm,
        "matched_text": best_match['text'],
        "pattern": pattern,
        "confidence": best_match['confidence'],
        "method": "ocr",
        "image_width": W,
        "image_height": H,
        "all_matches": len(matches),
        "padding_applied": padding
    }


# =========================================================
# Crop Helper (reused from get_speaker_bbox.py)
# =========================================================

def crop_and_save(image_path, bbox_norm, W, H, output):
    x = int(bbox_norm["x"] * W)
    y = int(bbox_norm["y"] * H)
    w = int(bbox_norm["width"] * W)
    h = int(bbox_norm["height"] * H)

    with Image.open(image_path) as im:
        crop = im.crop((x, y, x + w, y + h))
        crop.save(output)


# =========================================================
# Main CLI
# =========================================================

def main():
    parser = argparse.ArgumentParser(
        description="Detect text matching a regex pattern in screenshots or MP4 videos.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s frame.png --pattern "v\\d+\\.\\d+\\.\\d+"
  %(prog)s meeting.mp4 --pattern "build_\\d+" --time 30
  %(prog)s image.png --pattern "Version.*" --debug --save-image
        """
    )
    parser.add_argument("input_path", help="Path to input image or video file")
    parser.add_argument("--pattern", required=True, 
                       help="Regex pattern to match against detected text")
    parser.add_argument("--time", type=float,
                       help="Time in seconds to extract frame from video (default: middle)")
    parser.add_argument("--save-image", action="store_true",
                       help="Save cropped image of detected text")
    parser.add_argument("--debug", action="store_true",
                       help="Save debug visualization with bounding boxes")
    parser.add_argument("--min-confidence", type=float, default=0.5,
                       help="Minimum OCR confidence threshold (default: 0.5)")
    parser.add_argument("--padding", type=int, default=DEFAULT_PADDING_PX,
                       help=f"Padding in pixels to add around detected bounding box (default: {DEFAULT_PADDING_PX})")
    args = parser.parse_args()

    input_path = args.input_path

    # Extract frame if MP4
    if input_path.lower().endswith((".mp4", ".avi", ".mov", ".mkv", ".webm")):
        if args.time is not None and args.time < 0:
            print("Error: time must be >=0", file=sys.stderr)
            sys.exit(1)
        try:
            frame_path = extract_frame_from_video(input_path, args.time)
            print(f"Extracted frame: {frame_path}", file=sys.stderr)
            image_path = frame_path
        except Exception as e:
            print(f"Frame extraction failed: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        image_path = input_path

    # Detection
    try:
        result = detect_version_id_bbox_ocr(
            image_path, 
            args.pattern, 
            min_confidence=args.min_confidence,
            debug=args.debug,
            padding=args.padding
        )
        print("OCR detection completed.", file=sys.stderr)
    except Exception as e:
        print(f"Detection failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not result.get("found_version_text"):
        print(f"No text matching pattern '{args.pattern}' detected", file=sys.stderr)
        sys.exit(1)

    # Save crop if requested
    if args.save_image:
        out_path = os.path.splitext(image_path)[0] + "_version_crop.png"
        crop_and_save(
            image_path,
            result["bounding_box"],
            result["image_width"],
            result["image_height"],
            out_path,
        )
        result["cropped_image_path"] = out_path
        print(f"Cropped text saved to: {out_path}", file=sys.stderr)

    # Add metadata
    result["input_file"] = input_path
    result["processed_image"] = image_path

    print(json.dumps(result, indent=2))

    # Cleanup temporary frame if extracted from video
    if input_path.lower().endswith((".mp4", ".avi", ".mov", ".mkv", ".webm")) and image_path != input_path:
        try:
            os.remove(image_path)
        except:
            pass


if __name__ == "__main__":
    main()
