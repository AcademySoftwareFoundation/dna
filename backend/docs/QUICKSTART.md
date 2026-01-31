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

### 2. Configure Environment Variables

Copy the example docker-compose.local.yml file:

```bash
cd backend
cp example.docker-compose.local.yml docker-compose.local.yml
```

Edit `docker-compose.local.yml` with your credentials:

```yaml
services:
  api:
    environment:
      - SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com/
      - SHOTGRID_API_KEY=your-shotgrid-api-key
      - SHOTGRID_SCRIPT_NAME=your-script-name
      - VEXA_API_KEY=your-vexa-api-key
      - OPENAI_API_KEY=your-openai-api-key

  worker:
    environment:
      - VEXA_API_KEY=your-vexa-api-key
```

### 3. Start the Backend Stack

```bash
cd backend
make start-local
```

This starts:
- **MongoDB** - Database (port 27017)
- **RabbitMQ** - Message broker (ports 5672, 15672)
- **DNA API** - FastAPI backend (port 8000)
- **DNA Worker** - Event processor
- **Vexa** - Transcription service (port 8056)
- **Vexa Dashboard** - Admin UI (port 3001)

### 4. Start the Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The React app will be available at `http://localhost:5173`.

### 5. Verify Everything is Running

| Service | URL | Description |
|---------|-----|-------------|
| DNA API | http://localhost:8000 | Backend API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| RabbitMQ UI | http://localhost:15672 | Message broker admin (dna/dna) |
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
| `RABBITMQ_URL` | No | `amqp://dna:dna@rabbitmq:5672/dna` | RabbitMQ connection string |
| `VEXA_API_KEY` | Yes | - | API key for Vexa transcription service |
| `VEXA_API_URL` | No | `http://vexa:8056` | Vexa REST API URL |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for LLM features |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `LLM_PROVIDER` | No | `openai` | LLM provider (openai) |
| `PYTHONUNBUFFERED` | No | `1` | Disable Python output buffering |

### Worker (`worker` service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URL` | No | `mongodb://mongo:27017` | MongoDB connection string |
| `RABBITMQ_URL` | No | `amqp://dna:dna@rabbitmq:5672/dna` | RabbitMQ connection string |
| `VEXA_API_KEY` | Yes | - | API key for Vexa transcription service |
| `VEXA_API_URL` | No | `http://vexa:8056` | Vexa REST API URL |
| `TRANSCRIPTION_PROVIDER` | No | `vexa` | Transcription provider to use |
| `STORAGE_PROVIDER` | No | `mongodb` | Storage provider type |
| `PYTHONUNBUFFERED` | No | `1` | Disable Python output buffering |

### Vexa Service (`vexa` service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgresql://vexa:vexa@vexa-db:5432/vexa` | PostgreSQL connection for Vexa |
| `ADMIN_API_TOKEN` | No | `your-admin-token` | Admin token for Vexa management |
| `TRANSCRIBER_URL` | No | (vexa.ai) | Transcription API endpoint |
| `TRANSCRIBER_API_KEY` | Yes | - | API key for transcription service |

### RabbitMQ (`rabbitmq` service)

| Variable | Default | Description |
|----------|---------|-------------|
| `RABBITMQ_DEFAULT_USER` | `dna` | RabbitMQ username |
| `RABBITMQ_DEFAULT_PASS` | `dna` | RabbitMQ password |
| `RABBITMQ_DEFAULT_VHOST` | `dna` | RabbitMQ virtual host |

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
│   │    Frontend     │────────▶│    DNA API      │────────▶│   ShotGrid    │ │
│   │  (React/Vite)   │         │   (FastAPI)     │         │   (external)  │ │
│   │  :5173          │         │   :8000         │         │               │ │
│   └─────────────────┘         └────────┬────────┘         └───────────────┘ │
│                                        │                                     │
│                                        ▼                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          RabbitMQ  :5672                             │   │
│   │                       (Management UI :15672)                         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                        │                                     │
│          ┌─────────────────────────────┴─────────────────────────────┐      │
│          │                                                           │      │
│          ▼                                                           ▼      │
│   ┌─────────────────┐                                       ┌─────────────┐ │
│   │   DNA Worker    │◀─────────────────────────────────────▶│    Vexa     │ │
│   │   (asyncio)     │         WebSocket                     │   :8056     │ │
│   └────────┬────────┘                                       └─────────────┘ │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                       │
│   │    MongoDB      │                                                       │
│   │    :27017       │                                                       │
│   └─────────────────┘                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

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

### RabbitMQ

Access the management UI at http://localhost:15672

- **Username:** dna
- **Password:** dna

### API Documentation

Interactive API documentation is available at:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

## Development Workflow

### Hot Reload

- **Backend API:** Automatically reloads when you modify files in `src/`
- **Worker:** Requires restart if you modify `worker.py` (run `docker restart dna-worker`)
- **Frontend:** Vite provides instant hot module replacement

### Running Tests

#### Backend Tests

```bash
cd backend

# Run all tests in Docker
make test

# Run specific test file
docker-compose -f docker-compose.yml -f docker-compose.local.yml \
  run --rm api python -m pytest tests/test_worker.py -v
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
docker logs dna-worker

# Rebuild containers
make build
make start-local
```

### RabbitMQ Connection Issues

1. Ensure RabbitMQ is healthy:
   ```bash
   docker logs dna-rabbitmq
   ```

2. The worker waits for RabbitMQ to be healthy before starting (defined in `docker-compose.yml`)

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

## Stopping Everything

```bash
# Stop all containers
cd backend
make stop-local

# Remove volumes (clean slate)
docker-compose -f docker-compose.yml -f docker-compose.local.yml down -v
```
