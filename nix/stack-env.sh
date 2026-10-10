# Sourced by the dev and smoke apps. Resolves where the checkout and its
# runtime state live, and gives every service setting a default that an
# exported variable (or $DNA_STATE/env) overrides.

DNA_ROOT="${DNA_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
if [ -z "$DNA_ROOT" ] || [ ! -f "$DNA_ROOT/backend/pyproject.toml" ]; then
  echo "error: run this from inside the dna checkout (or set DNA_ROOT)" >&2
  exit 1
fi
export DNA_ROOT

# Database files, logs and the optional env file. Gitignored.
export DNA_STATE="${DNA_STATE:-$DNA_ROOT/.dna-dev}"
mkdir -p "$DNA_STATE/mongo" "$DNA_STATE/logs"

# Per-checkout overrides, e.g. PRODTRACK_PROVIDER=ftrack and its credentials.
if [ -f "$DNA_STATE/env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DNA_STATE/env"
  set +a
fi

export DNA_MONGO_PORT="${DNA_MONGO_PORT:-27017}"
export DNA_API_PORT="${DNA_API_PORT:-8000}"
# The backend's default CORS list allows http://localhost:5173 only.
export DNA_FRONTEND_PORT="${DNA_FRONTEND_PORT:-5173}"
if [ "$DNA_FRONTEND_PORT" != 5173 ] && [ -z "${CORS_ALLOWED_ORIGINS:-}" ]; then
  export CORS_ALLOWED_ORIGINS="http://localhost:$DNA_FRONTEND_PORT"
fi

# Backend: the read-only mock tracker and no auth, so a fresh checkout runs
# with no credentials. Same defaults as example.docker-compose.local.yml.
export PYTHONUNBUFFERED=1
export PYTHONPATH="$DNA_ROOT/backend/src"
export PRODTRACK_PROVIDER="${PRODTRACK_PROVIDER:-mock}"
export AUTH_PROVIDER="${AUTH_PROVIDER:-none}"
export STORAGE_PROVIDER="${STORAGE_PROVIDER:-mongodb}"
export MONGODB_URL="${MONGODB_URL:-mongodb://127.0.0.1:$DNA_MONGO_PORT}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:$DNA_API_PORT}"
export ATTACHMENT_STORE_DIR="${ATTACHMENT_STORE_DIR:-$DNA_STATE/attachments}"
export FTRACK_ID_MAP_PATH="${FTRACK_ID_MAP_PATH:-$DNA_STATE/ftrack_id_map.db}"

# Frontend: Vite lets process env override packages/app/.env.
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:$DNA_API_PORT}"
export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:$DNA_API_PORT/ws}"
export VITE_AUTH_PROVIDER="${VITE_AUTH_PROVIDER:-$AUTH_PROVIDER}"

# Fail early with a clear message instead of a service crash-looping on a
# port that the Docker stack (or a previous run) still holds.
dna_port_free() {
  ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

dna_require_ports() {
  local name port busy=0
  for name in DNA_MONGO_PORT DNA_API_PORT DNA_FRONTEND_PORT; do
    port="${!name}"
    if ! dna_port_free "$port"; then
      echo "error: port $port ($name) is already in use; stop what holds it or export $name" >&2
      busy=1
    fi
  done
  return "$busy"
}

# npm ci only when the lock has changed since the last install.
dna_frontend_deps() {
  local marker="$DNA_ROOT/frontend/node_modules/.package-lock.json"
  if [ ! -f "$marker" ] || [ "$DNA_ROOT/frontend/package-lock.json" -nt "$marker" ]; then
    echo "Installing frontend dependencies (npm ci)..."
    (cd "$DNA_ROOT/frontend" && npm ci --no-audit --no-fund)
  fi
}
