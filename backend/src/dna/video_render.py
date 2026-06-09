"""Thin ffmpeg/ffprobe wrappers for cutting recording clips and thumbnails.

V1 renders clips synchronously during the upload request (no async worker).
ffmpeg/ffprobe must be on PATH; they ship in the api Docker image. These are
kept as small, individually-patchable functions so the upload endpoint's tests
can stub them out without invoking real ffmpeg.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

FFMPEG_BIN = os.getenv("FFMPEG_BINARY", "ffmpeg")
FFPROBE_BIN = os.getenv("FFPROBE_BINARY", "ffprobe")


class FfmpegError(RuntimeError):
    """Raised when an ffmpeg/ffprobe invocation fails."""


def ffmpeg_available() -> bool:
    """True if both ffmpeg and ffprobe are resolvable on PATH."""
    return (
        shutil.which(FFMPEG_BIN) is not None and shutil.which(FFPROBE_BIN) is not None
    )


def probe_duration_seconds(source: str | Path) -> float:
    """Return the media duration in seconds via ffprobe."""
    proc = subprocess.run(
        [
            FFPROBE_BIN,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            str(source),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise FfmpegError(f"ffprobe failed for {source}: {proc.stderr.strip()}")
    try:
        return float(json.loads(proc.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise FfmpegError(f"Could not read duration for {source}: {exc}") from exc


def render_clip(
    source: str | Path,
    dest: str | Path,
    *,
    start_seconds: float,
    end_seconds: float,
) -> None:
    """Cut [start, end) of ``source`` into ``dest`` (re-encoded for clean seeks).

    Output-side seeking (-ss/-to after -i) is used so the cut lands on the exact
    requested span rather than the nearest prior keyframe.
    """
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.0, end_seconds - start_seconds)
    proc = subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            str(source),
            "-ss",
            f"{start_seconds:.3f}",
            "-t",
            f"{duration:.3f}",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(dest_path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise FfmpegError(
            f"ffmpeg clip render failed for {dest}: {proc.stderr.strip()}"
        )


def extract_thumbnail(
    source: str | Path,
    dest: str | Path,
    *,
    at_seconds: float = 0.0,
) -> None:
    """Write a single JPG frame from ``source`` at ``at_seconds`` into ``dest``."""
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-ss",
            f"{at_seconds:.3f}",
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(dest_path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise FfmpegError(
            f"ffmpeg thumbnail extract failed for {dest}: {proc.stderr.strip()}"
        )
