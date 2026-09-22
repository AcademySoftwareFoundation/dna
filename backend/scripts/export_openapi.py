#!/usr/bin/env python3
"""Export the FastAPI-generated OpenAPI spec to a versioned file.

The live spec is always served at `/openapi.json`; this writes the same
document to disk so the API surface is reviewable in diffs and consumable by
codegen/linting tools without a running server.

Usage:
  python3 scripts/export_openapi.py            # write backend/docs/openapi.json
  python3 scripts/export_openapi.py --check     # fail if the file is stale
  python3 scripts/export_openapi.py -o /tmp/spec.json

Run from the backend directory (or anywhere: `src` is added to sys.path).
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = BACKEND_DIR / "docs" / "openapi.json"

sys.path.insert(0, str(BACKEND_DIR / "src"))


def generate_spec() -> dict:
    """Build the OpenAPI document from the FastAPI app."""
    from main import app

    # app.openapi() caches into app.openapi_schema; clear it so repeated calls
    # in the same process (e.g. tests) always reflect the current routes.
    app.openapi_schema = None
    return app.openapi()


def serialize(spec: dict) -> str:
    """Render the spec deterministically so diffs stay meaningful."""
    return json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Where to write the spec (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not write; exit non-zero if the file is missing or stale.",
    )
    args = parser.parse_args()

    rendered = serialize(generate_spec())

    if args.check:
        if not args.output.exists():
            print(f"ERROR: {args.output} does not exist.", file=sys.stderr)
            print("Run: make openapi", file=sys.stderr)
            return 1
        if args.output.read_text(encoding="utf-8") != rendered:
            print(f"ERROR: {args.output} is out of date.", file=sys.stderr)
            print("Run: make openapi", file=sys.stderr)
            return 1
        print(f"{args.output} is up to date.")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    spec = json.loads(rendered)
    print(
        f"Wrote {args.output} "
        f"({len(spec['paths'])} paths, "
        f"{len(spec.get('components', {}).get('schemas', {}))} schemas)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
