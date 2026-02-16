# DNA Quickstart Guide

This guide will help you run the DNA application stack locally for development.

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Node.js** (v18+) and **npm** for the frontend
- **Python 3.11+** (optional, for running tests outside Docker)

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd dna
```

### 2. Configure Environment Variables for Shotgrid and LLMs.

Copy the example docker-compose.local.yml file:

```bash
cd backend
cp example.docker-compose.local.yml docker-compose.local.yml
```

Edit `docker-compose.local.yml` with your credentials.

If you need access to shotgrid, you can reach out to the team.

To get the transcription service running, you can get a free key from: https://staging.vexa.ai/dashboard/transcription

When setting up, skip the Vexa API key for now. Once the stack is running you can get your Vexa API key from the Vexa Dashboard.

```yaml
services:
  api:
    environment:
      - PYTHONUNBUFFERED=1
      - SHOTGRID_URL=https://aswf.shotgrid.autodesk.com/
      - SHOTGRID_API_KEY=************
      - SHOTGRID_SCRIPT_NAME=DNA_local_testing
      - VEXA_API_KEY=**********
      - VEXA_API_URL=http://vexa:8056
      - OPENAI_API_KEY=your-openai-api-key
  
  vexa:
    environment:
      # From https://staging.vexa.ai/dashboard/transcription
      # More details: https://github.com/Vexa-ai/vexa/blob/main/docs/vexa-lite-deployment.md
      - TRANSCRIBER_API_KEY=**********************
      - TRANSCRIBER_URL=https://transcription.vexa.ai/v1/audio/transcriptions
```

### 3. Start the Backend Stack

```bash
cd backend
make start-local
```

This starts:
- **MongoDB** - Database (port 27017)
- **DNA API** - FastAPI backend (port 8000)
- **Vexa** - Transcription service (port 8056) 
- **Vexa Dashboard** - Admin UI (port 3001)


### 4. Get your Vexa API key

Once the stack is running you can get your Vexa API key from the Vexa Dashboard. http://localhost:3001/

### 5. Start the Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The React app will be available at `http://localhost:5173`.

### 6. Verify Everything is Running

| Service | URL | Description |
|---------|-----|-------------|
| DNA API | http://localhost:8000 | Backend API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Vexa Dashboard | http://localhost:3001 | Transcription admin |
| Frontend | http://localhost:5173 | React application |

## Environment Variables Reference

### Backend API (`api` service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHOTGRID_URL` | Yes | - | Your ShotGrid site URL |
| `SHOTGRID_API_KEY` | Yes | - | ShotGrid API key for authentication |
| `SHOTGRID_SCRIPT_NAME` | Yes | - | ShotGrid script name for API access |
| `PRODTRACK_PROVIDER` | No | `shotgrid` | Production tracking provider |
| `MONGODB_URL` | No | `mongodb://mongo:27017` | MongoDB connection string |
| `STORAGE_PROVIDER` | No | `mongodb` | Storage provider type |
| `VEXA_API_KEY` | Yes | - | API key for Vexa transcription service |
| `VEXA_API_URL` | No | `http://vexa:8056` | Vexa REST API URL |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for LLM features |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `LLM_PROVIDER` | No | `openai` | LLM provider (openai) |
| `PYTHONUNBUFFERED` | No | `1` | Disable Python output buffering |

### Vexa Service (`vexa` service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgresql://vexa:vexa@vexa-db:5432/vexa` | PostgreSQL connection for Vexa |
| `ADMIN_API_TOKEN` | No | `your-admin-token` | Admin token for Vexa management |
| `TRANSCRIBER_URL` | No | (vexa.ai) | Transcription API endpoint |
| `TRANSCRIBER_API_KEY` | Yes | - | API key for transcription service |

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

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                DNA Stack                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐         ┌─────────────────┐         ┌───────────────┐ │
│   │    Frontend     │◀───────▶│    DNA API      │────────▶│   ShotGrid    │ │
│   │  (React/Vite)   │   WS    │   (FastAPI)     │         │   (external)  │ │
│   │  :5173          │         │   :8000         │         │               │ │
│   └─────────────────┘         └────────┬────────┘         └───────────────┘ │
│                                        │                                     │
│          ┌─────────────────────────────┴─────────────────────────────┐      │
│          │                                                           │      │
│          ▼                                                           ▼      │
│   ┌─────────────────┐                                       ┌─────────────┐ │
│   │    MongoDB      │                                       │    Vexa     │ │
│   │    :27017       │                                       │   :8056     │ │
│   └─────────────────┘                                       └─────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

The DNA API serves as the central hub:
- Provides REST API for CRUD operations
- Provides WebSocket endpoint (`/ws`) for real-time event streaming
- Manages Vexa subscriptions for transcription events
- Broadcasts segment and bot status events to connected frontend clients

## Docker Compose Files

The backend uses multiple compose files that are layered together:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base configuration with all services |
| `docker-compose.local.yml` | **Your local overrides** (API keys, credentials) |
| `docker-compose.vexa.yml` | Vexa transcription service |
| `docker-compose.debug.yml` | Additional debug services (optional) |

The `make start-local` command combines these:

```bash
docker-compose -f docker-compose.yml \
               -f docker-compose.local.yml \
               -f docker-compose.vexa.yml \
               -f docker-compose.debug.yml \
               up --build
```

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
docker-compose -f docker-compose.yml -f docker-compose.local.yml \
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

1. Ensure the API is running: http://localhost:8000/health
2. Check for CORS issues in browser console
3. Verify API URL in frontend configuration

### WebSocket Connection Issues

1. Check browser console for WebSocket errors
2. Ensure the API is running and healthy
3. The frontend connects to `ws://localhost:8000/ws` by default

## Stopping Everything

```bash
# Stop all containers
cd backend
make stop-local

# Remove volumes (clean slate)
docker-compose -f docker-compose.yml -f docker-compose.local.yml down -v
```
