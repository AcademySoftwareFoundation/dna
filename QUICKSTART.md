# DNA Quickstart Guide

This guide covers two ways to get the DNA application stack running locally: the automated bootstrap script (recommended) and step-by-step manual setup.

---

## Automated Bootstrap (Recommended)

The `bootstrap.sh` script handles all setup steps for you. Run it from the repo root:

```bash
./bootstrap.sh
```

It will:

1. Check that Docker and Node.js v18+ are installed and that the Docker daemon is running
2. Copy example config files into their working locations
3. Prompt you to choose an LLM provider (OpenAI or Gemini) and enter your API key
4. Prompt you to configure the transcription service (remote via vexa.ai, self-hosted, or skip)
5. Install frontend npm dependencies
6. Start the Vexa services, create a local dev user, and generate a Vexa API key automatically
7. Start the full DNA stack with Docker Compose

After the script finishes, start the frontend in a new terminal:

```bash
cd frontend && npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Manual Setup

Follow these steps if you prefer to set up each component yourself, or if you need to understand what the bootstrap script does under the hood.

### Prerequisites

- **Docker** and **Docker Compose** installed and the Docker daemon running
- **Node.js** (v18+) and **npm** for the frontend
- **Python 3.11+** (optional, for running tests outside Docker)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd dna
```

### 2. Copy Example Config Files

Copy all three example config files into their working locations. The bootstrap script backs up any existing files before overwriting; do the same if you are re-running setup.

```bash
cd backend
cp example.docker-compose.local.yml docker-compose.local.yml
cp example.docker-compose.local.vexa.yml docker-compose.local.vexa.yml

cd ../frontend
cp packages/app/.env.example packages/app/.env
```

### 3. Configure the LLM Provider

Edit `backend/docker-compose.local.yml` and set your LLM credentials. The bootstrap script writes these values for you when you provide a key interactively.

**OpenAI (default):** requires `OPENAI_API_KEY`; optional `OPENAI_MODEL` and `OPENAI_TIMEOUT`

```yaml
services:
  api:
    environment:
      - LLM_PROVIDER=openai
      - OPENAI_API_KEY=your-openai-api-key
      - OPENAI_MODEL=gpt-4o-mini
```

**Gemini:** requires `GEMINI_API_KEY`; also set `LLM_PROVIDER=gemini`

```yaml
services:
  api:
    environment:
      - LLM_PROVIDER=gemini
      - GEMINI_API_KEY=your-gemini-api-key
      - GEMINI_MODEL=gemini-2.5-flash
      - GEMINI_URL=https://generativelanguage.googleapis.com/v1beta/openai/
```

### 4. Configure the Transcription Service

Vexa requires an OpenAI Whisper-compatible transcription backend. Edit `backend/docker-compose.local.vexa.yml` for whichever option you choose.

**Option 1 — Remote via vexa.ai (recommended, free tier available):**

Get a free key at https://staging.vexa.ai/dashboard/transcription, then set:

```yaml
services:
  vexa:
    environment:
      - TRANSCRIBER_API_KEY=your-transcription-api-key
      - TRANSCRIBER_URL=https://transcription.vexa.ai/v1/audio/transcriptions
```

**Option 2 — Self-hosted transcription service:**

```bash
git clone https://github.com/Vexa-ai/vexa.git
cd vexa/services/transcription-service
cp .env.example .env
# Edit .env: set API_TOKEN and optionally DEVICE=cpu for no GPU
docker compose up -d
# Wait for "Model loaded successfully" in: docker logs <container>
```

Then in `backend/docker-compose.local.vexa.yml`:

```yaml
services:
  vexa:
    environment:
      - TRANSCRIBER_URL=http://localhost:8083/v1/audio/transcriptions
      - TRANSCRIBER_API_KEY=your-api-token-value
```

**Option 3 — Skip transcription for now:**

Add `SKIP_TRANSCRIPTION_CHECK=true` to `backend/docker-compose.local.vexa.yml` so Vexa starts without a working transcription backend:

```yaml
services:
  vexa:
    environment:
      - SKIP_TRANSCRIPTION_CHECK=true
```

You can enable transcription later by removing that line and adding your `TRANSCRIBER_API_KEY`, then restarting with `cd backend && make restart-local`.

### 5. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 6. Generate a Vexa API Key

The bootstrap script automates this via the Vexa admin API. To do it manually:

**a. Start only the Vexa services:**

```bash
cd backend
docker compose -f docker-compose.vexa.yml -f docker-compose.local.vexa.yml up -d vexa vexa-db
```

**b. Wait for the Vexa admin API to become ready** (may take ~30 s on first pull):

```bash
until curl -sf -H "X-Admin-API-Key: your-admin-token" \
    http://localhost:8056/admin/users -o /dev/null; do
  echo "Waiting for Vexa..."; sleep 3
done
```

**c. Create a local dev user:**

```bash
curl -s -X POST \
  -H "X-Admin-API-Key: your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"email":"dna-local@example.com","name":"DNA Local Dev"}' \
  http://localhost:8056/admin/users
```

Note the `id` field from the response.

**d. Generate an API token for that user:**

```bash
curl -s -X POST \
  -H "X-Admin-API-Key: your-admin-token" \
  http://localhost:8056/admin/users/<user-id>/tokens
```

Note the `token` field from the response.

**e. Write the token into your local compose file:**

In `backend/docker-compose.local.yml`, set:

```yaml
- VEXA_API_KEY=<token-from-previous-step>
```

Alternatively, you can retrieve a key from the Vexa Dashboard UI at http://localhost:3001 once the stack is running.

### 7. Start the Full Stack

```bash
cd backend
make start-local
```

This runs:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.vexa.yml \
  -f docker-compose.debug.yml \
  -f docker-compose.local.yml \
  -f docker-compose.local.vexa.yml \
  up --build -d
```

Services started:

- **MongoDB** — database (port 27017)
- **DNA API** — FastAPI backend (port 8000)
- **Vexa** — transcription service (port 8056)
- **Vexa Dashboard** — admin UI (port 3001)

### 8. Start the Frontend

In a new terminal:

```bash
cd frontend
npm run dev
```

The React app will be available at `http://localhost:5173`.

### 9. Verify Everything is Running

| Service | URL | Description |
|---------|-----|-------------|
| DNA API | http://localhost:8000 | Backend API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Vexa Dashboard | http://localhost:3001 | Transcription admin |
| Frontend | http://localhost:5173 | React application |

---

## Environment Variables Reference

### Backend API (`api` service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHOTGRID_URL` | Yes\* | - | ShotGrid site URL (required when using ShotGrid) |
| `SHOTGRID_API_KEY` | Yes\* | - | ShotGrid API key (required when using ShotGrid) |
| `SHOTGRID_SCRIPT_NAME` | Yes\* | - | ShotGrid script name (required when using ShotGrid) |
| `PRODTRACK_PROVIDER` | No | `shotgrid` | `shotgrid` or `mock`; set to `mock` to use the read-only mock DB without ShotGrid |
| `MONGODB_URL` | No | `mongodb://mongo:27017` | MongoDB connection string |
| `STORAGE_PROVIDER` | No | `mongodb` | Storage provider type |
| `VEXA_API_KEY` | Yes | - | API key for Vexa transcription service |
| `VEXA_API_URL` | No | `http://vexa:8056` | Vexa REST API URL |
| `LLM_PROVIDER` | No | `openai` | LLM provider (`openai` or `gemini`) |
| `OPENAI_API_KEY` | Yes\* | - | OpenAI API key when `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use when `LLM_PROVIDER=openai` |
| `OPENAI_TIMEOUT` | No | `30.0` | Request timeout in seconds when `LLM_PROVIDER=openai` |
| `GEMINI_API_KEY` | Yes\* | - | Gemini API key when `LLM_PROVIDER=gemini` |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model to use when `LLM_PROVIDER=gemini` |
| `GEMINI_TIMEOUT` | No | `30.0` | Request timeout in seconds when `LLM_PROVIDER=gemini` |
| `GEMINI_URL` | No | `https://generativelanguage.googleapis.com/v1beta/openai/` | Override the Gemini OpenAI-compatible base URL |
| `PYTHONUNBUFFERED` | No | `1` | Disable Python output buffering |

### Vexa Service (`vexa` service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgresql://vexa:vexa@vexa-db:5432/vexa` | PostgreSQL connection for Vexa |
| `ADMIN_API_TOKEN` | No | `your-admin-token` | Admin token for Vexa management |
| `TRANSCRIBER_URL` | No | (vexa.ai) | Transcription API endpoint |
| `TRANSCRIBER_API_KEY` | Yes | - | API key for transcription service |
| `SKIP_TRANSCRIPTION_CHECK` | No | - | Set to `true` to start Vexa without a working transcription backend |

---

## Common Commands

### Backend Commands

```bash
cd backend

# Start the stack
make start-local

# Stop the stack
make stop-local

# Restart everything
make restart-local

# View logs
make logs-local

# Run tests
make test

# Run tests with coverage
make test-cov

# Format Python code
make format-python

# Open a shell in the API container
make shell

# Seed mock DB from a ShotGrid project (requires SHOTGRID_* credentials)
SHOTGRID_API_KEY='your-key' make seed-mock-db
```

### Frontend Commands

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Format code
npm run format

# Type check
npm run typecheck
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                DNA Stack                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐         ┌─────────────────┐         ┌───────────────┐ │
│   │    Frontend     │◀──────▶│    DNA API      │───────▶│   ShotGrid    │ │
│   │  (React/Vite)   │   WS    │   (FastAPI)     │         │   (external)  │ │
│   │  :5173          │         │   :8000         │         │               │ │
│   └─────────────────┘         └────────┬────────┘         └───────────────┘ │
│                                        │                                    │
│          ┌─────────────────────────────┴─────────────────────────────┐      │
│          │                                                           │      │
│          ▼                                                           ▼      │
│   ┌─────────────────┐                                       ┌─────────────┐ │
│   │    MongoDB      │                                       │    Vexa     │ │
│   │    :27017       │                                       │   :8056     │ │
│   └─────────────────┘                                       └─────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

The DNA API serves as the central hub:
- Provides REST API for CRUD operations
- Provides WebSocket endpoint (`/ws`) for real-time event streaming
- Manages Vexa subscriptions for transcription events
- Broadcasts segment and bot status events to connected frontend clients

---

## Mock Production Tracking Setup

When you set **`PRODTRACK_PROVIDER=mock`**, the backend uses a read-only mock provider backed by SQLite (`backend/src/dna/prodtrack_providers/mock_data/mock.db`). The app runs normally with this data so you can develop and test the UI without a ShotGrid seat.

**Production tracking (ShotGrid):** To run without a ShotGrid seat, set **`PRODTRACK_PROVIDER=mock`** in `docker-compose.local.yml`. The mock provider uses read-only SQLite with pre-seeded data. To use real ShotGrid, set `PRODTRACK_PROVIDER=shotgrid` (or leave it unset) and add `SHOTGRID_URL`, `SHOTGRID_SCRIPT_NAME`, and `SHOTGRID_API_KEY`.

### Using the mock provider

- In `docker-compose.local.yml`, set **`PRODTRACK_PROVIDER=mock`**. You do not need to set any ShotGrid variables when using the mock.
- The mock provider is used only when explicitly set; there is no automatic fallback if ShotGrid credentials are missing.

### Refreshing or customizing mock data from ShotGrid

If you have ShotGrid access, you can populate the mock database from a real project so the mock data matches your pipeline. Run the seed script with a project ID, URL, script name, and API key:

```bash
cd backend

# From your host (requires shotgun_api3); use single quotes so the API key is not interpreted by the shell
SHOTGRID_API_KEY='your-api-key' make seed-mock-db

# Or run the seed script directly in the API container with custom project
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm api \
  python -m dna.prodtrack_providers.mock_data.seed_db \
  --project-id YOUR_PROJECT_ID \
  --url https://yoursite.shotgrid.autodesk.com \
  --script-name YourScript \
  --api-key 'YOUR_API_KEY'
```

- This overwrites `mock_data/mock.db` with entities (projects, users, shots, assets, tasks, versions, playlists, notes) from the given ShotGrid project.
- Use `--skip-thumbnails` to skip downloading version thumbnails (faster seed; thumbnails will not work after signed URLs expire).
- Without `--skip-thumbnails`, thumbnails are downloaded to `mock_data/thumbnails/` and served by the API at `/api/mock-thumbnails/{version_id}` so they keep working after ShotGrid signed URLs expire.

The mock provider is **read-only**: it does not write to ShotGrid or to the SQLite file at runtime. Writes such as publishing notes will raise an error when using the mock provider.

---

## Docker Compose Files

The backend uses multiple compose files that are layered together:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base configuration with all services |
| `docker-compose.vexa.yml` | Vexa transcription service |
| `docker-compose.debug.yml` | Additional debug services |
| `docker-compose.local.yml` | **Your local overrides** (API keys, LLM credentials) |
| `docker-compose.local.vexa.yml` | **Your local Vexa overrides** (transcription API key) |

The `make start-local` command combines these:

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.vexa.yml \
               -f docker-compose.debug.yml \
               -f docker-compose.local.yml \
               -f docker-compose.local.vexa.yml \
               up --build -d
```

---

## Accessing Services

### MongoDB

```bash
# Connect via mongosh
docker exec -it dna-mongo mongosh dna

# Example queries
db.playlist_metadata.find()
db.segments.find()
db.draft_notes.find()
```

### API Documentation

Interactive API documentation is available at:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

---

## Development Workflow

### Hot Reload

- **Backend API:** Automatically reloads when you modify files in `src/`
- **Frontend:** Vite provides instant hot module replacement

### Running Tests

#### Backend Tests

```bash
cd backend

# Run all tests in Docker
make test

# Run specific test file
docker compose -f docker-compose.yml -f docker-compose.local.yml \
  run --rm api python -m pytest tests/test_transcription_service.py -v
```

#### Frontend Tests

```bash
cd frontend

# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs dna-backend

# Rebuild containers
make build
make start-local
```

### MongoDB Connection Issues

1. Check if MongoDB is running:
   ```bash
   docker logs dna-mongo
   ```

2. Verify the database exists:
   ```bash
   docker exec dna-mongo mongosh --eval "show dbs"
   ```

### Frontend Can't Connect to API

1. Ensure `frontend/packages/app/.env` exists — if not, copy it from `.env.example`
2. Ensure the API is running: http://localhost:8000/health
3. Check for CORS issues in browser console

### WebSocket Connection Issues

1. Check browser console for WebSocket errors
2. Ensure the API is running and healthy
3. The frontend connects to `ws://localhost:8000/ws` by default

---

## Stopping Everything

```bash
# Stop all containers
cd backend
make stop-local

# Remove volumes (clean slate)
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
```
