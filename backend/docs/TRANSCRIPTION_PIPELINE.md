# Transcription Pipeline Documentation

This document describes the real-time transcription pipeline that integrates DNA with Vexa for meeting transcription, segment persistence, and event-driven UI updates.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Data Flow](#data-flow)
5. [Event System](#event-system)
6. [Data Models](#data-models)
7. [Recovery Mechanisms](#recovery-mechanisms)
8. [API Reference](#api-reference)
9. [Configuration](#configuration)

---

## Overview

The transcription pipeline enables real-time meeting transcription by:

1. **Dispatching bots** to join meetings (Google Meet, Zoom, Teams)
2. **Receiving real-time transcripts** via WebSocket from Vexa
3. **Persisting segments** to MongoDB with unique IDs
4. **Publishing events** to RabbitMQ for UI updates
5. **Recovering gracefully** from worker restarts

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  DNA API    │────▶│   Worker    │────▶│   MongoDB   │
│    (React)  │     │  (FastAPI)  │     │  (asyncio)  │     │  (segments) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  RabbitMQ   │◀───▶│    Vexa     │
                    │  (events)   │     │ (transcribe)│
                    └─────────────┘     └─────────────┘
```

---

## Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph Frontend
        UI[React App]
        WS[WebSocket Client]
    end

    subgraph DNA Backend
        API[FastAPI Server]
        Worker[Event Worker]
        EP[Event Publisher]
    end

    subgraph External Services
        Vexa[Vexa Transcription]
        RabbitMQ[RabbitMQ]
        MongoDB[(MongoDB)]
    end

    subgraph Meeting Platforms
        GM[Google Meet]
        Zoom[Zoom]
        Teams[MS Teams]
    end

    UI -->|POST /transcription/bot| API
    API -->|dispatch_bot| Vexa
    API -->|publish event| RabbitMQ
    
    RabbitMQ -->|consume| Worker
    Worker -->|subscribe WebSocket| Vexa
    
    Vexa -->|join meeting| GM
    Vexa -->|join meeting| Zoom
    Vexa -->|join meeting| Teams
    
    Vexa -->|transcript.mutable| Worker
    Worker -->|upsert_segment| MongoDB
    Worker -->|publish| EP
    EP -->|segment.created/updated| RabbitMQ
    
    RabbitMQ -->|events| WS
    WS -->|update UI| UI
```

### Component Interaction Sequence

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as DNA API
    participant RMQ as RabbitMQ
    participant Worker as Event Worker
    participant Vexa as Vexa Service
    participant Mongo as MongoDB

    UI->>API: POST /transcription/bot
    API->>Vexa: POST /bots (dispatch)
    Vexa-->>API: 201 Created (vexa_meeting_id)
    API->>Mongo: upsert playlist_metadata (vexa_meeting_id)
    API->>RMQ: publish transcription.subscribe
    API-->>UI: 201 BotSession

    RMQ->>Worker: consume transcription.subscribe
    Worker->>Vexa: WebSocket subscribe(platform, meeting_id)
    Vexa-->>Worker: subscribed confirmation

    loop Real-time Transcription
        Vexa->>Worker: transcript.mutable (segments)
        Worker->>Mongo: upsert_segment (by segment_id)
        Worker->>RMQ: publish segment.created/updated
        RMQ->>UI: segment event (via WebSocket)
    end

    Vexa->>Worker: meeting.status (completed)
    Worker->>RMQ: publish transcription.completed
```

---

## Components

### 1. DNA API (FastAPI)

The API server handles HTTP requests and initiates the transcription flow.

**Key Endpoints:**
- `POST /transcription/bot` - Dispatch a bot to a meeting
- `DELETE /transcription/bot/{platform}/{meeting_id}` - Stop a bot

**Responsibilities:**
- Validate requests
- Call Vexa API to dispatch/stop bots
- Store `vexa_meeting_id` in playlist metadata
- Publish `transcription.subscribe` event to RabbitMQ

### 2. Event Worker

An async Python worker that consumes RabbitMQ events and manages WebSocket connections to Vexa.

**Responsibilities:**
- Subscribe to meeting transcripts via WebSocket
- Process incoming transcript segments
- Generate unique segment IDs
- Persist segments to MongoDB
- Publish segment events for UI updates
- Recover subscriptions on restart

**Key Methods:**
| Method | Description |
|--------|-------------|
| `on_transcription_subscribe` | Subscribe to a meeting's WebSocket feed |
| `on_transcription_updated` | Process and persist transcript segments |
| `_on_vexa_event` | Forward Vexa events to RabbitMQ |
| `resubscribe_to_active_meetings` | Recovery on startup |

### 3. Vexa Transcription Provider

Abstraction layer for Vexa API interactions.

**Features:**
- HTTP client for REST API (`/bots`, `/bots/status`)
- WebSocket client for real-time transcripts
- Internal meeting ID mapping for transcript routing

```
┌────────────────────────────────────────────────────────────────┐
│                    VexaTranscriptionProvider                    │
├────────────────────────────────────────────────────────────────┤
│  REST API (httpx)                                              │
│  ├── POST /bots          → dispatch_bot()                      │
│  ├── DELETE /bots/:id    → stop_bot()                          │
│  └── GET /bots/status    → get_active_bots()                   │
├────────────────────────────────────────────────────────────────┤
│  WebSocket (websockets)                                        │
│  ├── ws://vexa/ws?api_key=xxx                                  │
│  ├── subscribe message   → subscribe_to_meeting()              │
│  ├── transcript.mutable  → callback(segments)                  │
│  ├── meeting.status      → callback(status)                    │
│  └── subscribed          → internal ID mapping                 │
├────────────────────────────────────────────────────────────────┤
│  Internal State                                                │
│  ├── _meeting_id_to_key: {internal_id → "platform:native_id"}  │
│  ├── _callbacks: {meeting_key → callback_function}             │
│  └── _pending_subscriptions: [meeting_keys awaiting confirm]   │
└────────────────────────────────────────────────────────────────┘
```

### 4. MongoDB Storage Provider

Handles all database operations for playlist metadata and segments.

**Collections:**
- `playlist_metadata` - Links playlists to meetings and versions
- `segments` - Stores transcription segments

---

## Data Flow

### 1. Bot Dispatch Flow

```mermaid
flowchart LR
    A[User clicks Start Transcription] --> B[POST /transcription/bot]
    B --> C{Vexa API}
    C -->|201 Created| D[Store vexa_meeting_id]
    D --> E[Publish transcription.subscribe]
    E --> F[Return BotSession to UI]
```

### 2. Transcript Processing Flow

```mermaid
flowchart TD
    A[Vexa WebSocket] -->|transcript.mutable| B[Worker receives message]
    B --> C{Has internal ID mapping?}
    C -->|No| D[Log warning, skip]
    C -->|Yes| E[Resolve platform:meeting_id]
    E --> F{Has playlist mapping?}
    F -->|No| G[Log warning, skip]
    F -->|Yes| H[Get playlist metadata]
    H --> I{Has in_review version?}
    I -->|No| J[Log warning, skip]
    I -->|Yes| K[Process segments]
    
    K --> L{For each segment}
    L --> M{Has text and start_time?}
    M -->|No| N[Skip segment]
    M -->|Yes| O[Generate segment_id]
    O --> P[Upsert to MongoDB]
    P --> Q{Is new segment?}
    Q -->|Yes| R[Publish segment.created]
    Q -->|No| S[Publish segment.updated]
```

### 3. Segment ID Generation

Segments are uniquely identified by a hash of:

```
segment_id = SHA256(playlist_id:version_id:speaker:absolute_start_time)[:16]
```

This ensures:
- Same speaker at same time = same segment (updates merge)
- Different speakers at same time = different segments
- Same speaker at different times = different segments

```
┌─────────────────────────────────────────────────────────────┐
│                    Segment ID Generation                     │
├─────────────────────────────────────────────────────────────┤
│  Input:                                                      │
│    playlist_id: 42                                           │
│    version_id: 5                                             │
│    speaker: "John Doe"                                       │
│    absolute_start_time: "2026-01-23T04:00:00.000Z"          │
│                                                              │
│  Hash Input: "42:5:John Doe:2026-01-23T04:00:00.000Z"       │
│                                                              │
│  Output: "a3f2b1c4d5e6f7a8" (first 16 chars of SHA256)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Event System

### Event Types

| Event Type | Publisher | Consumer | Description |
|------------|-----------|----------|-------------|
| `transcription.subscribe` | API | Worker | Request to subscribe to meeting |
| `transcription.started` | Worker | UI | Bot joined meeting |
| `transcription.updated` | Worker | Worker | Raw transcript from Vexa |
| `transcription.completed` | Worker | UI | Meeting ended |
| `transcription.error` | Worker | UI | Transcription failed |
| `bot.status_changed` | Worker | UI | Bot status update |
| `segment.created` | Worker | UI | New segment persisted |
| `segment.updated` | Worker | UI | Existing segment updated |

### Event Flow Diagram

```
                              RabbitMQ Exchange: dna.events
                              ════════════════════════════════
                                           │
           ┌───────────────────────────────┼───────────────────────────────┐
           │                               │                               │
           ▼                               ▼                               ▼
    ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
    │transcription.│              │   segment.   │              │    bot.      │
    │  subscribe   │              │   created    │              │status_changed│
    │              │              │              │              │              │
    │ {platform,   │              │ {segment_id, │              │ {status,     │
    │  meeting_id, │              │  playlist_id,│              │  platform,   │
    │  playlist_id}│              │  version_id, │              │  meeting_id} │
    └──────────────┘              │  text,       │              └──────────────┘
           │                      │  speaker,    │                     │
           │                      │  start_time, │                     │
           ▼                      │  end_time}   │                     ▼
      Worker                      └──────────────┘                    UI
    subscribes                           │
    to Vexa WS                           ▼
                                        UI
                                   displays/updates
                                      segments
```

### Message Formats

#### Vexa WebSocket Messages

**transcript.mutable** (from Vexa):
```json
{
  "type": "transcript.mutable",
  "meeting": {"id": 123},
  "segments": [
    {
      "text": "Hello, this is a test.",
      "speaker": "John Doe",
      "language": "en",
      "absolute_start_time": "2026-01-23T04:00:00.000Z",
      "absolute_end_time": "2026-01-23T04:00:05.000Z",
      "updated_at": "2026-01-23T04:00:05.000Z"
    }
  ]
}
```

**subscribed** (from Vexa):
```json
{
  "type": "subscribed",
  "meetings": [
    {"platform": "google_meet", "native_id": "abc-def-ghi", "id": 123}
  ]
}
```

**meeting.status** (from Vexa):
```json
{
  "type": "meeting.status",
  "meeting": {
    "platform": "google_meet",
    "native_id": "abc-def-ghi",
    "id": 123
  },
  "status": "in_meeting"
}
```

---

## Data Models

### PlaylistMetadata

Stored in MongoDB `playlist_metadata` collection:

```typescript
interface PlaylistMetadata {
  _id: string;
  playlist_id: number;
  in_review: number | null;      // Version ID currently in review
  meeting_id: string | null;     // Native meeting ID (e.g., "abc-def-ghi")
  platform: string | null;       // "google_meet", "zoom", "teams"
  vexa_meeting_id: number | null; // Internal Vexa meeting ID
}
```

### StoredSegment

Stored in MongoDB `segments` collection:

```typescript
interface StoredSegment {
  _id: string;
  segment_id: string;           // Generated unique ID
  playlist_id: number;
  version_id: number;
  text: string;
  speaker: string | null;
  language: string | null;
  absolute_start_time: string;  // ISO 8601 UTC timestamp
  absolute_end_time: string;    // ISO 8601 UTC timestamp
  vexa_updated_at: string | null;
  created_at: datetime;
  updated_at: datetime;
}
```

### BotSession

Returned from dispatch_bot API:

```typescript
interface BotSession {
  platform: "google_meet" | "zoom" | "teams";
  meeting_id: string;
  playlist_id: number;
  status: "joining" | "waiting" | "in_meeting" | "completed" | "failed";
  vexa_meeting_id: number | null;
  bot_name: string | null;
  language: string | null;
  created_at: datetime;
  updated_at: datetime;
}
```

### Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│    Playlist     │         │PlaylistMetadata │         │   StoredSegment │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ id: int (PK)    │◄────────│ playlist_id: int│────────▶│ playlist_id: int│
│ name: str       │         │ in_review: int  │────┐    │ version_id: int │
│ ...             │         │ meeting_id: str │    │    │ segment_id: str │
└─────────────────┘         │ platform: str   │    │    │ text: str       │
                            │ vexa_meeting_id │    │    │ speaker: str    │
                            └─────────────────┘    │    │ start_time: str │
                                                   │    │ end_time: str   │
┌─────────────────┐                                │    └─────────────────┘
│     Version     │                                │            ▲
├─────────────────┤                                │            │
│ id: int (PK)    │◄───────────────────────────────┘            │
│ playlist_id: int│                                              │
│ ...             │──────────────────────────────────────────────┘
└─────────────────┘         (segments belong to version)
```

---

## Recovery Mechanisms

### Worker Restart Recovery

When the worker restarts mid-meeting, it recovers active subscriptions:

```mermaid
flowchart TD
    A[Worker Starts] --> B[Initialize Providers]
    B --> C[Call resubscribe_to_active_meetings]
    C --> D[GET /bots/status from Vexa]
    D --> E{Any active bots?}
    E -->|No| F[Continue normal operation]
    E -->|Yes| G[For each active bot]
    
    G --> H{Status = completed/failed/stopped?}
    H -->|Yes| I[Skip bot]
    H -->|No| J[Lookup playlist by meeting_id]
    
    J --> K{Found playlist?}
    K -->|No| L[Log warning, skip]
    K -->|Yes| M[Get vexa_meeting_id from metadata]
    
    M --> N[Register ID mapping]
    N --> O[Store playlist mapping]
    O --> P[Subscribe to WebSocket]
    P --> Q[Add to subscribed set]
    Q --> G
```

### Internal Meeting ID Mapping

Vexa uses internal meeting IDs in transcript messages, but DNA uses platform:native_id. The mapping is maintained through:

1. **At dispatch time**: `vexa_meeting_id` returned from Vexa is stored in playlist metadata
2. **At recovery time**: Load from playlist metadata or bot status response
3. **At runtime**: Captured from `subscribed` and `meeting.status` WebSocket messages

```
┌─────────────────────────────────────────────────────────────────┐
│                    Meeting ID Mapping Sources                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Dispatch Response (POST /bots)                              │
│     └── Returns: {"meeting_id": 123, ...}                       │
│         └── Stored in: playlist_metadata.vexa_meeting_id        │
│                                                                  │
│  2. Recovery (GET /bots/status)                                 │
│     └── Returns: [{"meeting_id": 123, "native_meeting_id":...}] │
│         └── Used to: register_meeting_id_mapping()              │
│                                                                  │
│  3. WebSocket "subscribed" message                              │
│     └── Returns: {"meetings": [{"id": 123, ...}]}               │
│         └── Maps: internal_id → pending subscription key        │
│                                                                  │
│  4. WebSocket "meeting.status" message                          │
│     └── Returns: {"meeting": {"id": 123, "platform":...}}       │
│         └── Maps: internal_id → platform:native_id              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### POST /transcription/bot

Dispatch a transcription bot to a meeting.

**Request:**
```json
{
  "platform": "google_meet",
  "meeting_id": "abc-def-ghi",
  "playlist_id": 42,
  "passcode": "optional",
  "bot_name": "DNA Bot",
  "language": "en"
}
```

**Response (201):**
```json
{
  "platform": "google_meet",
  "meeting_id": "abc-def-ghi",
  "playlist_id": 42,
  "status": "joining",
  "vexa_meeting_id": 123,
  "bot_name": "DNA Bot",
  "language": "en",
  "created_at": "2026-01-23T04:00:00Z",
  "updated_at": "2026-01-23T04:00:00Z"
}
```

### DELETE /transcription/bot/{platform}/{meeting_id}

Stop a transcription bot.

**Response (200):**
```json
true
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VEXA_API_URL` | `http://vexa:8056` | Vexa REST API base URL |
| `VEXA_WS_URL` | `ws://vexa:8056/ws` | Vexa WebSocket URL |
| `VEXA_API_KEY` | (required) | API key for Vexa authentication |
| `RABBITMQ_URL` | `amqp://dna:dna@localhost:5672/dna` | RabbitMQ connection URL |
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection URL |
| `MONGODB_DB` | `dna` | MongoDB database name |

### RabbitMQ Setup

```
Exchange: dna.events (topic, durable)
Queue: dna.events.worker (durable)
Binding: # (all events)
```

---

## Testing

The worker has comprehensive test coverage:

```bash
# Run all tests
make test

# Run worker tests only
pytest tests/test_worker.py -v
```

### Test Categories

| Category | Tests | Description |
|----------|-------|-------------|
| `TestHandleEvent` | 6 | Event routing |
| `TestOnTranscriptionSubscribe` | 7 | Subscription handling |
| `TestOnTranscriptionUpdated` | 10 | Segment processing |
| `TestOnVexaEvent` | 7 | Vexa event forwarding |
| `TestResubscribeToActiveMeetings` | 12 | Recovery logic |
| `TestSegmentIdGeneration` | 5 | ID generation |

---

## Troubleshooting

### Common Issues

#### "Received transcript for unknown internal meeting ID"

**Cause:** The internal Vexa meeting ID wasn't mapped before transcripts arrived.

**Solution:** Ensure:
1. `vexa_meeting_id` is stored in playlist metadata at dispatch time
2. Worker loads mapping on restart via `resubscribe_to_active_meetings()`

#### "No playlist_id found for meeting"

**Cause:** The meeting_key → playlist_id mapping is missing.

**Solution:** Check that:
1. `transcription.subscribe` event includes `playlist_id`
2. Worker stores mapping in `_meeting_to_playlist`

#### "No in_review version found for playlist"

**Cause:** The playlist doesn't have an active in-review version.

**Solution:** Set `playlist_metadata.in_review` to a valid version ID before starting transcription.

### Debug Logging

Enable debug logging for detailed transcript processing:

```python
import logging
logging.getLogger("worker").setLevel(logging.DEBUG)
logging.getLogger("dna.transcription_providers.vexa").setLevel(logging.DEBUG)
```

---

## Architecture Decision Records

### ADR-001: Segment ID Generation

**Decision:** Use SHA256 hash of `playlist_id:version_id:speaker:absolute_start_time`

**Rationale:**
- Ensures idempotent upserts (same data = same ID)
- Allows updating segment text as speaker continues
- No coordination needed between distributed workers

### ADR-002: Store vexa_meeting_id in MongoDB

**Decision:** Persist Vexa's internal meeting ID in playlist_metadata

**Rationale:**
- Required for worker recovery after restart
- WebSocket `subscribed` response doesn't always include internal ID
- Eliminates dependency on Vexa API response format

### ADR-003: Event-Driven Architecture

**Decision:** Use RabbitMQ for all inter-component communication

**Rationale:**
- Decouples API from worker processing
- Enables horizontal scaling of workers
- Provides durability for events during worker restarts
