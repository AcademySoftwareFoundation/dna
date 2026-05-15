#!/usr/bin/env python3
"""Print stored transcript text for each version in a DNA playlist.

Calls the running DNA API (same endpoints the app uses). Transcripts are built
from Mongo-backed segments, matching the backend's speaker: line format.

Examples:
  DNA_API_BASE=http://localhost:8000 ./scripts/playlist_transcripts.py 12345
  DNA_API_BASE=https://dna.example.com DNA_API_TOKEN="$TOKEN" \\
    ./scripts/playlist_transcripts.py 12345

Environment:
  DNA_API_BASE   Base URL with no trailing slash (default: http://localhost:8000)
  DNA_API_TOKEN  Optional Bearer token when AUTH_PROVIDER is not \"none\"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


def _request_json(
    url: str,
    token: str | None,
) -> Any:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} for {url}\n{detail}") from e
    except urllib.error.URLError as e:
        raise SystemExit(f"Request failed for {url}: {e.reason}") from e


def _segments_to_transcript(segments: list[dict[str, Any]]) -> str:
    if not segments:
        return "(no stored transcript segments for this version)"
    lines: list[str] = []
    for seg in segments:
        speaker = seg.get("speaker") or "Unknown"
        text = seg.get("text") or ""
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Show stored DNA transcripts for every version in a playlist."
    )
    parser.add_argument(
        "playlist_id",
        type=int,
        help="ShotGrid playlist id (same id used in the DNA URL and API)",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("DNA_API_BASE", "http://localhost:8000").rstrip("/"),
        help="DNA API base URL (default: env DNA_API_BASE or http://localhost:8000)",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("DNA_API_TOKEN"),
        help="Bearer token (default: env DNA_API_TOKEN)",
    )
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    playlist_id: int = args.playlist_id
    token: str | None = args.token

    versions_url = f"{base}/playlists/{playlist_id}/versions"
    versions = _request_json(versions_url, token)
    if not isinstance(versions, list):
        raise SystemExit(
            f"Unexpected response from versions endpoint: {type(versions)}"
        )

    if not versions:
        print(f"No versions returned for playlist {playlist_id}.", file=sys.stderr)
        return

    for i, ver in enumerate(versions):
        if not isinstance(ver, dict) or "id" not in ver:
            raise SystemExit(f"Unexpected version object: {ver!r}")
        version_id = ver["id"]
        label = ver.get("name") or ver.get("code") or str(version_id)
        sep = "=" * 72
        print(sep)
        print(f"Version id={version_id}  {label}")
        print(sep)

        seg_url = f"{base}/transcription/segments/{playlist_id}/{version_id}"
        segments = _request_json(seg_url, token)
        if not isinstance(segments, list):
            raise SystemExit(f"Unexpected segments response: {type(segments)}")
        print(_segments_to_transcript(segments))
        if i < len(versions) - 1:
            print()


if __name__ == "__main__":
    main()
