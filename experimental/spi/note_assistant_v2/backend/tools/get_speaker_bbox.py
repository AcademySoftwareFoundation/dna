#!/usr/bin/env python3
"""
Speaker Panel Bounding Box Detection Tool
========================================

This tool detects and extracts the bounding box of the "speaker panel" in video conference screenshots or video frames, where the layout is known:
- The shared screen is on the LEFT.
- The speaker panel (with camera or avatar and name label) is on the RIGHT edge.

Features:
---------
1. **CV-based Detection (default, fast, robust):**
   - Scans the image from right to left, column by column, looking for the topmost and bottommost non-background pixels in each column.
   - Detects a sharp jump in these positions to find the transition from the speaker panel to the shared screen.
   - The bounding box is set to the rightmost region before this jump, ensuring the panel and name label are included.
   - Works even if the panel is dark/muted, as long as some nonzero pixels (e.g., name label) are present.

2. **LLM-based Detection (optional, requires API key):**
   - Uses Gemini 2.5 Pro to localize the speaker panel, with a strict prompt enforcing right-side constraints.
   - Useful for ambiguous or unusual layouts.

3. **Video Support:**
   - Can extract a frame from an MP4 at a specified timestamp for analysis.

4. **CLI Options:**
   - Choose detection method: `cv`, `llm`, or `cv+llm` (try CV, fallback to LLM).
   - Optionally save the cropped speaker panel image.
   - Debug mode for visualizing detection results.

Usage:
------
    python get_speaker_bbox.py <input_image_or_video> [--method cv|llm|cv+llm] [--save-image] [--time <seconds>] [--debug]

Returns:
--------
- Prints a JSON object with normalized bounding box, confidence, method, and metadata.
- Optionally saves the cropped speaker panel image.

Requirements:
-------------
- Python 3, OpenCV, numpy, Pillow, dotenv, (optionally) google-generativeai

"""

import os
import sys
import json
import argparse
import base64
import logging

import cv2
import numpy as np
from scipy import ndimage
from scipy.signal import find_peaks
from PIL import Image
from dotenv import load_dotenv
import google.generativeai as genai

logging.getLogger("grpc").setLevel(logging.ERROR)

# ------------------------------------------
# CONFIG
# ------------------------------------------
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")


# =========================================================
# Image utilities
# =========================================================

def load_image_base64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def trim_vertical_black_bars(panel_img):
    """
    Removes top/bottom black rows based on activity threshold.
    Works much better for dark muted camera tiles.
    """
    gray = cv2.cvtColor(panel_img, cv2.COLOR_BGR2GRAY)

    # fraction of non-black pixels per row
    row_activity = np.mean(gray > 25, axis=1)

    # require some horizontal activity
    active = row_activity > 0.15  # lowered threshold from earlier 0.20

    if not np.any(active):
        return panel_img, 0, panel_img.shape[0]

    idx = np.where(active)[0]
    start, end = idx[0], idx[-1]

    # padding
    pad = max(2, int(0.015 * (end - start)))
    start = max(0, start - pad)
    end = min(panel_img.shape[0], end + pad)

    return panel_img[start:end, :], start, end


# =========================================================
# Video frame extraction
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
# CV Detection Helper Functions
# =========================================================

def _compute_column_variance(gray):
    """Compute variance per column - content regions have higher variance."""
    return np.var(gray.astype(np.float64), axis=0)


def _compute_row_variance(gray):
    """Compute variance per row - used to find top/bottom content boundaries."""
    return np.var(gray.astype(np.float64), axis=1)


def _compute_texture_measure(gray, block_size=16):
    """
    Compute local standard deviation as a texture measure.
    Content regions (webcam, avatar) have higher texture than uniform backgrounds.
    """
    gray_f = gray.astype(np.float64)
    local_mean = ndimage.uniform_filter(gray_f, size=block_size)
    local_sqr_mean = ndimage.uniform_filter(gray_f**2, size=block_size)
    local_std = np.sqrt(np.maximum(local_sqr_mean - local_mean**2, 0))
    return local_std


def _compute_column_edge_density(gray, kernel_size=3):
    """
    Compute vertical edge density per column.
    Panel boundaries often have strong vertical edges.
    """
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=kernel_size)
    return np.sum(np.abs(sobel_x), axis=0)


def _normalize_signal(x):
    """Normalize a 1D signal to [0, 1] range."""
    x = x.astype(np.float64)
    min_val, max_val = np.min(x), np.max(x)
    if max_val > min_val:
        return (x - min_val) / (max_val - min_val)
    return np.zeros_like(x)


def _find_content_rows(row_signal, min_run_length=20):
    """
    Find contiguous runs of rows with significant content.
    
    Returns list of (start, end) tuples for content regions.
    """
    if np.max(row_signal) == 0:
        return []
    
    normalized = row_signal / np.max(row_signal)
    threshold = np.mean(normalized) + 0.3 * np.std(normalized)
    threshold = max(0.1, min(0.5, threshold))
    
    above = normalized > threshold
    regions = []
    in_region = False
    start = 0
    
    for i, val in enumerate(above):
        if val and not in_region:
            start = i
            in_region = True
        elif not val and in_region:
            if i - start >= min_run_length:
                regions.append((start, i))
            in_region = False
    
    if in_region and len(above) - start >= min_run_length:
        regions.append((start, len(above)))
    
    return regions


def _refine_bounds_with_edges(gray, y_top, y_bottom, x_left, x_right, debug=False):
    """
    Refine bounding box using Canny edge detection.
    Speaker panels often have sharp rectangular borders.
    """
    H, W = gray.shape
    edges = cv2.Canny(gray, 30, 100)
    search_margin = int(H * 0.15)
    
    # Refine top boundary
    top_start = max(0, y_top - search_margin)
    top_end = min(H, y_top + search_margin)
    
    if top_end > top_start and x_right > x_left:
        top_edges = edges[top_start:top_end, x_left:x_right]
        row_sums = np.sum(top_edges, axis=1)
        if len(row_sums) > 0 and np.max(row_sums) > 0:
            peaks, _ = find_peaks(row_sums, height=np.max(row_sums) * 0.3)
            if len(peaks) > 0:
                candidate = top_start + peaks[0]
                if abs(candidate - y_top) < search_margin:
                    y_top = candidate
    
    # Refine bottom boundary
    bottom_start = max(0, y_bottom - search_margin)
    bottom_end = min(H, y_bottom + search_margin)
    
    if bottom_end > bottom_start and x_right > x_left:
        bottom_edges = edges[bottom_start:bottom_end, x_left:x_right]
        row_sums = np.sum(bottom_edges, axis=1)
        if len(row_sums) > 0 and np.max(row_sums) > 0:
            peaks, _ = find_peaks(row_sums, height=np.max(row_sums) * 0.3)
            if len(peaks) > 0:
                candidate = bottom_start + peaks[-1]
                if abs(candidate - y_bottom) < search_margin:
                    y_bottom = candidate
    
    # Refine left boundary
    left_margin = int(W * 0.05)
    left_start = max(0, x_left - left_margin)
    left_end = min(W, x_left + left_margin)
    
    if left_end > left_start and y_bottom > y_top:
        left_edges = edges[y_top:y_bottom, left_start:left_end]
        col_sums = np.sum(left_edges, axis=0)
        if len(col_sums) > 0 and np.max(col_sums) > 0:
            peaks, _ = find_peaks(col_sums, height=np.max(col_sums) * 0.3)
            if len(peaks) > 0:
                candidate = left_start + peaks[0]
                if abs(candidate - x_left) < left_margin:
                    x_left = candidate
    
    return y_top, y_bottom, x_left, x_right


# =========================================================
# CV Detection
# =========================================================

def detect_speaker_bbox_cv(image_path, debug=False):
    """
    Stable speaker panel detection.

    Horizontal detection:
      - Scan right → left
      - Choose split where LEFT side suddenly shows
        large vertical span in TOP and BOTTOM thirds
        (middle third ignored)

    Vertical crop:
      - Layout-based middle band of right edge
    """

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")

    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # --------------------------------------------------
    # Parameters
    # --------------------------------------------------
    min_panel_x = int(0.60 * W)
    min_panel_width = int(0.12 * W)
    max_panel_width = int(0.45 * W)

    top_band_end = H // 3
    bottom_band_start = (2 * H) // 3

    # --------------------------------------------------
    # Preprocessing
    # --------------------------------------------------
    mask = (gray > 25).astype(np.uint8)

    columns = []  # (x, top, bottom)

    # --------------------------------------------------
    # Phase 1: scan right → left
    # --------------------------------------------------
    for x in range(W - 1, min_panel_x - 1, -1):
        col = mask[:, x]
        nonzero = np.flatnonzero(col)
        if len(nonzero) == 0:
            continue
        columns.append((x, nonzero[0], nonzero[-1]))

    if not columns:
        return {"found_speaker_panel": False}

    columns.reverse()  # left → right

    # --------------------------------------------------
    # Helper: span in top+bottom bands only
    # --------------------------------------------------
    def band_span(cols):
        tops = []
        bottoms = []

        for _, top, bottom in cols:
            if top < top_band_end:
                tops.append(top)
            if bottom > bottom_band_start:
                bottoms.append(bottom)

        if not tops or not bottoms:
            return 0

        return max(bottoms) - min(tops)

    # --------------------------------------------------
    # Phase 2: choose split
    # --------------------------------------------------
    best_score = -1
    best_split = 0

    for i in range(1, len(columns)):
        left = columns[:i]
        right = columns[i:]
        if not left or not right:
            continue

        left_span = band_span(left)
        right_span = band_span(right)

        score = (left_span + 1) / (right_span + 1)

        if score > best_score:
            best_score = score
            best_split = i

    panel_cols = columns[best_split:]

    x_left = min(c[0] for c in panel_cols)
    x_right = max(c[0] for c in panel_cols)

    # --------------------------------------------------
    # Layout-defined vertical crop (middle band)
    # --------------------------------------------------
    y_top = int(H * 0.33)
    y_bottom = int(H * 0.66)

    # --------------------------------------------------
    # Enforce width constraints
    # --------------------------------------------------
    width = x_right - x_left + 1

    if width < min_panel_width:
        x_left = max(min_panel_x, x_right - min_panel_width)

    if width > max_panel_width:
        x_left = x_right - max_panel_width

    abs_x = x_left
    abs_y = y_top
    abs_w = x_right - x_left + 1
    abs_h = y_bottom - y_top

    bbox_norm = {
        "x": abs_x / W,
        "y": abs_y / H,
        "width": abs_w / W,
        "height": abs_h / H,
    }

    if debug:
        dbg = img.copy()
        cv2.rectangle(
            dbg,
            (abs_x, abs_y),
            (abs_x + abs_w, abs_y + abs_h),
            (0, 255, 0),
            3,
        )
        cv2.imwrite("debug_simple_detection.png", dbg)

    return {
        "found_speaker_panel": True,
        "bounding_box": bbox_norm,
        "confidence": 0.85,
        "method": "cv-horizontal-split-topbottom-only",
        "image_width": W,
        "image_height": H,
    }

# =========================================================
# LLM Detection
# =========================================================

LLM_PROMPT = """
You are performing *precise visual localization* of a speaker panel in a video conference screenshot.

STRICT LAYOUT RULES:
- The shared screen occupies the LEFT portion of the image.
- The speaker panel ALWAYS occupies the RIGHT portion.
- Even if the camera is muted and the panel appears mostly black, the panel is still fully on the right.
- The bounding box MUST NOT include any part of the shared screen.
- The bounding box MUST include the area where you'd expect the name label.

POSITION CONSTRAINTS:
- The left edge of the bounding box must be GREATER than 0.60 * image_width.
- Width must be LESS than 0.40 * image_width.
- The box must extend to the right edge or near it.

IF VISUALLY AMBIGUOUS:
- Choose the most reasonable right-side rectangle.
- Never guess a region on the left side.

RETURN ONLY THIS JSON FORMAT:

{
  "found_speaker_panel": true | false,
  "bounding_box": {
    "x": <integer>,
    "y": <integer>,
    "width": <integer>,
    "height": <integer>
  },
  "confidence": <0.0-1.0>
}
"""


def detect_speaker_bbox_llm(image_path):
    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    genai.configure(api_key=API_KEY)

    with Image.open(image_path) as im:
        W, H = im.size

    image_b64 = load_image_base64(image_path)

    model = genai.GenerativeModel("gemini-2.5-pro")

    response = model.generate_content(
        contents=[
            {
                "role": "user",
                "parts": [
                    {"text": LLM_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": image_b64,
                        }
                    }
                ]
            }
        ]
    )

    try:
        data = json.loads(response.text)
    except Exception:
        raise ValueError("LLM returned non-JSON or malformed JSON.")

    if not data.get("found_speaker_panel"):
        return data

    bbox = data["bounding_box"]
    bbox_norm = {
        "x": bbox["x"] / W,
        "y": bbox["y"] / H,
        "width": bbox["width"] / W,
        "height": bbox["height"] / H,
    }

    return {
        "found_speaker_panel": True,
        "bounding_box": bbox_norm,
        "confidence": data.get("confidence", 0.0),
        "method": "llm",
        "image_width": W,
        "image_height": H,
    }


# =========================================================
# Crop Helper
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
    parser = argparse.ArgumentParser("Detect speaker panel in screenshots or MP4 videos.")
    parser.add_argument("input_path")
    parser.add_argument("--time", type=float)
    parser.add_argument("--save-image", action="store_true")
    parser.add_argument("--method", choices=["cv", "llm", "cv+llm"], default="cv")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    input_path = args.input_path

    # Extract frame if MP4
    if input_path.lower().endswith(".mp4"):
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
    result = None

    if args.method in ["cv", "cv+llm"]:
        try:
            result = detect_speaker_bbox_cv(image_path, debug=args.debug)
            print("CV detection succeeded.", file=sys.stderr)
        except Exception as e:
            print(f"CV detection failed: {e}", file=sys.stderr)

    if result is None and args.method in ["llm", "cv+llm"]:
        try:
            result = detect_speaker_bbox_llm(image_path)
            print("LLM detection succeeded.", file=sys.stderr)
        except Exception as e:
            print(f"LLM detection failed: {e}", file=sys.stderr)
            sys.exit(1)

    if not result or not result.get("found_speaker_panel"):
        print("No speaker panel detected", file=sys.stderr)
        sys.exit(1)

    # Save crop if requested
    if args.save_image:
        out_path = os.path.splitext(image_path)[0] + "_speaker_crop.png"
        crop_and_save(
            image_path,
            result["bounding_box"],
            result["image_width"],
            result["image_height"],
            out_path,
        )
        result["cropped_image_path"] = out_path

    # Add metadata
    result["input_file"] = input_path
    result["processed_image"] = image_path

    print(json.dumps(result, indent=2))

    # Cleanup if temporary frame
    if input_path.lower().endswith(".mp4") and image_path != input_path:
        try:
            os.remove(image_path)
        except:
            pass


if __name__ == "__main__":
    main()