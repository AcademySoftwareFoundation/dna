# DNA Dailies Notes Assistant - API Documentation

## Overview

The DNA Dailies Notes Assistant API is a FastAPI-based backend service for managing notes, versions, playlists, and integration with ShotGrid. The API provides endpoints for video review management, AI-powered note generation, and email distribution of notes.

**Base URL:** `http://localhost:8000`

**API Format:** RESTful JSON API with CORS enabled (allows all origins)

---

## Core Application Endpoints

### 1. Root Endpoint
**GET** `/`
- **Description:** API information and status
- **Response:**
  ```json
  {
    "name": "DNA Dailies Notes Assistant API",
    "version": "1.0.0",
    "status": "running",
    "docs": "/docs",
    "health": "/health"
  }
  ```

### 2. Health Check
**GET** `/health`
- **Description:** Health check endpoint for monitoring and client connectivity testing. Returns service status and availability of optional features.
- **Response:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2025-11-10T12:00:00",
    "python_version": "3.11.0",
    "features": {
      "shotgrid": true,
      "vexa_transcription": true,
      "llm_openai": true,
      "llm_claude": false,
      "llm_gemini": false
    }
  }
  ```

### 3. Configuration
**GET** `/config`
- **Description:** Return application configuration including feature availability
- **Response:**
  ```json
  {
    "shotgrid_enabled": true
  }
  ```

---

## Service 1: Playlist Service

**Router Prefix:** None (root)  
**File:** `playlist.py`

### Endpoints

#### 1.1 Upload Playlist
**POST** `/upload-playlist`
- **Description:** Upload a CSV file to extract playlist items
- **Content-Type:** `multipart/form-data`
- **Parameters:**
  - `file` (UploadFile, required): CSV file containing playlist data
    - First column contains playlist item names
    - Header row is skipped
- **Response:**
  ```json
  {
    "status": "success",
    "items": [
      "item1",
      "item2",
      "item3"
    ]
  }
  ```
- **Purpose:** Import playlist items from CSV file for batch processing

---

## Service 2: Email Service

**Router Prefix:** None (root)  
**File:** `email_service.py`

### Data Models

**EmailNotesRequest:**
```python
{
  "email": "user@example.com",  # EmailStr (valid email required)
  "notes": [
    {
      "shot": "SH010",
      "notes": "Notes text",
      "transcription": "Transcription text",
      "summary": "Summary text"
    }
  ]
}
```

### Endpoints

#### 2.1 Email Notes
**POST** `/email-notes`
- **Description:** Send notes as an HTML table to specified email address using Gmail API
- **Request Body:**
  ```json
  {
    "email": "recipient@example.com",
    "notes": [
      {
        "shot": "SH010",
        "notes": "Add more motion to the swing",
        "transcription": "Let's make it pop more",
        "summary": "Increase motion"
      }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Notes sent to recipient@example.com"
  }
  ```
- **Authentication:** Requires Gmail API credentials configured via OAuth2
  - Credentials stored in `token.json`
  - Client secret stored in `client_secret.json`
- **Purpose:** Distribute shot notes via email in formatted HTML table

---

## Service 3: Note Service (LLM Integration)

**Router Prefix:** None (root)  
**File:** `note_service.py`

### Data Models

**LLMSummaryRequest:**
```python
{
  "text": "Transcription text to summarize",  # Required: text to summarize
  "prompt": "Custom LLM prompt",             # Optional: custom prompt
  "provider": "openai",                      # Optional: "openai", "claude", "gemini", "ollama"
  "api_key": "sk-..."                        # Optional: API key if not in env vars
}
```

### Endpoints

#### 3.1 Generate LLM Summary
**POST** `/llm-summary`
- **Description:** Generate a summary using LLM for meeting transcripts. Creates abbreviated notes from conversation.
- **Request Body:**
  ```json
  {
    "text": "Director: Let's approve this version. Artist: Sure, I'll do one more pass on the hair. Director: Perfect.",
    "prompt": null,
    "provider": "openai",
    "api_key": null
  }
  ```
- **Response:**
  ```json
  {
    "summary": "Dir: Approved. Artist: One more hair pass. Dir: Confirmed."
  }
  ```
- **Supported Providers:**
  - OpenAI (gpt-4o) - requires `OPENAI_API_KEY`
  - Anthropic Claude (claude-3-sonnet-20240229) - requires `ANTHROPIC_API_KEY`
  - Google Gemini (gemini-2.5-flash-preview-05-20) - requires `GEMINI_API_KEY`
  - Ollama (llama3.2) - local, requires Ollama running on localhost:11434
- **Provider Priority:** OpenAI > Gemini > Anthropic (when no explicit provider specified)
- **Temperature:** 0.1 (low for consistent, focused summaries)
- **Max Tokens:** 1024
- **Purpose:** Convert meeting transcripts into concise action notes for artists

---

## Service 4: Version Service

**Router Prefix:** None (root)  
**File:** `version_service.py`

### Data Models

**Version:**
```python
{
  "id": "SH010_v001",           # Unique version identifier
  "name": "SH010 - Main Shot",  # Display name
  "user_notes": "String",       # User-provided notes
  "ai_notes": "String",         # AI-generated notes
  "transcript": "String",       # Full meeting transcript
  "status": "String"            # ShotGrid version status
}
```

**AddNoteRequest:**
```python
{
  "version_id": "SH010_v001",
  "note_text": "Need to increase brightness"
}
```

**UpdateNotesRequest:**
```python
{
  "version_id": "SH010_v001",
  "user_notes": "Updated notes",      # Optional
  "ai_notes": "Updated AI notes",     # Optional
  "transcript": "Updated transcript"  # Optional
}
```

**GenerateAINotesRequest:**
```python
{
  "version_id": "SH010_v001",
  "transcript": "Custom transcript",      # Optional: uses version's existing if not provided
  "prompt": "Custom LLM prompt",          # Optional
  "provider": "openai",                   # Optional: LLM provider
  "api_key": "sk-..."                     # Optional: API key
}
```

### Endpoints

#### 4.1 Upload CSV Versions
**POST** `/versions/upload-csv`
- **Description:** Upload a CSV file to create versions
- **Content-Type:** `multipart/form-data`
- **CSV Format:**
  - First column (leftmost): Version Name (required)
  - Optional "ID" column: Version ID (if not present, name is used as ID)
  - Header row is skipped
- **Parameters:**
  - `file` (UploadFile, required): CSV file
- **Response:**
  ```json
  {
    "status": "success",
    "count": 5,
    "versions": [
      {"id": "SH010", "name": "SH010 - Main"},
      {"id": "SH020", "name": "SH020 - Reaction"}
    ]
  }
  ```
- **Purpose:** Batch create versions from CSV file

#### 4.2 Create Version
**POST** `/versions`
- **Description:** Create a new version
- **Request Body:**
  ```json
  {
    "id": "SH010_v001",
    "name": "SH010 - Main Shot",
    "user_notes": "",
    "ai_notes": "",
    "transcript": "",
    "status": ""
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "version": {
      "id": "SH010_v001",
      "name": "SH010 - Main Shot",
      "user_notes": "",
      "ai_notes": "",
      "transcript": "",
      "status": ""
    }
  }
  ```
- **Purpose:** Add a new version to the system

#### 4.3 Get All Versions
**GET** `/versions`
- **Description:** Get all versions in insertion order
- **Response:**
  ```json
  {
    "status": "success",
    "count": 3,
    "versions": [
      {
        "id": "SH010_v001",
        "name": "SH010 - Main Shot",
        "user_notes": "Add more motion",
        "ai_notes": "Director requested motion increase",
        "transcript": "",
        "status": "in_progress"
      }
    ]
  }
  ```
- **Purpose:** Retrieve all versions for overview/management

#### 4.4 Get Specific Version
**GET** `/versions/{version_id}`
- **Description:** Get a specific version by ID
- **Path Parameters:**
  - `version_id` (string, required): Version identifier
- **Response:**
  ```json
  {
    "status": "success",
    "version": {
      "id": "SH010_v001",
      "name": "SH010 - Main Shot",
      "user_notes": "",
      "ai_notes": "",
      "transcript": "",
      "status": ""
    }
  }
  ```
- **Error Response (404):**
  ```json
  {
    "detail": "Version 'SH010_v001' not found"
  }
  ```
- **Purpose:** Retrieve details for a single version

#### 4.5 Add Note to Version
**POST** `/versions/{version_id}/notes`
- **Description:** Add a user note to a version (appends with "User:" prefix)
- **Path Parameters:**
  - `version_id` (string, required): Version identifier
- **Request Body:**
  ```json
  {
    "version_id": "SH010_v001",
    "note_text": "Need to increase brightness on the face"
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "version": {
      "id": "SH010_v001",
      "name": "SH010 - Main Shot",
      "user_notes": "User: Need to increase brightness on the face",
      "ai_notes": "",
      "transcript": "",
      "status": ""
    }
  }
  ```
- **Purpose:** Add user feedback notes to a version

#### 4.6 Update Notes for Version
**PUT** `/versions/{version_id}/notes`
- **Description:** Update notes for a version (replaces specified fields)
- **Path Parameters:**
  - `version_id` (string, required): Version identifier
- **Request Body:**
  ```json
  {
    "version_id": "SH010_v001",
    "user_notes": "Director approved with minor tweaks",
    "ai_notes": "AI notes here",
    "transcript": "Full meeting transcript"
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "version": {
      "id": "SH010_v001",
      "name": "SH010 - Main Shot",
      "user_notes": "Director approved with minor tweaks",
      "ai_notes": "AI notes here",
      "transcript": "Full meeting transcript",
      "status": ""
    }
  }
  ```
- **Purpose:** Update version notes (user, AI, or transcript)

#### 4.7 Generate AI Notes from Transcript
**POST** `/versions/{version_id}/generate-ai-notes`
- **Description:** Generate AI notes from transcript for a version using LLM
- **Path Parameters:**
  - `version_id` (string, required): Version identifier
- **Request Body:**
  ```json
  {
    "version_id": "SH010_v001",
    "transcript": "Director: Let's approve. Artist: Thanks!",
    "prompt": "Create brief action notes",
    "provider": "openai",
    "api_key": null
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "version": {
      "id": "SH010_v001",
      "name": "SH010 - Main Shot",
      "user_notes": "",
      "ai_notes": "Dir: Approved version",
      "transcript": "Director: Let's approve. Artist: Thanks!",
      "status": ""
    }
  }
  ```
- **Error Response (400):** When no transcript available
  ```json
  {
    "detail": "No transcript available for AI note generation"
  }
  ```
- **Purpose:** Automatically generate notes from transcript using AI/LLM

#### 4.8 Delete Version
**DELETE** `/versions/{version_id}`
- **Description:** Delete a specific version
- **Path Parameters:**
  - `version_id` (string, required): Version identifier
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Version 'SH010_v001' deleted"
  }
  ```
- **Purpose:** Remove a version from the system

#### 4.9 Clear All Versions
**DELETE** `/versions`
- **Description:** Delete all versions
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Cleared 5 versions"
  }
  ```
- **Purpose:** Reset all versions (use with caution)

#### 4.10 Export Versions to CSV
**GET** `/versions/export/csv`
- **Description:** Export all versions and their notes to CSV format
- **Response Type:** CSV file (streaming response)
- **CSV Columns:** Version, Note, Transcript
- **File Name:** `versions_export.csv`
- **Purpose:** Export version data for external analysis or reporting

---

## Service 5: ShotGrid Service

**Router Prefix:** `/shotgrid`  
**File:** `shotgrid_service.py`

### Data Models

**ShotGridConfigRequest:**
```python
{
  "shotgrid_url": "https://studio.shotgridsoftware.com",    # Optional
  "script_name": "api_script_name",                          # Optional
  "api_key": "api_key_value"                                 # Optional
}
```

**ValidateShotVersionRequest:**
```python
{
  "input_value": "12345",           # Version number or shot/asset name
  "project_id": 123                 # Optional: limit search to project
}
```

### Endpoints

#### 5.1 Update ShotGrid Configuration
**POST** `/shotgrid/config`
- **Description:** Update ShotGrid configuration at runtime
- **Request Body:**
  ```json
  {
    "shotgrid_url": "https://studio.shotgridsoftware.com",
    "script_name": "api_script",
    "api_key": "secret_key"
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "message": "ShotGrid configuration updated",
    "config": {
      "shotgrid_url": "https://studio.shotgridsoftware.com",
      "script_name": "api_script",
      "api_key_set": true
    }
  }
  ```
- **Purpose:** Configure ShotGrid API connection (sensitive data not returned)

#### 5.2 Get ShotGrid Configuration
**GET** `/shotgrid/config`
- **Description:** Get current ShotGrid configuration (excluding sensitive data)
- **Response:**
  ```json
  {
    "status": "success",
    "config": {
      "shotgrid_url": "https://studio.shotgridsoftware.com",
      "script_name": "api_script",
      "api_key_set": true
    }
  }
  ```
- **Purpose:** Verify ShotGrid configuration without exposing API key

#### 5.3 Get Active Projects
**GET** `/shotgrid/active-projects`
- **Description:** Fetch all active projects from ShotGrid, filtered by sg_status='Active' and sg_type in configured type list
- **Query Parameters:** None
- **Response:**
  ```json
  {
    "status": "success",
    "projects": [
      {
        "id": 101,
        "code": "PROJ_A",
        "name": "Project Alpha",
        "created_at": "2024-01-15T10:00:00Z",
        "sg_type": "Commercial"
      }
    ]
  }
  ```
- **Demo Mode:** Anonymizes project names and codes with hash-based replacements
- **Purpose:** List available projects for dailies review

#### 5.4 Get Latest Playlists for Project
**GET** `/shotgrid/latest-playlists/{project_id}`
- **Description:** Fetch latest playlists for a given project
- **Path Parameters:**
  - `project_id` (integer, required): Project ID
- **Query Parameters:**
  - `limit` (integer, optional, default: 20): Maximum number of playlists to return
- **Response:**
  ```json
  {
    "status": "success",
    "playlists": [
      {
        "id": 501,
        "code": "DAILY_001",
        "created_at": "2024-11-10T09:00:00Z",
        "updated_at": "2024-11-10T10:30:00Z"
      }
    ]
  }
  ```
- **Purpose:** Get recent dailies playlists for a project

#### 5.5 Get Playlist Items (Shot/Version Names)
**GET** `/shotgrid/playlist-items/{playlist_id}`
- **Description:** Fetch list of shot/version names from a playlist
- **Path Parameters:**
  - `playlist_id` (integer, required): Playlist ID
- **Response:**
  ```json
  {
    "status": "success",
    "items": [
      "SH010/v001",
      "SH020/v002",
      "SH030/v001"
    ]
  }
  ```
- **Format:** `{shot_name}/{version_name}`
- **Purpose:** Get individual shots/versions in a playlist

#### 5.6 Get Version Statuses
**GET** `/shotgrid/version-statuses`
- **Description:** Get available version statuses from ShotGrid with display names
- **Query Parameters:**
  - `project_id` (integer, optional): Limit to statuses used in specific project (currently ignored - returns all)
- **Response:**
  ```json
  {
    "status": "success",
    "statuses": {
      "fin": "Final",
      "wip": "Work in Progress",
      "rev": "Revisions",
      "omt": "On Motion"
    }
  }
  ```
- **Purpose:** Get valid status codes and their display names

#### 5.7 Get Playlist Versions with Statuses
**GET** `/shotgrid/playlist-versions-with-statuses/{playlist_id}`
- **Description:** Get version details including statuses from a playlist
- **Path Parameters:**
  - `playlist_id` (integer, required): Playlist ID
- **Response:**
  ```json
  {
    "status": "success",
    "versions": [
      {
        "name": "SH010/v001",
        "status": "wip"
      },
      {
        "name": "SH020/v002",
        "status": "fin"
      }
    ]
  }
  ```
- **Purpose:** Get shot versions with their current status for progress tracking

#### 5.8 Validate Shot/Version Input
**POST** `/shotgrid/validate-shot-version`
- **Description:** Validate shot/version input and return proper format. Accepts version numbers or shot/asset names.
- **Request Body:**
  ```json
  {
    "input_value": "SH010",
    "project_id": 101
  }
  ```
- **Response (Version Input - numeric):**
  ```json
  {
    "status": "success",
    "success": true,
    "shot_version": "SH010/v001",
    "message": "Found version 12345",
    "type": "version"
  }
  ```
- **Response (Shot Name Input - text):**
  ```json
  {
    "status": "success",
    "success": true,
    "shot_version": "SH010/v003",
    "message": "Found shot SH010",
    "type": "shot"
  }
  ```
- **Response (Asset Input - text):**
  ```json
  {
    "status": "success",
    "success": true,
    "shot_version": "ASSET_CHAR_01/v002",
    "message": "Found asset ASSET_CHAR_01",
    "type": "asset"
  }
  ```
- **Response (Not Found):**
  ```json
  {
    "status": "success",
    "success": false,
    "shot_version": null,
    "message": "Shot/asset 'INVALID' not found",
    "type": "shot"
  }
  ```
- **Logic:**
  - If input is numeric: searches for version by number
  - If input is text: searches for shot, then asset
  - Returns latest version for found shot/asset
- **Purpose:** Normalize user input to shot/version format

#### 5.9 Get Most Recent Playlist Items
**GET** `/shotgrid/most-recent-playlist-items`
- **Description:** Get items from most recent playlist of most recent project (convenience endpoint)
- **Response:**
  ```json
  {
    "status": "success",
    "project": {
      "id": 101,
      "code": "PROJ_A",
      "name": "Project Alpha",
      "created_at": "2024-01-15T10:00:00Z"
    },
    "playlist": {
      "id": 501,
      "code": "DAILY_001",
      "created_at": "2024-11-10T09:00:00Z",
      "updated_at": "2024-11-10T10:30:00Z"
    },
    "items": [
      "SH010/v001",
      "SH020/v002"
    ]
  }
  ```
- **Purpose:** Quick access to latest dailies without needing project/playlist IDs

---

## Service 6: Settings Service

**Router Prefix:** `/settings`  
**File:** `settings_service.py`

### Data Models

**Settings:**
```python
{
  # ShotGrid Configuration
  "shotgrid_web_url": "https://studio.shotgridsoftware.com",
  "shotgrid_api_key": "api_key",
  "shotgrid_script_name": "script_name",
  
  # Vexa Configuration (Transcription)
  "vexa_api_key": "vexa_key",
  "vexa_api_url": "https://api.vexa.ai",
  
  # LLM API Keys
  "openai_api_key": "sk-...",
  "claude_api_key": "claude_key",
  "gemini_api_key": "gemini_key",
  
  # LLM Custom Prompts
  "openai_prompt": "Custom prompt for OpenAI",
  "claude_prompt": "Custom prompt for Claude",
  "gemini_prompt": "Custom prompt for Gemini",
  
  # UI Settings
  "include_statuses": true
}
```

### Endpoints

#### 6.1 Get Settings
**GET** `/settings`
- **Description:** Load all settings from .env file
- **Response:**
  ```json
  {
    "status": "success",
    "settings": {
      "shotgrid_web_url": "https://studio.shotgridsoftware.com",
      "shotgrid_api_key": "***",
      "openai_api_key": "sk-...",
      "include_statuses": true
    }
  }
  ```
- **Purpose:** Retrieve current application settings

#### 6.2 Update Settings
**POST** `/settings`
- **Description:** Update settings and save to .env file. Replaces all settings.
- **Request Body:**
  ```json
  {
    "shotgrid_web_url": "https://studio.shotgridsoftware.com",
    "shotgrid_api_key": "new_key",
    "openai_api_key": "sk-new...",
    "include_statuses": true
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Settings saved successfully"
  }
  ```
- **Purpose:** Update all application settings

#### 6.3 Save Partial Settings
**POST** `/settings/save-partial`
- **Description:** Save partial settings (only provided fields) to .env file. Merges with existing settings.
- **Request Body:**
  ```json
  {
    "openai_api_key": "sk-new...",
    "include_statuses": false
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Settings saved successfully"
  }
  ```
- **Purpose:** Update specific settings without replacing others

---

## Summary Table of All Endpoints

| Method | Endpoint | Service | Purpose |
|--------|----------|---------|---------|
| GET | `/` | Core | API information |
| GET | `/health` | Core | Health check with feature status |
| GET | `/config` | Core | Application configuration |
| POST | `/upload-playlist` | Playlist | Upload CSV playlist |
| POST | `/email-notes` | Email | Send notes via Gmail |
| POST | `/llm-summary` | Notes | Generate LLM summary |
| POST | `/versions/upload-csv` | Version | Batch create versions from CSV |
| POST | `/versions` | Version | Create single version |
| GET | `/versions` | Version | Get all versions |
| GET | `/versions/{version_id}` | Version | Get specific version |
| POST | `/versions/{version_id}/notes` | Version | Add note to version |
| PUT | `/versions/{version_id}/notes` | Version | Update version notes |
| POST | `/versions/{version_id}/generate-ai-notes` | Version | Generate AI notes |
| DELETE | `/versions/{version_id}` | Version | Delete version |
| DELETE | `/versions` | Version | Clear all versions |
| GET | `/versions/export/csv` | Version | Export versions to CSV |
| POST | `/shotgrid/config` | ShotGrid | Update ShotGrid config |
| GET | `/shotgrid/config` | ShotGrid | Get ShotGrid config |
| GET | `/shotgrid/active-projects` | ShotGrid | List active projects |
| GET | `/shotgrid/latest-playlists/{project_id}` | ShotGrid | Get project playlists |
| GET | `/shotgrid/playlist-items/{playlist_id}` | ShotGrid | Get playlist items |
| GET | `/shotgrid/version-statuses` | ShotGrid | Get version statuses |
| GET | `/shotgrid/playlist-versions-with-statuses/{playlist_id}` | ShotGrid | Get versions with status |
| POST | `/shotgrid/validate-shot-version` | ShotGrid | Validate shot/version input |
| GET | `/shotgrid/most-recent-playlist-items` | ShotGrid | Get latest dailies items |
| GET | `/settings` | Settings | Get all settings |
| POST | `/settings` | Settings | Update all settings |
| POST | `/settings/save-partial` | Settings | Update specific settings |

**Total Endpoints:** 28

---

## Authentication & Configuration

### Environment Variables

The API uses environment variables (typically in `.env` file) for configuration:

#### ShotGrid Configuration
- `SHOTGRID_URL` - ShotGrid instance URL
- `SHOTGRID_SCRIPT_NAME` - API script name
- `SHOTGRID_API_KEY` - API authentication key
- `SHOTGRID_VERSION_FIELD` - Custom field for version name (default: "code")
- `SHOTGRID_SHOT_FIELD` - Custom field for shot reference (default: "entity")
- `SHOTGRID_TYPE_FILTER` - Comma-separated project types to filter
- `DEMO_MODE` - Enable data anonymization for demos

#### LLM Configuration
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic Claude API key
- `GEMINI_API_KEY` - Google Gemini API key
- `DISABLE_LLM` - Disable LLM functionality (default: true)

#### Email Configuration
- `GMAIL_SENDER` - Gmail sender address
- Requires OAuth2 token files: `token.json`, `client_secret.json`

#### Other
- `VEXA_API_KEY` - Vexa transcription service API key

### CORS Configuration

The API allows requests from all origins:
```python
allow_origins=["*"]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```

---

## Data Storage

### In-Memory Storage

The following services use in-memory dictionaries (not persistent):
- **Version Service** (`_versions`, `_version_order`)
- Note: Data is lost on server restart

### File-Based Storage

- **Settings Service** - Stores settings in `.env` file in backend directory
- **Email Service** - Reads Gmail credentials from `token.json` and `client_secret.json`

### External Storage

- **ShotGrid Service** - Queries ShotGrid database via API

---

## Error Handling

### Standard Error Response Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- `200 OK` - Request succeeded
- `400 Bad Request` - Invalid input or missing required data
- `404 Not Found` - Resource not found (e.g., version ID doesn't exist)
- `500 Internal Server Error` - Server error or service integration failure

---

## Usage Examples

### Example 1: Create Version and Add Notes

```bash
# 1. Create a version
curl -X POST http://localhost:8000/versions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "SH010_v001",
    "name": "SH010 - Main Shot",
    "user_notes": "",
    "ai_notes": "",
    "transcript": "",
    "status": ""
  }'

# 2. Add a user note
curl -X POST http://localhost:8000/versions/SH010_v001/notes \
  -H "Content-Type: application/json" \
  -d '{
    "version_id": "SH010_v001",
    "note_text": "Add more motion to the swing"
  }'

# 3. Generate AI notes from transcript
curl -X POST http://localhost:8000/versions/SH010_v001/generate-ai-notes \
  -H "Content-Type: application/json" \
  -d '{
    "version_id": "SH010_v001",
    "transcript": "Director: Let'\''s increase the swing motion. Artist: I'\''ll add more arc.",
    "provider": "openai"
  }'
```

### Example 2: Validate ShotGrid Input and Get Playlist Items

```bash
# 1. Validate shot name
curl -X POST http://localhost:8000/shotgrid/validate-shot-version \
  -H "Content-Type: application/json" \
  -d '{
    "input_value": "SH010",
    "project_id": 101
  }'

# 2. Get active projects
curl -X GET http://localhost:8000/shotgrid/active-projects

# 3. Get latest playlists for project
curl -X GET "http://localhost:8000/shotgrid/latest-playlists/101?limit=5"

# 4. Get items from playlist
curl -X GET http://localhost:8000/shotgrid/playlist-items/501
```

### Example 3: Email Notes to Team

```bash
curl -X POST http://localhost:8000/email-notes \
  -H "Content-Type: application/json" \
  -d '{
    "email": "team@studio.com",
    "notes": [
      {
        "shot": "SH010",
        "notes": "Add more motion to swing",
        "transcription": "Director: Increase the arc. Artist: OK",
        "summary": "Increase motion - approved"
      },
      {
        "shot": "SH020",
        "notes": "Lighting approved",
        "transcription": "Director: This looks good.",
        "summary": "Lighting final"
      }
    ]
  }'
```

---

## Integration Patterns

### Workflow: Complete Dailies Review

1. **Retrieve Dailies**
   - GET `/shotgrid/most-recent-playlist-items` or
   - GET `/shotgrid/active-projects` → GET `/shotgrid/latest-playlists/{id}` → GET `/shotgrid/playlist-items/{id}`

2. **Create Versions** (if not from ShotGrid)
   - POST `/versions/upload-csv` (batch) or POST `/versions` (individual)

3. **Add Notes**
   - POST `/versions/{id}/notes` (user notes) or
   - PUT `/versions/{id}/notes` (replace all notes)

4. **Generate AI Summary**
   - POST `/versions/{id}/generate-ai-notes` (from transcript)

5. **Export/Share**
   - GET `/versions/export/csv` (download) or
   - POST `/email-notes` (send via email)

---

## Performance Considerations

- **Batch Operations:** Use CSV upload endpoints for bulk data import
- **LLM Calls:** Generate AI notes asynchronously (background tasks for email service)
- **ShotGrid Queries:** Use query parameters (`limit`) to reduce data transfer
- **Streaming:** Version CSV export uses streaming response for large datasets

---

## Testing

The ShotGrid service includes a CLI test mode. From backend directory:

```bash
python shotgrid_service.py

# Test options:
# 1. List active projects
# 2. List playlists for project
# 3. Get shot/version items from playlist
# 4. Test shot/version validation
```

---

## Version History

**Current Version:** 1.0.0

**Services Included:**
1. Playlist Service - CSV playlist import
2. Email Service - Gmail integration with HTML tables
3. Note Service - Multi-provider LLM integration
4. Version Service - Version/shot management
5. ShotGrid Service - ShotGrid API integration
6. Settings Service - Configuration management

**Last Updated:** November 10, 2025
