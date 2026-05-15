#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright Contributors to the Dailies Notes Assistant Project.
#
# Bootstrap script for new contributors.
# Checks prerequisites, copies example configs, installs frontend dependencies,
# generates a local Vexa API key, and starts the full DNA stack.
#
# Usage:
#   ./bootstrap.sh
#
# Supported platforms: macOS, Linux

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

VEXA_ADMIN_URL="http://localhost:8056"
VEXA_ADMIN_TOKEN="your-admin-token"
VEXA_LOCAL_EMAIL="dna-local@example.com"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${BLUE}[info]${NC}  $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}    $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── helpers ────────────────────────────────────────────────────────────────────

get_compose_cmd() {
    if command -v docker-compose &>/dev/null; then
        echo "docker-compose"
    else
        echo "docker compose"
    fi
}

# Back up $dst if it already exists, then copy $src → $dst.
safe_copy() {
    local src="$1" dst="$2"
    if [[ -f "$dst" ]]; then
        local bak="${dst}.bak.$(date +%Y%m%d%H%M%S)"
        warn "$(basename "$dst") already exists — backed up to $(basename "$bak")"
        cp "$dst" "$bak"
    fi
    cp "$src" "$dst"
    ok "$(basename "$src") → $(basename "$dst")"
}

# In-place sed replacement: replace every occurrence of KEY=<anything> with KEY=VALUE.
# Uses a backup suffix then deletes it, which works on both macOS and Linux.
set_env_var() {
    local key="$1" value="$2" file="$3"
    sed -i.bak "s|${key}=.*|${key}=${value}|g" "$file"
    rm -f "${file}.bak"
}

# ── step 1: prerequisites ──────────────────────────────────────────────────────

check_prerequisites() {
    info "Checking prerequisites..."

    command -v npm &>/dev/null \
        || die "npm not found. Install Node.js v18+: https://nodejs.org/en/download"
    ok "npm $(npm --version)"

    command -v docker &>/dev/null \
        || die "Docker not found. Install Docker: https://docs.docker.com/get-docker/"
    ok "Docker $(docker --version | awk '{gsub(/,/,"",$3); print $3}')"

    docker info &>/dev/null \
        || die "Docker daemon is not running. Start Docker Desktop (or the service) and try again."
    ok "Docker daemon is running"
}

# ── step 2: copy example config files ─────────────────────────────────────────

copy_config_files() {
    info "Copying example config files..."
    safe_copy \
        "$BACKEND_DIR/example.docker-compose.local.yml" \
        "$BACKEND_DIR/docker-compose.local.yml"
    safe_copy \
        "$BACKEND_DIR/example.docker-compose.local.vexa.yml" \
        "$BACKEND_DIR/docker-compose.local.vexa.yml"
    safe_copy \
        "$FRONTEND_DIR/packages/app/.env.example" \
        "$FRONTEND_DIR/packages/app/.env"
}

# ── step 3: LLM provider setup ─────────────────────────────────────────────────

configure_llm() {
    echo ""
    echo -e "${BOLD}LLM provider setup${NC}"
    echo "  (Press Enter on any prompt to skip and fill in manually later)"
    echo ""
    echo "  1) OpenAI  (default)"
    echo "  2) Gemini"
    echo "  3) Skip"
    echo ""
    read -r -p "  Choice [1]: " llm_choice
    llm_choice="${llm_choice:-1}"
    echo ""

    case "$llm_choice" in
        2|[gG]emini)
            read -r -p "  Gemini API key: " gemini_key
            if [[ -n "$gemini_key" ]]; then
                # The example file has an OPENAI_API_KEY line; replace it with
                # the Gemini key and insert LLM_PROVIDER=gemini above it.
                python3 - "$BACKEND_DIR/docker-compose.local.yml" "$gemini_key" <<'PYEOF'
import sys

path, key = sys.argv[1], sys.argv[2]
with open(path) as f:
    lines = f.readlines()
out = []
for line in lines:
    stripped = line.lstrip()
    if stripped.startswith('- OPENAI_API_KEY='):
        indent = line[: len(line) - len(stripped)]
        out.append(f"{indent}- LLM_PROVIDER=gemini\n")
        out.append(f"{indent}- GEMINI_API_KEY={key}\n")
    else:
        out.append(line)
with open(path, 'w') as f:
    f.writelines(out)
PYEOF
                ok "Gemini API key written to backend/docker-compose.local.yml"
            else
                warn "Skipped — set GEMINI_API_KEY and LLM_PROVIDER=gemini in backend/docker-compose.local.yml"
            fi
            ;;
        3|[sS]kip)
            warn "Skipped — set your LLM API key in backend/docker-compose.local.yml"
            ;;
        *)
            read -r -p "  OpenAI API key: " openai_key
            if [[ -n "$openai_key" ]]; then
                set_env_var "OPENAI_API_KEY" "$openai_key" "$BACKEND_DIR/docker-compose.local.yml"
                ok "OpenAI API key written to backend/docker-compose.local.yml"
            else
                warn "Skipped — set OPENAI_API_KEY in backend/docker-compose.local.yml"
            fi
            ;;
    esac
}

# ── step 4: transcription service setup ───────────────────────────────────────

# Append SKIP_TRANSCRIPTION_CHECK=true to docker-compose.local.vexa.yml so
# Vexa starts even without a working transcription backend.
add_skip_transcription_check() {
    python3 - "$BACKEND_DIR/docker-compose.local.vexa.yml" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path) as f:
    lines = f.readlines()

if any('SKIP_TRANSCRIPTION_CHECK' in l for l in lines):
    sys.exit(0)

last_env_idx = -1
for i, line in enumerate(lines):
    stripped = line.lstrip()
    if stripped.startswith('- ') and '=' in stripped:
        last_env_idx = i

if last_env_idx >= 0:
    indent = lines[last_env_idx][: len(lines[last_env_idx]) - len(lines[last_env_idx].lstrip())]
    lines.insert(last_env_idx + 1, f"{indent}- SKIP_TRANSCRIPTION_CHECK=true\n")
    with open(path, 'w') as f:
        f.writelines(lines)
PYEOF
    ok "SKIP_TRANSCRIPTION_CHECK=true added to backend/docker-compose.local.vexa.yml"
}

configure_transcription() {
    echo ""
    echo -e "${BOLD}Transcription service setup${NC}"
    echo "  Vexa needs an OpenAI Whisper-compatible transcription backend."
    echo ""
    echo "  1) Remote service via vexa.ai  ${BOLD}(recommended — free tier available)${NC}"
    echo "     Get a free key at: https://staging.vexa.ai/dashboard/transcription"
    echo ""
    echo "  2) Self-hosted transcription service"
    echo "     Requires Docker (GPU recommended). Setup guide:"
    echo "     https://github.com/Vexa-ai/vexa/tree/main/services/transcription-service"
    echo ""
    echo "  3) Skip for now  (transcription will be disabled at startup)"
    echo "     You can enable it later by editing backend/docker-compose.local.vexa.yml"
    echo ""
    read -r -p "  Choice [1]: " trans_choice
    trans_choice="${trans_choice:-1}"
    echo ""

    case "$trans_choice" in
        2|[sS]elf*)
            echo "  Self-hosted setup steps:"
            echo "    1. git clone https://github.com/Vexa-ai/vexa.git"
            echo "    2. cd vexa/services/transcription-service"
            echo "    3. cp .env.example .env"
            echo "    4. Set API_TOKEN in .env and choose GPU or CPU (DEVICE=cpu for no GPU)"
            echo "    5. docker compose up -d   (or docker compose -f docker-compose.cpu.yml up -d)"
            echo "    6. Wait for: 'Model loaded successfully' in the logs"
            echo ""
            local default_url="http://localhost:8083/v1/audio/transcriptions"
            read -r -p "  Transcription service URL [${default_url}]: " trans_url
            trans_url="${trans_url:-$default_url}"
            read -r -p "  Transcription service API token (your API_TOKEN value, or Enter to skip): " trans_token
            if [[ -n "$trans_token" ]]; then
                set_env_var "TRANSCRIBER_URL" "$trans_url" "$BACKEND_DIR/docker-compose.local.vexa.yml"
                set_env_var "TRANSCRIBER_API_KEY" "$trans_token" "$BACKEND_DIR/docker-compose.local.vexa.yml"
                ok "Self-hosted transcription configured in backend/docker-compose.local.vexa.yml"
            else
                warn "Skipped — set TRANSCRIBER_URL and TRANSCRIBER_API_KEY in backend/docker-compose.local.vexa.yml"
                add_skip_transcription_check
            fi
            ;;
        3|[sS]kip)
            warn "Transcription skipped — Vexa will start without it"
            add_skip_transcription_check
            ;;
        *)
            echo "  Get your free key at: https://staging.vexa.ai/dashboard/transcription"
            echo ""
            read -r -p "  Transcription API key (press Enter to skip): " trans_key
            if [[ -n "$trans_key" ]]; then
                set_env_var "TRANSCRIBER_API_KEY" "$trans_key" "$BACKEND_DIR/docker-compose.local.vexa.yml"
                ok "Remote transcription API key written to backend/docker-compose.local.vexa.yml"
            else
                warn "Skipped — set TRANSCRIBER_API_KEY in backend/docker-compose.local.vexa.yml"
                warn "Or add SKIP_TRANSCRIPTION_CHECK=true to disable the startup check"
            fi
            ;;
    esac
}

# ── step 5: frontend dependencies ─────────────────────────────────────────────

install_frontend() {
    info "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
    ok "Frontend dependencies installed"
}

# ── step 6: Vexa API key generation ───────────────────────────────────────────

bootstrap_vexa() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    info "Starting Vexa services to generate a local API key..."
    (
        cd "$BACKEND_DIR"
        $compose_cmd \
            -f docker-compose.vexa.yml \
            -f docker-compose.local.vexa.yml \
            up -d vexa vexa-db
    )

    info "Waiting for Vexa admin API on :8057 (may take ~30 s on first pull)..."
    local retries=40
    until curl -sf \
            -H "X-Admin-API-Key: ${VEXA_ADMIN_TOKEN}" \
            "${VEXA_ADMIN_URL}/admin/users" \
            -o /dev/null 2>/dev/null; do
        retries=$((retries - 1))
        [[ $retries -le 0 ]] \
            && die "Vexa admin API did not become ready in time. Run: docker logs vexa"
        sleep 3
    done
    ok "Vexa admin API is ready"

    info "Creating local Vexa user (${VEXA_LOCAL_EMAIL})..."

    local tmpfile
    tmpfile="$(mktemp)"

    local http_code
    http_code="$(curl -s -o "$tmpfile" -w "%{http_code}" \
        -X POST \
        -H "X-Admin-API-Key: ${VEXA_ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${VEXA_LOCAL_EMAIL}\",\"name\":\"DNA Local Dev\"}" \
        "${VEXA_ADMIN_URL}/admin/users")"
    local create_response
    create_response="$(cat "$tmpfile")"
    rm -f "$tmpfile"

    local user_id
    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
        user_id="$(echo "$create_response" \
            | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")"
        ok "Vexa user created (id: ${user_id})"
    elif [[ "$http_code" == "409" ]]; then
        warn "User already exists — fetching existing record..."
        local list_response
        list_response="$(curl -sf \
            -H "X-Admin-API-Key: ${VEXA_ADMIN_TOKEN}" \
            "${VEXA_ADMIN_URL}/admin/users")"
        user_id="$(echo "$list_response" | python3 - "$VEXA_LOCAL_EMAIL" <<'PYEOF'
import sys, json
users = json.load(sys.stdin)
email = sys.argv[1]
match = [u for u in users if u.get("email") == email]
print((match or users)[0]["id"])
PYEOF
)"
        ok "Found existing Vexa user (id: ${user_id})"
    else
        rm -f "$tmpfile"
        die "Unexpected response from Vexa admin API (HTTP ${http_code}): ${create_response}"
    fi

    info "Generating Vexa API token..."
    local token_response vexa_api_key
    token_response="$(curl -sf \
        -X POST \
        -H "X-Admin-API-Key: ${VEXA_ADMIN_TOKEN}" \
        "${VEXA_ADMIN_URL}/admin/users/${user_id}/tokens")"
    vexa_api_key="$(echo "$token_response" \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")"
    ok "Vexa API key generated"

    set_env_var "VEXA_API_KEY" "$vexa_api_key" "$BACKEND_DIR/docker-compose.local.yml"
    ok "Vexa API key written to backend/docker-compose.local.yml"
}

# ── step 7: start the full stack ───────────────────────────────────────────────

start_full_stack() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)"

    info "Starting the full DNA stack (first run builds containers — this may take a few minutes)..."
    (
        cd "$BACKEND_DIR"
        $compose_cmd \
            -f docker-compose.yml \
            -f docker-compose.vexa.yml \
            -f docker-compose.debug.yml \
            -f docker-compose.local.yml \
            -f docker-compose.local.vexa.yml \
            up --build -d
    )
    ok "All services started"
}

# ── main ───────────────────────────────────────────────────────────────────────

main() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  DNA — Bootstrap${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    check_prerequisites
    echo ""
    copy_config_files
    echo ""
    configure_llm
    configure_transcription
    install_frontend
    echo ""
    bootstrap_vexa
    echo ""
    start_full_stack

    echo ""
    echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}  Bootstrap complete!${NC}"
    echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Running services:"
    echo "    DNA API      →  http://localhost:8000"
    echo "    API Docs     →  http://localhost:8000/docs"
    echo "    Vexa Admin   →  http://localhost:3001"
    echo ""
    echo "  To start the frontend (in a new terminal):"
    echo "    cd frontend && npm run dev"
    echo "    App  →  http://localhost:5173"
    echo ""
    echo "  To follow backend logs:"
    echo "    cd backend && make logs-local"
    echo ""
    local needs_attention=false
    if grep -q 'your-openai-api-key\|GEMINI_API_KEY=\*\*\|OPENAI_API_KEY=\*\*' \
            "$BACKEND_DIR/docker-compose.local.yml" 2>/dev/null; then
        needs_attention=true
        echo -e "  ${YELLOW}Action needed:${NC} fill in your LLM API key in:"
        echo "    backend/docker-compose.local.yml"
        echo ""
    fi
    if grep -q 'TRANSCRIBER_API_KEY=\*\*' \
            "$BACKEND_DIR/docker-compose.local.vexa.yml" 2>/dev/null; then
        needs_attention=true
        echo -e "  ${YELLOW}Action needed:${NC} fill in your transcription API key in:"
        echo "    backend/docker-compose.local.vexa.yml"
        echo "  Get a free key at: https://staging.vexa.ai/dashboard/transcription"
        echo ""
    fi
    if [[ "$needs_attention" == "true" ]]; then
        echo "  After updating, restart with:  cd backend && make restart-local"
        echo ""
    fi
}

main "$@"
