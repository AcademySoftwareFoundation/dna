#!/usr/bin/env bash
# Temporary manual test for POST /playlists/{playlist_id}/send-summary-email.
# Delete this file when you are done.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
PLAYLIST_ID="${PLAYLIST_ID:-}"
TO_EMAIL="${TO_EMAIL:-}"
CC_EMAIL="${CC_EMAIL:-}"
PLAYLIST_URL="${PLAYLIST_URL:-http://localhost:5173}"
# AUTH_PROVIDER=none treats a Bearer value that contains @ as the sender email.
SENDER_EMAIL="${SENDER_EMAIL:-anonymous@localhost}"

if [[ -z "${PLAYLIST_ID}" || -z "${TO_EMAIL}" ]]; then
  echo "Usage: PLAYLIST_ID=<shotgrid playlist id> TO_EMAIL=<recipient> $0" >&2
  echo "Optional: CC_EMAIL, PLAYLIST_URL, SENDER_EMAIL, API_BASE" >&2
  exit 1
fi

body="$(
  PLAYLIST_URL="${PLAYLIST_URL}" TO_EMAIL="${TO_EMAIL}" CC_EMAIL="${CC_EMAIL}" python3 - <<'PY'
import json
import os

payload = {
    "to_email": os.environ["TO_EMAIL"],
    "playlist_url": os.environ["PLAYLIST_URL"],
}
cc = os.environ.get("CC_EMAIL") or ""
if cc:
    payload["cc_email"] = cc
print(json.dumps(payload))
PY
)"

curl -sS -X POST \
  "${API_BASE}/playlists/${PLAYLIST_ID}/send-summary-email" \
  -H "Authorization: Bearer ${SENDER_EMAIL}" \
  -H "Content-Type: application/json" \
  -d "${body}"
echo
