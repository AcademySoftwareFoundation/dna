# DNA Event Worker

The DNA Event Worker is an asynchronous Python process that handles real-time transcription, event processing, and data persistence for the DNA system.

## Overview

The worker operates as a background service that:

1. **Consumes events** from RabbitMQ
2. **Subscribes to real-time transcripts** from Vexa via WebSocket
3. **Persists transcript segments** to MongoDB
4. **Publishes events** for UI updates
5. **Recovers gracefully** from restarts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DNA Event Worker                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐     ┌─────────────────────────┐     ┌─────────────────┐   │
│   │  RabbitMQ   │────▶│  Message Handler        │────▶│  Event Publisher│   │
│   │  Consumer   │     │  (process_message)      │     │  (to RabbitMQ)  │   │
│   └─────────────┘     └─────────────────────────┘     └─────────────────┘   │
│                                 │                                            │
│                                 ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Event Router                                  │   │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │   │
│   │   │ transcription.  │  │ transcription.  │  │ bot.status_changed  │ │   │
│   │   │ subscribe       │  │ updated         │  │                     │ │   │
│   │   └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │   │
│   └────────────│────────────────────│───────────────────────│───────────┘   │
│                │                    │                       │               │
│                ▼                    ▼                       ▼               │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐   │
│   │ Vexa WebSocket  │     │ MongoDB Storage │     │ Event Broadcasting  │   │
│   │ Subscription    │     │ Provider        │     │                     │   │
│   └─────────────────┘     └─────────────────┘     └─────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### Component Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │                  DNA API                      │
                    │               (FastAPI Server)                │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           │ Publishes events
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                    RabbitMQ                                  │
│                          Exchange: dna.events (topic)                        │
│                          Queue: dna.events.worker                            │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          │ Consumes events
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               DNA Event Worker                               │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐    │
│  │ Transcription     │  │ Storage           │  │ Event Publisher       │    │
│  │ Provider (Vexa)   │  │ Provider (Mongo)  │  │ (RabbitMQ)            │    │
│  └─────────┬─────────┘  └─────────┬─────────┘  └───────────┬───────────┘    │
│            │                      │                        │                │
└────────────┼──────────────────────┼────────────────────────┼────────────────┘
             │                      │                        │
             │ WebSocket            │ CRUD                   │ Publish
             ▼                      ▼                        ▼
     ┌───────────────┐      ┌───────────────┐       ┌───────────────┐
     │     Vexa      │      │    MongoDB    │       │   RabbitMQ    │
     │  (Transcribe) │      │   (Storage)   │       │   (Events)    │
     └───────────────┘      └───────────────┘       └───────────────┘
```

### Event Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Event Processing Flow                              │
└──────────────────────────────────────────────────────────────────────────────┘

 1. Bot Dispatch                      2. Subscription Setup
    ─────────────                        ──────────────────
                                         
    API ───┬───▶ Vexa                    RabbitMQ ──────▶ Worker
           │     (dispatch bot)                          │
           │                                             ▼
           └───▶ RabbitMQ                        subscribe_to_meeting()
                 (transcription.subscribe)              │
                                                        ▼
                                                     Vexa WebSocket
                                                     (real-time feed)


 3. Transcript Processing             4. Segment Persistence
    ───────────────────────              ─────────────────────

    Vexa ──────▶ Worker                  Worker ──────▶ MongoDB
    (WebSocket)  │                                     │
                 ▼                                     ▼
         on_transcription_updated()           upsert_segment()
                 │                                     │
                 ▼                                     ▼
         Generate segment_id              ┌─────────────────────────┐
                 │                        │ Segment ID Generation   │
                 ▼                        │ SHA256(playlist_id:     │
         For each segment                 │   version_id:speaker:   │
                                          │   absolute_start_time)  │
                                          └─────────────────────────┘

 5. UI Updates
    ──────────

    Worker ──────▶ RabbitMQ ──────▶ Frontend
    (publish)      segment.created     (WebSocket)
                   segment.updated
```

## Core Components

### EventWorker Class

The main worker class that orchestrates all operations:

| Method | Description |
|--------|-------------|
| `connect()` | Establishes RabbitMQ connection and declares exchange/queue |
| `init_providers()` | Initializes transcription, storage, and event providers |
| `start()` | Starts the worker and begins consuming messages |
| `stop()` | Gracefully shuts down the worker |
| `process_message()` | Handles incoming RabbitMQ messages |
| `handle_event()` | Routes events to appropriate handlers |
| `resubscribe_to_active_meetings()` | Recovers subscriptions after restart |

### Event Handlers

| Handler | Event Type | Action |
|---------|-----------|--------|
| `on_transcription_subscribe` | `transcription.subscribe` | Subscribe to Vexa WebSocket for a meeting |
| `on_transcription_updated` | `transcription.updated` | Process and persist transcript segments |
| `on_transcription_completed` | `transcription.completed` | Clean up meeting subscriptions |
| `on_transcription_error` | `transcription.error` | Log errors and clean up |
| `on_bot_status_changed` | `bot.status_changed` | Forward bot status to UI |

### Providers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               Provider Layer                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   TranscriptionProvider              StorageProvider         EventPublisher │
│   ┌─────────────────────┐           ┌─────────────────┐    ┌───────────────┐│
│   │ VexaTranscription-  │           │ MongoDBStorage- │    │ EventPublisher││
│   │ Provider            │           │ Provider        │    │               ││
│   ├─────────────────────┤           ├─────────────────┤    ├───────────────┤│
│   │ • dispatch_bot()    │           │ • upsert_segment│    │ • connect()   ││
│   │ • stop_bot()        │           │ • get_playlist_ │    │ • publish()   ││
│   │ • subscribe_to_     │           │   metadata()    │    │ • close()     ││
│   │   meeting()         │           │ • get_segments_ │    │               ││
│   │ • get_active_bots() │           │   for_version() │    │               ││
│   └─────────────────────┘           └─────────────────┘    └───────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Event Types

| Event Type | Direction | Description |
|------------|-----------|-------------|
| `transcription.subscribe` | API → Worker | Request to subscribe to meeting transcripts |
| `transcription.started` | Worker → UI | Bot has joined the meeting |
| `transcription.updated` | Worker → Worker | Raw transcript data from Vexa |
| `transcription.completed` | Worker → UI | Meeting transcription finished |
| `transcription.error` | Worker → UI | Transcription failed |
| `bot.status_changed` | Worker → UI | Bot status update (joining, in_meeting, etc.) |
| `segment.created` | Worker → UI | New transcript segment saved |
| `segment.updated` | Worker → UI | Existing segment text updated |
| `playlist.updated` | API → UI | Playlist metadata changed |
| `version.updated` | API → UI | Version data changed |
| `draft_note.updated` | API → UI | Draft note modified |

## Data Flow: Transcript Processing

```
                               Vexa WebSocket
                                     │
                                     │ transcript.mutable message
                                     ▼
              ┌─────────────────────────────────────────────────┐
              │              _on_vexa_event()                    │
              │  • Forward to RabbitMQ as transcription.updated  │
              └─────────────────────────┬───────────────────────┘
                                        │
                                        ▼
              ┌─────────────────────────────────────────────────┐
              │           on_transcription_updated()             │
              │                                                  │
              │  1. Extract platform & meeting_id                │
              │  2. Lookup playlist_id from meeting mapping      │
              │  3. Get playlist metadata for in_review version  │
              │  4. For each segment:                            │
              │     ┌────────────────────────────────────────┐   │
              │     │ a. Skip if no text or start_time       │   │
              │     │ b. Generate unique segment_id (SHA256) │   │
              │     │ c. Create StoredSegmentCreate          │   │
              │     │ d. Upsert to MongoDB                   │   │
              │     │ e. Publish segment.created/updated     │   │
              │     └────────────────────────────────────────┘   │
              └─────────────────────────────────────────────────┘
```

### Segment ID Generation

Segments are uniquely identified using a hash to ensure idempotent updates:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Segment ID Generation                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Input Components:                                              │
│   ├── playlist_id: 42                                           │
│   ├── version_id: 5                                             │
│   ├── speaker: "John Doe"                                       │
│   └── absolute_start_time: "2026-01-23T04:00:00.000Z"          │
│                                                                  │
│   Hash Input String:                                             │
│   "42:5:John Doe:2026-01-23T04:00:00.000Z"                      │
│                                                                  │
│   segment_id = SHA256(input)[:16]                               │
│   Result: "a3f2b1c4d5e6f7a8"                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Recovery Mechanism

When the worker restarts, it automatically recovers active meeting subscriptions:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Worker Recovery Flow                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Worker Start                                                              │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────────────┐                                                   │
│   │ init_providers()    │                                                   │
│   └──────────┬──────────┘                                                   │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────────────────────────┐                              │
│   │ resubscribe_to_active_meetings()         │                              │
│   │                                          │                              │
│   │   1. Call Vexa GET /bots/status          │                              │
│   │      └── Get list of active bots         │                              │
│   │                                          │                              │
│   │   2. For each active bot:                │                              │
│   │      ├── Skip if status = completed/     │                              │
│   │      │   failed/stopped                  │                              │
│   │      │                                   │                              │
│   │      ├── Lookup playlist metadata by     │                              │
│   │      │   meeting_id                      │                              │
│   │      │                                   │                              │
│   │      ├── Register meeting ID mapping     │                              │
│   │      │   (internal_id → platform:native) │                              │
│   │      │                                   │                              │
│   │      └── subscribe_to_meeting()          │                              │
│   │          (reconnect WebSocket)           │                              │
│   │                                          │                              │
│   └──────────────────────────────────────────┘                              │
│              │                                                              │
│              ▼                                                              │
│   ┌─────────────────────┐                                                   │
│   │ Start consuming     │                                                   │
│   │ RabbitMQ messages   │                                                   │
│   └─────────────────────┘                                                   │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `RABBITMQ_URL` | `amqp://dna:dna@localhost:5672/dna` | RabbitMQ connection URL |
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection URL |
| `VEXA_API_URL` | `http://vexa:8056` | Vexa REST API base URL |
| `VEXA_API_KEY` | (required) | API key for Vexa authentication |
| `TRANSCRIPTION_PROVIDER` | `vexa` | Transcription provider to use |
| `STORAGE_PROVIDER` | `mongodb` | Storage provider to use |

## Running the Worker

### With Docker Compose

```bash
# Start the entire stack (includes worker)
make start-local

# View worker logs
docker logs -f dna-worker
```

### Standalone (Development)

```bash
cd backend
python src/worker.py
```

## Graceful Shutdown

The worker handles shutdown signals (`SIGINT`, `SIGTERM`) gracefully:

1. Sets `should_stop` flag to exit the main loop
2. Closes transcription provider (unsubscribes from WebSockets)
3. Closes event publisher connection
4. Closes RabbitMQ connection

```
Signal Received (SIGINT/SIGTERM)
        │
        ▼
   ┌─────────────────────┐
   │ signal_handler()    │
   │ worker.stop()       │
   └─────────┬───────────┘
             │
             ▼
   ┌─────────────────────┐      ┌─────────────────────┐
   │ Close transcription │      │ Close event         │
   │ provider            │      │ publisher           │
   └─────────┬───────────┘      └─────────┬───────────┘
             │                            │
             └──────────┬─────────────────┘
                        ▼
              ┌─────────────────────┐
              │ Close RabbitMQ      │
              │ connection          │
              └─────────────────────┘
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Received transcript for unknown internal meeting ID" | ID mapping missing | Ensure `vexa_meeting_id` is stored in playlist metadata at dispatch time |
| "No playlist_id found for meeting" | Meeting mapping missing | Check that `transcription.subscribe` event includes `playlist_id` |
| "No in_review version found for playlist" | No active review version | Set `playlist_metadata.in_review` to a valid version ID before starting transcription |
| Worker not receiving events | RabbitMQ not connected | Check RabbitMQ is running and accessible |

### Debug Logging

Enable verbose logging:

```python
import logging
logging.getLogger("worker").setLevel(logging.DEBUG)
logging.getLogger("dna.transcription_providers.vexa").setLevel(logging.DEBUG)
```

### Health Check

The worker logs its status on startup:

```
2026-01-26 10:00:00 - worker - INFO - Connecting to RabbitMQ at amqp://dna:dna@rabbitmq:5672/dna
2026-01-26 10:00:01 - worker - INFO - Connected to RabbitMQ, listening for events on queue: dna.events.worker
2026-01-26 10:00:01 - worker - INFO - Initializing providers...
2026-01-26 10:00:01 - worker - INFO - Providers initialized
2026-01-26 10:00:01 - worker - INFO - Checking for active meetings to resubscribe...
2026-01-26 10:00:01 - worker - INFO - Worker started, waiting for events...
```
