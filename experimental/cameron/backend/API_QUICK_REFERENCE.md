# API Quick Reference Guide

## Base URL
`http://localhost:8000`

## System Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info and docs link |
| `/health` | GET | Service health + feature status |
| `/config` | GET | Configuration (ShotGrid enabled) |

---

## Playlist Service

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/upload-playlist` | POST | Import shots from CSV |

**Request:** `multipart/form-data` with CSV file
**Response:** `{"status": "success", "items": [...]}`

---

## Email Service

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/email-notes` | POST | Send notes via Gmail |

**Request Body:**
```json
{
  "email": "user@studio.com",
  "notes": [
    {
      "shot": "SH010",
      "notes": "Add motion",
      "transcription": "Director said...",
      "summary": "Key feedback"
    }
  ]
}
```

---

## Note Service (LLM)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/llm-summary` | POST | Generate AI summary from text |

**Request Body:**
```json
{
  "text": "Conversation to summarize",
  "prompt": "Optional custom prompt",
  "provider": "openai|claude|gemini|ollama",
  "api_key": "Optional API key"
}
```

**Response:** `{"summary": "Generated summary text"}`

---

## Version Service

### Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/versions` | POST | Create new version |
| `/versions` | GET | List all versions |
| `/versions/{id}` | GET | Get specific version |
| `/versions/{id}` | DELETE | Delete version |
| `/versions` | DELETE | Clear all versions |

### Data Operations
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/versions/upload-csv` | POST | Batch import from CSV |
| `/versions/export/csv` | GET | Export to CSV file |

### Notes Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/versions/{id}/notes` | POST | Append user note |
| `/versions/{id}/notes` | PUT | Replace all notes |
| `/versions/{id}/generate-ai-notes` | POST | Generate AI notes |

**Version Model:**
```json
{
  "id": "SH010_v001",
  "name": "SH010 - Display Name",
  "user_notes": "String",
  "ai_notes": "String",
  "transcript": "String",
  "status": "String"
}
```

---

## ShotGrid Service

### Configuration
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/shotgrid/config` | GET | Get current config |
| `/shotgrid/config` | POST | Update config |

### Projects & Playlists
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/shotgrid/active-projects` | GET | List active projects |
| `/shotgrid/latest-playlists/{project_id}` | GET | Get project playlists |
| `/shotgrid/playlist-items/{playlist_id}` | GET | Get shots/versions in playlist |

### Status & Versioning
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/shotgrid/version-statuses` | GET | Get available statuses |
| `/shotgrid/playlist-versions-with-statuses/{playlist_id}` | GET | Get versions + status |

### Utilities
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/shotgrid/validate-shot-version` | POST | Normalize shot/version input |
| `/shotgrid/most-recent-playlist-items` | GET | Get latest dailies (no ID needed) |

---

## Settings Service

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/settings` | GET | Load all settings |
| `/settings` | POST | Save all settings |
| `/settings/save-partial` | POST | Update specific settings |

**Configurable Settings:**
- ShotGrid: `shotgrid_web_url`, `shotgrid_api_key`, `shotgrid_script_name`
- LLM Keys: `openai_api_key`, `claude_api_key`, `gemini_api_key`
- LLM Prompts: `openai_prompt`, `claude_prompt`, `gemini_prompt`
- Vexa: `vexa_api_key`, `vexa_api_url`
- UI: `include_statuses`

---

## Common Workflows

### Load Latest Dailies
```bash
curl http://localhost:8000/shotgrid/most-recent-playlist-items
```

### Create Version with Notes
```bash
# 1. Create
curl -X POST http://localhost:8000/versions \
  -H "Content-Type: application/json" \
  -d '{"id":"SH010_v1","name":"Shot 010","user_notes":"","ai_notes":"","transcript":"","status":""}'

# 2. Add note
curl -X POST http://localhost:8000/versions/SH010_v1/notes \
  -H "Content-Type: application/json" \
  -d '{"version_id":"SH010_v1","note_text":"Note text"}'

# 3. Generate AI
curl -X POST http://localhost:8000/versions/SH010_v1/generate-ai-notes \
  -H "Content-Type: application/json" \
  -d '{"version_id":"SH010_v1","transcript":"Meeting transcript"}'
```

### Send Notes via Email
```bash
curl -X POST http://localhost:8000/email-notes \
  -H "Content-Type: application/json" \
  -d '{
    "email":"team@studio.com",
    "notes":[
      {"shot":"SH010","notes":"","transcription":"","summary":""}
    ]
  }'
```

### Export All Versions
```bash
curl http://localhost:8000/versions/export/csv > versions.csv
```

---

## Error Response Format

All errors follow this format:
```json
{
  "detail": "Error description"
}
```

### Common Status Codes
- `200` - Success
- `400` - Bad request / invalid input
- `404` - Resource not found
- `500` - Server error

---

## Environment Variables

### Required for ShotGrid
```
SHOTGRID_URL=https://studio.shotgridsoftware.com
SHOTGRID_SCRIPT_NAME=api_script
SHOTGRID_API_KEY=secret_key
```

### Required for LLM
At least one of:
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
```

### Required for Email
```
GMAIL_SENDER=your-email@gmail.com
# Requires: token.json, client_secret.json files
```

### Optional
```
SHOTGRID_VERSION_FIELD=code (default)
SHOTGRID_SHOT_FIELD=entity (default)
SHOTGRID_TYPE_FILTER=Commercial,Feature
DEMO_MODE=false (enables data anonymization)
VEXA_API_KEY=...
DISABLE_LLM=false (default)
```

---

## Pagination & Filtering

### ShotGrid Playlist Limit
```bash
# Get 10 latest playlists instead of 20 (default)
GET /shotgrid/latest-playlists/{project_id}?limit=10
```

---

## Demo Mode

When `DEMO_MODE=true`, ShotGrid service anonymizes:
- Project names/codes → hash-based replacements (PROJ_HASH)
- Playlist names → hash-based replacements
- Shot names → 5-char hashes
- Version numbers → 5-digit numbers

---

## Feature Status

Check `/health` endpoint to see available features:
```json
{
  "features": {
    "shotgrid": true,
    "vexa_transcription": false,
    "llm_openai": true,
    "llm_claude": false,
    "llm_gemini": false
  }
}
```

---

## Endpoint Count

**Total: 28 endpoints**
- Core: 3
- Playlist: 1
- Email: 1
- Notes (LLM): 1
- Version: 11
- ShotGrid: 9
- Settings: 3

---

## API Documentation

Interactive API docs available at:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

---

## Support & Testing

### Health Check
```bash
curl http://localhost:8000/health
```

### ShotGrid CLI Test
```bash
python shotgrid_service.py
```

---

**Version:** 1.0.0  
**Last Updated:** November 10, 2025
