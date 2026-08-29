#!/usr/bin/env bash
#
# Regenerate openapi/backend.json from the DNA backend.
#
# The upstream repo does not commit an OpenAPI document - the FastAPI app builds
# it at runtime - so this imports the app and serializes app.openapi() without
# starting a server or touching a database.
#
# Requires: uv (https://docs.astral.sh/uv/) and git.
#
# Environment overrides:
#   DNA_SRC        path to an existing dna checkout (skips cloning)
#   DNA_REF        branch/tag/sha to fetch          (default: main)
#   DNA_SERVER_URL base URL for the API demo panel  (default: http://localhost:8000)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/openapi/backend.json"
DNA_REF="${DNA_REF:-main}"
DNA_SERVER_URL="${DNA_SERVER_URL:-http://localhost:8000}"

command -v uv >/dev/null || {
  echo "error: uv is required (brew install uv)" >&2
  exit 1
}

if [[ -n "${DNA_SRC:-}" ]]; then
  SRC="$DNA_SRC"
  echo "==> Using existing checkout: $SRC"
else
  SRC="$(mktemp -d)/dna"
  echo "==> Cloning AcademySoftwareFoundation/dna@$DNA_REF"
  git clone --depth 1 --branch "$DNA_REF" --filter=blob:none --sparse \
    https://github.com/AcademySoftwareFoundation/dna.git "$SRC" >/dev/null 2>&1
  git -C "$SRC" sparse-checkout set backend >/dev/null 2>&1
fi

BACKEND="$SRC/backend"
[[ -f "$BACKEND/src/main.py" ]] || {
  echo "error: $BACKEND/src/main.py not found" >&2
  exit 1
}

# The backend targets Python 3.11 (see backend/Dockerfile); its source uses
# `X | Y` unions that fail to evaluate on 3.9.
echo "==> Installing backend dependencies (Python 3.11)"
# --allow-existing keeps this idempotent when reusing a DNA_SRC checkout.
uv venv --python 3.11 --allow-existing "$BACKEND/.venv-spec" >/dev/null
uv pip install --python "$BACKEND/.venv-spec/bin/python" --quiet \
  -r "$BACKEND/requirements.txt"

echo "==> Extracting OpenAPI schema"
cd "$BACKEND"
DISABLE_DOCS=false "$BACKEND/.venv-spec/bin/python" - "$OUT" "$DNA_SERVER_URL" <<'PY'
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "src"))
from main import app  # noqa: E402

out_path, server_url = sys.argv[1], sys.argv[2]
spec = app.openapi()

# FastAPI omits `servers`, which the docs theme needs to build the "Send API
# Request" base URL. Inject one rather than patching the generated MDX.
spec.setdefault("servers", [{"url": server_url, "description": "Local development"}])

with open(out_path, "w") as fh:
    json.dump(spec, fh, indent=2)
    fh.write("\n")

ops = sum(
    1
    for path in spec["paths"].values()
    for method in path
    if method in ("get", "post", "put", "patch", "delete")
)
print(
    f"    {spec['info']['title']} v{spec['info']['version']} "
    f"({spec['openapi']}): {len(spec['paths'])} paths, {ops} operations, "
    f"{len(spec.get('components', {}).get('schemas', {}))} schemas"
)
PY

echo "==> Wrote $OUT"
echo "    Next: npm run regen-api-docs"
