# Start mongo, the backend and the frontend from the working tree, check that
# each answers and that they work together, then stop everything. Uses its
# own ports and a throwaway database so it can run next to `nix run .#dev`.

export DNA_MONGO_PORT="${DNA_MONGO_PORT:-27117}"
export DNA_API_PORT="${DNA_API_PORT:-8100}"
export DNA_FRONTEND_PORT="${DNA_FRONTEND_PORT:-5273}"

smoke_state="$(mktemp -d "${TMPDIR:-/tmp}/dna-smoke.XXXXXX")"
export DNA_STATE="$smoke_state"

# shellcheck disable=SC1091
. @stackEnv@

dna_require_ports
dna_frontend_deps

logs="$DNA_STATE/logs"
pids=()

cleanup() {
  local status=$?
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  if [ "$status" -ne 0 ]; then
    for log in "$logs"/*.log; do
      echo
      echo "==> $(basename "$log") (last 40 lines)"
      tail -n 40 "$log"
    done
    echo
    echo "Smoke test FAILED. Full logs kept in $logs"
  else
    rm -rf "$smoke_state"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

wait_for() {
  local what="$1" tries="$2"
  shift 2
  for _ in $(seq "$tries"); do
    if "$@" >/dev/null 2>&1; then
      echo "  ok    $what is up"
      return 0
    fi
    sleep 1
  done
  echo "  FAIL  $what did not come up" >&2
  return 1
}

echo "Starting services (state in $DNA_STATE)"
mongod --dbpath "$DNA_STATE/mongo" --port "$DNA_MONGO_PORT" --bind_ip 127.0.0.1 \
  >"$logs/mongo.log" 2>&1 &
pids+=($!)
wait_for mongo 60 bash -c "exec 3<>/dev/tcp/127.0.0.1/$DNA_MONGO_PORT"

(cd "$DNA_ROOT/backend" && exec uvicorn main:app --app-dir src \
  --host 127.0.0.1 --port "$DNA_API_PORT") >"$logs/api.log" 2>&1 &
pids+=($!)
wait_for api 60 curl -fsS "http://127.0.0.1:$DNA_API_PORT/health"

(cd "$DNA_ROOT/frontend" && exec npm run dev -- \
  --host 127.0.0.1 --port "$DNA_FRONTEND_PORT" --strictPort) >"$logs/frontend.log" 2>&1 &
pids+=($!)
wait_for frontend 90 curl -fsS "http://127.0.0.1:$DNA_FRONTEND_PORT/"

api="http://127.0.0.1:$DNA_API_PORT"
user="smoke@localhost"
failed=0

check() {
  local what="$1"
  shift
  if out="$("$@" 2>&1)"; then
    echo "  ok    $what${out:+ ($out)}"
  else
    echo "  FAIL  $what: $out" >&2
    failed=1
  fi
}

get() { curl -fsS "$api$1"; }

echo "Checking backend ($PRODTRACK_PROVIDER tracker, $STORAGE_PROVIDER storage)"
check "health" bash -c "curl -fsS $api/health | jq -e '.status == \"healthy\"' >/dev/null"

project_id="$(get "/projects/user/$user" | jq -er '.[0].id')" || project_id=""
check "projects for user" test -n "$project_id"

playlist_id=""
if [ -n "$project_id" ]; then
  playlist_id="$(get "/projects/$project_id/playlists" | jq -er '.[0].id')" || playlist_id=""
fi
check "playlists for project ${project_id:-?}" test -n "$playlist_id"

version_id=""
if [ -n "$playlist_id" ]; then
  version_id="$(get "/playlists/$playlist_id/versions" | jq -er '.[0].id')" || version_id=""
fi
check "versions in playlist ${playlist_id:-?}" test -n "$version_id"

if [ -n "$version_id" ]; then
  note="/playlists/$playlist_id/versions/$version_id/draft-notes/$user"
  check "draft note write (storage)" bash -c \
    "curl -fsS -X PUT -H 'Content-Type: application/json' -d '{\"content\":\"smoke\"}' $api$note | jq -e '.content == \"smoke\"' >/dev/null"
  check "draft note read back" bash -c \
    "curl -fsS $api$note | jq -e '.content == \"smoke\"' >/dev/null"
  check "draft notes for playlist" bash -c \
    "curl -fsS $api/playlists/$playlist_id/draft-notes | jq -e 'length >= 1' >/dev/null"
fi

echo "Checking frontend"
web="http://127.0.0.1:$DNA_FRONTEND_PORT"
check "index page" bash -c "curl -fsS $web/ | grep -q 'id=\"root\"'"
# Vite compiles modules on request, so this catches broken imports and
# syntax errors in the entry point without a full build.
check "app entry compiles" curl -fsS -o /dev/null "$web/src/main.tsx"
check "CORS allows the frontend origin" bash -c \
  "curl -fsS -o /dev/null -D - -H 'Origin: http://localhost:$DNA_FRONTEND_PORT' $api/health | grep -qi '^access-control-allow-origin: http://localhost:$DNA_FRONTEND_PORT'"

if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo
echo "Smoke test passed."
