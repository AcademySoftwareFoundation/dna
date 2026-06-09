"""Real-ffmpeg tests for the clip/thumbnail render helpers.

These actually shell out to ffmpeg/ffprobe and are skipped when those binaries
aren't on PATH (e.g. an api image built before ffmpeg was added). A tiny
synthetic clip is generated with ffmpeg's lavfi testsrc so no fixture file is
needed.
"""

import subprocess

import pytest

from dna.video_render import (
    FFMPEG_BIN,
    FfmpegError,
    extract_thumbnail,
    ffmpeg_available,
    probe_duration_seconds,
    render_clip,
)

pytestmark = pytest.mark.skipif(
    not ffmpeg_available(), reason="ffmpeg/ffprobe not installed"
)


@pytest.fixture
def source_video(tmp_path):
    """A 3-second 160x120 synthetic test video."""
    path = tmp_path / "source.mp4"
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=3:size=160x120:rate=10",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        capture_output=True,
        check=True,
    )
    return path


def test_probe_duration_reads_length(source_video):
    duration = probe_duration_seconds(source_video)
    assert duration == pytest.approx(3.0, abs=0.3)


def test_render_clip_produces_shorter_clip(source_video, tmp_path):
    dest = tmp_path / "clip" / "out.mp4"
    render_clip(source_video, dest, start_seconds=1.0, end_seconds=2.0)

    assert dest.exists() and dest.stat().st_size > 0
    assert probe_duration_seconds(dest) == pytest.approx(1.0, abs=0.3)


def test_extract_thumbnail_writes_nonempty_jpg(source_video, tmp_path):
    dest = tmp_path / "thumb" / "thumb.jpg"
    extract_thumbnail(source_video, dest, at_seconds=0.0)

    assert dest.exists() and dest.stat().st_size > 0


def test_probe_raises_on_missing_file(tmp_path):
    with pytest.raises(FfmpegError):
        probe_duration_seconds(tmp_path / "does-not-exist.mp4")
