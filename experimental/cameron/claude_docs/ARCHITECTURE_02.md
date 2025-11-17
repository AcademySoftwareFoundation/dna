# DNA Dailies Notes Assistant - Architecture

## Overview

The DNA Dailies Notes Assistant is built with a **decoupled client-server architecture**, allowing the backend to serve multiple frontend clients.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   PySide6    │  │   Web Apps   │  │  RV Package  │           │
│  │   Qt Client  │  │   (Future)   │  │   (Future)   │           │
│  │ (frontend_v3)│  │              │  │              │           │
│  └───────┬──────┘  └──────┬───────┘  └──────┬───────┘           │
│          │                │                 │                   │
│          └────────────────┼─────────────────┘                   │
│                           │ HTTP/REST                           │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API LAYER                          │
│                    (FastAPI - backend/)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Core API Services                    │   │
│  │                                                          │   │
│  │  • /settings/* - Configuration management                │   │
│  │  • /versions/* - Version CRUD, notes, AI, CSV            │   │
│  │  • /shotgrid/* - ShotGrid integration                    │   │
│  │                                                          │   │
│  │  See "API Endpoints" in API docs for complete list       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└───────────────┬──────────────────┬──────────────────────────────┘
                │                  │
                ▼                  ▼
┌────────────────────────┐  ┌────────────────────────┐
│  EXTERNAL SERVICES     │  │  DATA STORAGE          │
│                        │  │                        │
│  • OpenAI API          │  │  • In-memory versions  │
│  • Claude API          │  │  • .env config file    │
│  • Gemini API          │  │  • CSV import/export   │
│  • Vexa Transcription  │  │  • Flow PTR Cloud      │
│  • ShotGrid API        │  │                        │
│                        │  │                        │
└────────────────────────┘  └────────────────────────┘
```

## Key Architectural Principles

### 1. **Backend Independence**
The backend is a standalone FastAPI service that:
- Has no knowledge of frontend implementation
- Communicates only via HTTP/REST
- Stores configuration in its own `.env` file
- Can be deployed separately from any frontend

### 2. **Frontend Flexibility**
Frontends connect to backend via HTTP:
- Backend URL is configurable via environment variable
- Multiple frontends can connect to same backend
- Frontends can be in any language/framework
- Each frontend can have local preferences

### 3. **Stateless API**
The backend API is mostly stateless:
- Versions stored in-memory (temporary)
- Configuration persisted in `.env` file
- No user authentication (single-user application)
- Suitable for local desktop deployment

## Backend Services

### Core Services (`backend/`)

| Service | File | Purpose |
|---------|------|---------|
| Main API | `main.py` | FastAPI app, CORS, health checks |
| Version Service | `version_service.py` | Version CRUD, notes, transcript |
| Note Service | `note_service.py` | LLM integration (OpenAI/Claude/Gemini) |
| Playlist Service | `playlist.py` | CSV import |
| ShotGrid Service | `shotgrid_service.py` | ShotGrid API integration |
| Settings Service | `settings_service.py` | Configuration persistence |

### API Endpoints

**18 endpoints** used by `frontend_v3`, organized by service:

```
Settings (2 endpoints):
/settings                                          GET    - Get all settings
/settings/save-partial                             POST   - Partial settings update

Versions (13 endpoints):
/versions                                          GET    - List all versions
/versions                                          POST   - Create version
/versions                                          DELETE - Clear all versions
/versions/{id}                                     GET    - Get version details
/versions/{id}/notes                               POST   - Add user note (appends)
/versions/{id}/notes                               PUT    - Update notes (replaces)
/versions/{id}/generate-ai-notes                   POST   - Generate AI notes from transcript
/versions/{id}/attachments                         GET    - Get version attachments
/versions/{id}/attachments                         POST   - Add attachment
/versions/{id}/attachments                         DELETE - Remove attachment
/versions/export/csv                               GET    - Export versions to CSV

ShotGrid (6 endpoints):
/shotgrid/config                                   POST   - Save ShotGrid configuration
/shotgrid/active-projects                          GET    - List active ShotGrid projects
/shotgrid/latest-playlists/{project_id}            GET    - Get latest playlists for project
/shotgrid/playlist-versions-with-statuses/{id}     GET    - Get playlist versions with statuses
/shotgrid/version-statuses                         GET    - Get list of version statuses
/shotgrid/batch-sync-notes                         POST   - Batch sync notes to ShotGrid
```

**Notes:**
- Backend has additional endpoints not used by frontend_v3 (see [`backend/API_DOCUMENTATION.md`](backend/API_DOCUMENTATION.md))

## Frontend Architecture

### Current Frontend: PySide6 Qt (`frontend_v3/`)

**Technology Stack:**
- PySide6 6.8+ (Qt for Python)
- QML for UI
- Python 3.12+

**Architecture Layers:**

```
frontend_v3/
├── main.py                  # Entry point, Qt application
├── config.py                # Configuration management
│
├── services/                # Backend communication & real-time services
│   ├── backend_service.py   # HTTP client for backend API + WebSocket coordination
│   ├── vexa_websocket_service.py  # Real-time Vexa WebSocket client
│   ├── transcript_utils.py  # Transcript processing utilities
│   ├── vexa_service.py      # Vexa HTTP API wrapper (legacy)
│   └── color_picker_service.py
│
├── models/                  # Qt data models
│   └── version_list_model.py
│
├── ui/                      # QML interface
│   └── main.qml             # Main UI definition
│
└── widgets/                 # Custom widgets
    └── color_picker/        # RPA color picker
```

**Communication Pattern:**
```
                                                    ┌─→ OpenAI API
                                                    │
QML UI                                              ├─→ Claude API
  ↕ Qt Signals/Slots                                │
Python Backend Service ←─────┐                      ├─→ Gemini API
  ↕ HTTP REST                │ Qt Signals/Slots     │
FastAPI Backend ─────────────┼──────────────────────┤
                             │                      ├─→ ShotGrid API
                             ↕                      |
                  Vexa WebSocket Service            └─→ Vexa HTTP API
                             ↕ WebSocket (wss://)      (Meeting Bot control)
                  Vexa Cloud API                        
                  (Real-time transcription)
```

### Configuration System

**Frontend Config (`config.py`):**
- Backend URL (env: `DNA_BACKEND_URL`)
- Request timeout (env: `DNA_REQUEST_TIMEOUT`)
- Retry attempts (env: `DNA_RETRY_ATTEMPTS`)
- Debug mode (env: `DNA_DEBUG`)
- Local preferences in `~/.dna_dailies/`

**Backend Config (`.env`):**
- LLM API keys and prompts
- ShotGrid credentials
- Vexa API key
- Email configuration

## Data Flow Examples

### Example 1: Creating a Version

```
1. User clicks "Import CSV" in Qt frontend
2. Frontend calls backend_service.import_csv()
3. backend_service makes HTTP POST to /playlists/import-csv
4. Backend parses CSV, creates versions in memory
5. Backend returns version list as JSON
6. Frontend updates version_list_model
7. QML UI refreshes version list display
```

### Example 2: Real-time Transcript Streaming (WebSocket)

```
1. User clicks "Join Meeting" in Qt frontend
2. Frontend calls backend_service.start_meeting()
   a. Starts Vexa bot via HTTP POST to Vexa API
   b. Receives meeting ID (e.g., "google_meet/abc-def-ghi/12345")
3. backend_service creates VexaWebSocketService instance
4. VexaWebSocketService connects to wss://api.cloud.vexa.ai/ws
5. After connection, subscribes to meeting ID
6. Vexa sends real-time transcript events:
   - "transcript.mutable" - In-progress segments (being spoken)
   - "transcript.finalized" - Completed segments
   - "meeting.status" - Status changes (joining, active, ended)
7. VexaWebSocketService emits Qt signals:
   - transcriptMutableReceived(segments)
   - transcriptFinalizedReceived(segments)
   - meetingStatusChanged(status)
8. backend_service receives signals and processes:
   a. Merges segments by UTC timestamp (absolute_start_time)
   b. Deduplicates by keeping longest text per timestamp
   c. Groups consecutive segments by speaker
   d. Tracks per-version segments in _current_version_segments
   e. Preserves base transcript when switching versions
9. backend_service emits currentTranscriptChanged signal
10. QML UI updates transcript display in real-time
11. Transcript auto-saves to selected version via HTTP PUT

Version Switching Behavior:
- When user selects Version A: saves existing transcript as "base"
- New segments added to _current_version_segments list
- Display = base_transcript + formatted(current_version_segments)
- When switching to Version B: marks all current segments as "seen"
- Version B starts fresh, only capturing new segments
- When switching back to Version A: previous content preserved
```

### Example 3: Generating AI Notes

```
1. User clicks "Regenerate AI Notes" for a version
2. Frontend calls backend_service.regenerate_ai_notes(version_id)
3. backend_service makes HTTP POST to /notes/generate
4. Backend:
   a. Retrieves version transcript from memory
   b. Calls OpenAI/Claude/Gemini API
   c. Stores generated notes with version
   d. Returns notes as JSON
5. Frontend updates UI with new AI notes
6. User can add notes to their manual notes
```

### Example 4: ShotGrid Integration

```
1. User configures ShotGrid in Preferences
2. Frontend saves to backend via POST /settings/save-partial
3. Backend persists to .env file
4. User clicks "Load ShotGrid Playlist"
5. Frontend calls GET /shotgrid/projects
6. Backend authenticates with ShotGrid API
7. Returns project list
8. User selects project, loads playlist
9. Backend fetches versions from ShotGrid
10. Versions displayed in frontend
```

## Real-time Transcription Architecture

### WebSocket Implementation

The frontend implements **direct WebSocket connectivity** to Vexa's transcription service, bypassing the backend for real-time data to minimize latency:

**Key Components:**

1. **vexa_websocket_service.py** - QWebSocket client for Vexa Cloud API
   - Manages WebSocket connection lifecycle
   - Handles subscription/unsubscription to meetings
   - Parses incoming transcript events
   - Implements exponential backoff for reconnection
   - Emits Qt signals for transcript updates

2. **transcript_utils.py** - Segment processing utilities
   - `merge_segments_by_absolute_utc()` - Deduplication by timestamp
   - `group_segments_by_speaker()` - Speaker grouping with max chars
   - `format_transcript_for_display()` - Timestamp + speaker formatting
   - `clean_text()` - Text normalization

3. **backend_service.py** - WebSocket coordination layer
   - Instantiates VexaWebSocketService
   - Connects WebSocket signals to processing logic
   - Manages per-version segment tracking
   - Handles version switching without losing transcripts

### Transcript Segment Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ Vexa Cloud (Speech Recognition)                             │
└───────────────┬─────────────────────────────────────────────┘
                │ WebSocket Events
                ▼
┌─────────────────────────────────────────────────────────────┐
│ VexaWebSocketService (QWebSocket)                           │
│ • Receives "transcript.mutable" - In-progress segments      │
│ • Receives "transcript.finalized" - Completed segments      │
│ • Emits Qt signals                                          │
└───────────────┬─────────────────────────────────────────────┘
                │ transcriptMutableReceived(segments)
                ▼
┌─────────────────────────────────────────────────────────────┐
│ backend_service._on_transcript_mutable()                    │
│ 1. Merge with _all_segments (global meeting history)       │
│ 2. Detect new/updated segments (by timestamp + length)     │
│ 3. Update _current_version_segments (per-version list)     │
│ 4. Rebuild transcript = base + formatted(current_segments) │
└───────────────┬─────────────────────────────────────────────┘
                │ currentTranscriptChanged
                ▼
┌─────────────────────────────────────────────────────────────┐
│ QML UI - Updates transcript display in real-time            │
└─────────────────────────────────────────────────────────────┘
```

### Mutable Segment Handling

Vexa sends **progressive updates** for segments being spoken:

```
Time 0s:  "Hello"           (mutable, timestamp: 123.0)
Time 1s:  "Hello world"     (mutable, timestamp: 123.0)
Time 2s:  "Hello world!"    (finalized, timestamp: 123.0)
```

**Solution:** Track segments by `(timestamp, text_length)` and always prefer longer text:

```python
# _seen_segment_ids: Dict[timestamp -> max_length]
if segment_key not in self._seen_segment_ids:
    # New segment
elif self._seen_segment_ids[segment_key] < text_length:
    # Updated with more text - replace in _current_version_segments
```

### Version-Specific Routing

Each version maintains its own transcript during a meeting:

```
Meeting Timeline:
[0:00] Join meeting, select Version A
[0:10] "Hello world" → saved to Version A
[0:20] Switch to Version B
[0:30] "Goodbye" → saved to Version B (NOT in Version A)
[0:40] Switch back to Version A
[0:50] "How are you?" → appended to Version A

Version A transcript: "Hello world\nHow are you?"
Version B transcript: "Goodbye"
```

**Implementation:**
- `_base_transcript` - Transcript that existed when version was selected
- `_current_version_segments` - New segments captured during this session
- `_seen_segment_ids` - Prevents duplicate processing across versions
- When switching versions: mark all current segments as "seen"
- Display = `base_transcript + "\n" + formatted(current_version_segments)`

### Performance Optimizations

1. **Deduplication** - Use UTC timestamps to avoid duplicate segments
2. **Incremental Updates** - Only rebuild transcript when segments change
3. **Speaker Grouping** - Merge consecutive segments from same speaker
4. **Length Tracking** - Detect mutable segment updates by text length
5. **Direct WebSocket** - Bypass backend for real-time data (10x lower latency vs polling)

## Deployment Scenarios

### Scenario 1: Single User Desktop (Current)
```
[Laptop]
  ├── Backend (localhost:8000)
  └── Qt Frontend → connects to localhost
```

### Scenario 2: Shared Backend
```
[Server: backend.studio.com:8000]
  └── Backend API

[Artist Workstation 1]
  └── Qt Frontend → connects to backend.studio.com

[Artist Workstation 2]
  └── Qt Frontend → connects to backend.studio.com

[Artist Workstation 3]
  └── Web Frontend → connects to backend.studio.com
```

### Scenario 3: Multiple Backends
```
[Dev Server]
  └── Backend (dev.studio.com:8000)

[Staging Server]
  └── Backend (staging.studio.com:8000)

[Production Server]
  └── Backend (prod.studio.com:8000)

[Artist]
  └── Frontend (DNA_BACKEND_URL=prod.studio.com:8000)
```

## Security Considerations

**Current State (Local Desktop):**
- No authentication required
- CORS allows all origins
- Designed for single-user local deployment
- Credentials stored in backend `.env` file

**For Multi-User Deployment:**
Would need to add:
- API key authentication
- Per-user credentials
- CORS restrictions
- HTTPS/TLS
- Rate limiting
- Audit logging

## Future Architecture Enhancements

### Planned Improvements
- [x] WebSocket support for real-time transcript push (COMPLETED - using Vexa Cloud WebSocket API)
- [ ] Database persistence (PostgreSQL/SQLite)
- [ ] User authentication and sessions
- [ ] Web frontend (React/Vue)
- [ ] CLI client
- [ ] Mobile app
- [ ] Kubernetes deployment
- [ ] API versioning (`/api/v1/...`)
- [ ] OpenAPI 3.0 schema generation

### Plugin System (Future)
```
backend/
└── plugins/
    ├── custom_llm_provider.py
    ├── custom_transcription_service.py
    └── custom_storage_backend.py
```

## Development Setup

### Backend Development
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
python main.py
# Visit http://localhost:8000/docs for API testing
```

### Frontend Development
```bash
cd frontend_v3
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export DNA_BACKEND_URL=http://localhost:8000
export DNA_DEBUG=true
python main.py
```

### Creating a New Frontend
```python
# example_client.py
import requests

class DNAClient:
    def __init__(self, backend_url="http://localhost:8000"):
        self.base_url = backend_url

    def health_check(self):
        response = requests.get(f"{self.base_url}/health")
        return response.json()

    # Add more API calls as needed...

# Use it
client = DNAClient("http://localhost:8000")
health = client.health_check()
print(health["status"])  # "healthy"
```

See [`backend/example_client.py`](backend/example_client.py) for a complete example.

## Testing

### Backend Testing
```bash
# Test health endpoint
curl http://localhost:8000/health

# Test version creation
curl -X POST http://localhost:8000/versions \
  -H "Content-Type: application/json" \
  -d '{"version_id": "TEST_001", "description": "Test version"}'

# View interactive docs
open http://localhost:8000/docs
```

### Frontend Testing
```bash
# Test with custom backend URL
export DNA_BACKEND_URL=http://dev-server:8000
python main.py

# Enable debug logging
export DNA_DEBUG=true
python main.py
```

## Conclusion

The DNA Dailies Notes Assistant uses a clean, decoupled architecture that separates frontend and backend concerns. This design:

✅ Allows multiple frontend implementations
✅ Enables independent backend deployment
✅ Facilitates testing and development
✅ Supports future scalability
✅ Maintains simple local desktop use case

The backend is a standalone REST API that can serve any HTTP client, making it flexible for current needs and future expansion.
