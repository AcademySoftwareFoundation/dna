#!/usr/bin/env python3
"""Inject transcript segments directly into DNA storage for one or more playlist versions.

Reads a JSON file structured as:

    {
      "<playlist_id>": {
        "<version_id>": {
          "segments": [
            {
              "segment_id": "unique-id",
              "text": "Hello world.",
              "speaker": "Alice",
              "absolute_start_time": "2026-06-22T10:00:00.000Z",
              "absolute_end_time": "2026-06-22T10:00:02.000Z",
              "language": "en",
              "start_time": 0.0,
              "end_time": 2.0
            }
          ]
        }
      }
    }

Required segment fields: segment_id, text, absolute_start_time, absolute_end_time.
Optional: speaker, language, start_time, end_time, completed, vexa_updated_at.

The script must be run from within the backend environment (e.g. inside the API container
or with the backend virtualenv active) so that the dna package is importable.

Examples:
  # Inside the running api container:
  docker exec -it dna-api python /scripts/inject_transcript.py /scripts/inject_transcript_sample.json

  # Via docker-compose run:
  docker-compose run --rm api python /app/scripts/inject_transcript.py /app/scripts/inject_transcript_sample.json

  # With a local venv:
  MONGODB_URL=mongodb://localhost:27017 python scripts/inject_transcript.py scripts/inject_transcript_sample.json

Environment:
  MONGODB_URL  MongoDB connection string (default: mongodb://localhost:27017)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

# Ensure the backend src directory is on the path when running outside of the
# installed package (e.g. directly from the repo root).
_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_SRC = _REPO_ROOT / "backend" / "src"
if _BACKEND_SRC.is_dir() and str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

from dna.models.stored_segment import StoredSegmentCreate
from dna.storage_providers.storage_provider_base import get_storage_provider


def _validate_segment(seg: Any, idx: int) -> None:
    required = ("segment_id", "text", "absolute_start_time", "absolute_end_time")
    if not isinstance(seg, dict):
        raise SystemExit(f"Segment at index {idx} is not a JSON object: {seg!r}")
    for field in required:
        if not seg.get(field):
            raise SystemExit(
                f"Segment at index {idx} is missing required field '{field}'"
            )


async def _inject(payload: dict, dry_run: bool) -> None:
    storage = get_storage_provider()

    total_inserted = 0
    total_updated = 0
    total_segments = 0

    for playlist_str, versions in payload.items():
        try:
            playlist_id = int(playlist_str)
        except ValueError:
            raise SystemExit(f"Playlist key must be an integer, got: {playlist_str!r}")

        if not isinstance(versions, dict):
            raise SystemExit(
                f"Value for playlist {playlist_id} must be an object keyed by version_id."
            )

        for version_str, version_data in versions.items():
            try:
                version_id = int(version_str)
            except ValueError:
                raise SystemExit(
                    f"Version key under playlist {playlist_id} must be an integer, "
                    f"got: {version_str!r}"
                )

            if not isinstance(version_data, dict):
                raise SystemExit(
                    f"Value for playlist {playlist_id} / version {version_id} "
                    "must be a JSON object."
                )

            segments = version_data.get("segments")
            if not isinstance(segments, list):
                raise SystemExit(
                    f"playlist {playlist_id} / version {version_id}: "
                    "'segments' must be a list."
                )

            for i, seg in enumerate(segments):
                _validate_segment(seg, i)

            print(
                f"Playlist {playlist_id} / Version {version_id}: "
                f"{len(segments)} segment(s)",
                end="",
            )

            if dry_run:
                print("  [dry-run, skipped]")
                total_segments += len(segments)
                continue

            inserted = 0
            updated = 0
            for seg in segments:
                seg_create = StoredSegmentCreate(**seg)
                _, is_new = await storage.upsert_segment(
                    playlist_id=playlist_id,
                    version_id=version_id,
                    segment_id=seg_create.segment_id,
                    data=seg_create,
                )
                if is_new:
                    inserted += 1
                else:
                    updated += 1

            print(f"  → inserted={inserted}, updated={updated}")
            total_inserted += inserted
            total_updated += updated
            total_segments += len(segments)

    if dry_run:
        print(f"\nDry run complete. {total_segments} segment(s) validated.")
    else:
        print(
            f"\nDone. {total_segments} segment(s) processed: "
            f"{total_inserted} inserted, {total_updated} updated."
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inject transcript segments directly into DNA storage."
    )
    parser.add_argument(
        "json_file",
        help="Path to the JSON file containing transcript data to inject",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate the JSON without writing to the database",
    )
    args = parser.parse_args()

    try:
        with open(args.json_file, encoding="utf-8") as f:
            payload: dict = json.load(f)
    except FileNotFoundError:
        raise SystemExit(f"File not found: {args.json_file}")
    except json.JSONDecodeError as e:
        raise SystemExit(f"Invalid JSON in {args.json_file}: {e}")

    if not isinstance(payload, dict):
        raise SystemExit("Top-level JSON must be an object keyed by playlist_id.")

    asyncio.run(_inject(payload, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
