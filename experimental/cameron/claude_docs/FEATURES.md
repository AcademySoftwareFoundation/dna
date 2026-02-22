# DNA Dailies Notes Assistant - Feature List

Complete documentation of all user-facing and API features in the frontend_v3 application.

---

## Table of Contents

- [User Interface Features](#user-interface-features)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [API/Backend Features](#apibackend-features)
- [External Integrations](#external-integrations)
- [Import/Export Features](#importexport-features)
- [Version Management](#version-management)
- [Note-taking Features](#note-taking-features)
- [Settings & Configuration](#settings--configuration)

---

## User Interface Features

### Window Management
- **Main Application Window**: 1400x800 default size, minimum 1100x750 (with all sections visible)
- **Dynamic Window Resizing**: Automatically adjusts when toggling sections
- **Collapsible Sections**:
  - Upper widgets (Meeting, LLM, Playlists) - toggleable via `Ctrl+Shift+U`
  - Version list sidebar - toggleable via `Ctrl+Shift+S` with animated window resize
  - Adjustable version list width (320px default, minimum 250px, draggable)

### Theme Customization
- **Theme Manager** with 8 customizable colors:
  - Background Color
  - Card Background
  - Accent Color
  - Accent Hover Color
  - Border Color
  - Text Color
  - Muted Text Color
  - Input Background
- **Border Radius Slider**: 0-20px adjustable rounded corners
- **Theme Customizer Dialog**: Visual color picker with RGB/HSL sliders
- **Preset Colors**: Quick selection of common colors
- **Real-time Preview**: All theme changes apply immediately across the entire UI
- **Professional Color Picker**: ORI RPA color picker integration with advanced controls

### Version Management UI
- **Version List View**: Scrollable sidebar showing all loaded versions
- **Version Selection**: Click to select, visual highlighting of current version
- **Keyboard Navigation**: `Ctrl+Shift+Up/Down` to navigate versions
- **Auto-select**: First version automatically selected when playlist loads
- **Version Display**: Shows version name/ID
- **Current Version Indicator**: Highlighted in accent color with clear visual feedback

### Notes Interface
- **Split View Layout**: Resizable sections with drag handle between areas
- **Tabbed Content Area**:
  - **AI Notes Tab**: Display AI-generated summaries
    - Read-only formatted text area
    - Regenerate button (↻) - `Ctrl+Shift+R`
    - Add to notes button - `Ctrl+Shift+A`
  - **Transcript Tab**: Real-time meeting transcript
    - Auto-scroll to bottom (when user is at bottom)
    - Smart scroll behavior (stays in place if user scrolled up)
    - Speaker attribution
    - Read-only display
- **Notes Entry Area**: Multi-line text input for per-version manual notes
  - Auto-save on text change
  - Per-version storage
  - Scrollable for long notes
- **Status Dropdown**: Version status selection (when ShotGrid status toggle enabled)
  - Loads available statuses from ShotGrid
  - Updates version status in ShotGrid on change
  - Only visible when "Include Statuses" is enabled in preferences

### Meeting Widget
- **Meeting URL/ID Input**: Text field supporting multiple platforms
  - Google Meet URLs (meet.google.com)
  - Zoom meeting URLs or IDs
  - Microsoft Teams URLs
  - Auto-parsing of meeting IDs from URLs
- **Join/Leave Meeting Button**: Toggle button with dynamic label
  - "Join Meeting" when disconnected
  - "Leave Meeting" when connected
- **Visual Status Indicator**:
  - ○ Disconnected (gray)
  - ⏳ Connecting (yellow/animated)
  - ✓ Connected (green)
  - ✗ Error (red)
- **Real-time Transcript Streaming**: 1-second polling interval
- **Meeting Platform Detection**: Automatic platform identification

### LLM Assistant Widget
- **Three Provider Tabs**: OpenAI, Claude, Gemini
- **Per-provider Configuration**:
  - Custom prompt text area (multi-line)
  - Editable prompts with save-on-change
  - Provider-specific prompt storage
- **Default Prompt**: Pre-configured for dailies review meeting summarization
  - Focused on key feedback points
  - Decision tracking (approved/finalled shots)
  - Actionable tasks for artists
  - Concise, bullet-point style
- **Generate Notes Button**: Creates AI summary from current transcript
- **Smart Provider Selection**: Automatically uses first available API key

### Playlists Widget
- **Two Playlist Sources**:
  
  **1. Flow PTR Playlist (ShotGrid Integration)**:
  - Project Dropdown:
    - Loads active ShotGrid projects on click
    - Shows project names
    - Refreshes project list
  - Playlist Dropdown:
    - Loads latest 10 playlists for selected project
    - Shows playlist name and creation date
    - Auto-refresh on project change
  - "Load Playlist" Button:
    - Imports all versions from selected playlist
    - Auto-selects first version
    - Clears any existing versions
  
  **2. CSV Playlist**:
  - "Import CSV" Button: Opens file picker for CSV import
  - "Export CSV" Button: Saves current versions to CSV file
  - Format Instructions: Inline help text explaining CSV structure
  - First column = version names
  - Header row automatically skipped

### Menu Bar

**File Menu**:
- Import CSV... - Import versions from CSV file
- Export CSV... - Export versions to CSV file
- Reset Workspace - Clear all versions and notes (with confirmation)
- Exit - Quit application

**View Menu**:
- Hide/Show Upper Widgets - Toggle Meeting/LLM/Playlists section
- Hide/Show Versions List - Toggle version sidebar
- Theme Customizer - Open theme customization dialog

**Help Menu**:
- Preferences - Open preferences dialog
- About - Show application information

### Dialogs

**Preferences Dialog** - 4 tabs with comprehensive settings:

1. **ShotGrid Tab**:
   - ShotGrid URL field (e.g., https://yoursite.shotgrid.autodesk.com)
   - API Key field (password protected)
   - Script Name field
   - Include Statuses toggle (enable/disable status dropdown in UI)

2. **Vexa Tab**:
   - API Key field (password protected)
   - API URL field (default: https://api.cloud.vexa.ai)

3. **LLMs Tab**:
   - OpenAI API Key (password protected)
   - Claude API Key (password protected)
   - Gemini API Key (password protected)
   - Note: Prompts configured in LLM widget tabs

4. **Key Bindings Tab**:
   - Complete reference list of all keyboard shortcuts
   - Organized by category (View, Version, Notes, AI)

**Other Dialogs**:
- **Theme Customizer**: Color picker with RGB/HSL sliders and presets
- **Reset Workspace**: Confirmation dialog before clearing all data
- **CSV Import/Export**: Native file picker dialogs
- **About Dialog**: Application name, version, description

---

## Keyboard Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| **Ctrl+Shift+T** | Theme Customizer | Open theme customization dialog |
| **Ctrl+Shift+P** | Preferences | Open preferences/settings dialog |
| **Ctrl+Shift+U** | Toggle Upper Widgets | Show/hide Meeting, LLM, and Playlists widgets |
| **Ctrl+Shift+S** | Toggle Versions List | Show/hide version sidebar (animates window) |
| **Ctrl+Shift+Up** | Previous Version | Navigate to previous version in list |
| **Ctrl+Shift+Down** | Next Version | Navigate to next version in list |
| **Ctrl+Shift+A** | Add AI Notes | Append AI-generated notes to current manual notes |
| **Ctrl+Shift+R** | Regenerate AI Notes | Request new AI summary from current transcript |
| **Ctrl+Shift+D** | Toggle Notes/Transcript | Switch between AI Notes and Transcript tabs |

---

## API/Backend Features

### Version Management Endpoints

**GET /versions**
- Fetch all versions
- Returns: Array of version objects with id, name, notes, ai_notes, transcript, status

**GET /versions/{version_id}**
- Get specific version details
- Returns: Single version object

**POST /versions**
- Create new version
- Body: `{"version_name": "string"}`
- Returns: Created version object

**PUT /versions/{version_id}/notes**
- Update version notes and/or transcript
- Body: `{"notes": "string", "transcript": "string"}`
- Returns: Success/error status

**POST /versions/{version_id}/notes**
- Append note to version (doesn't overwrite)
- Body: `{"note": "string"}`
- Returns: Success/error status

**POST /versions/{version_id}/generate-ai-notes**
- Generate AI summary from transcript
- Body: `{"provider": "openai|claude|gemini", "prompt": "string"}`
- Returns: `{"ai_notes": "string"}`

**DELETE /versions**
- Clear all versions (reset workspace)
- Returns: Success/error status

**POST /versions/upload-csv**
- Import versions from CSV file
- Body: Multipart form data with CSV file
- Returns: Array of created versions

**GET /versions/export/csv**
- Export versions to CSV format
- Returns: CSV file download

### Settings/Configuration Endpoints

**GET /settings**
- Load all settings from backend .env file
- Returns: Object with all configuration values

**POST /settings/save-partial**
- Save individual setting to .env file
- Body: `{"setting_name": "value"}`
- Returns: Success/error status

**GET /config**
- Get application configuration
- Returns: Backend configuration and feature flags

**GET /health**
- Service health check
- Returns: Health status and feature availability:
  - Python version
  - Timestamp
  - Features enabled (ShotGrid, Vexa, LLM providers)

### Note Management

- **Per-version Notes**: Each version maintains separate notes, AI notes, and transcript
- **Auto-save**: Notes automatically saved to backend on change
- **Staging Area**: Temporary note buffer before committing
- **AI Notes Integration**: Seamless addition of AI-generated content to user notes
- **Transcript Association**: Each version links to its specific meeting transcript segments

---

## External Integrations

### ShotGrid Integration

**Project Management**:
- **GET /shotgrid/active-projects**: List all active projects
  - Returns: Array of `{id, name}` objects
  - Filters: Only projects with `sg_status = "Active"`
- **Project Selection**: Dropdown populated with active projects

**Playlist Management**:
- **GET /shotgrid/latest-playlists/{project_id}**: Get recent playlists
  - Returns: Latest 10 playlists for project
  - Sorted by creation date (newest first)
  - Data: `{id, code, created_at}`
- **GET /shotgrid/playlist-items/{playlist_id}**: Get versions in playlist
  - Returns: All versions linked to playlist
  - Data: Version code/name for each item
  - Auto-creates versions in app on load

**Version Status Management**:
- **GET /shotgrid/version-statuses**: Get available status codes
  - Returns: Array of valid status codes (e.g., "rev", "fin", "apr")
  - Used to populate status dropdown
- **GET /shotgrid/playlist-versions-with-statuses/{playlist_id}**: Get versions with current status
  - Returns: Versions with their current ShotGrid status
  - Used when "Include Statuses" is enabled
- **PUT /versions/{version_id}/status**: Update version status
  - Body: `{"status": "status_code"}`
  - Updates status in both app and ShotGrid
  - Requires ShotGrid connection

**Configuration**:
- **POST /shotgrid/config**: Update ShotGrid credentials
  - Body: `{"url": "string", "script_name": "string", "api_key": "string"}`
  - Validates and saves credentials
  - Auto-updates .env file
- **Settings**: Stored in backend .env:
  - `SHOTGRID_URL`: Base URL (e.g., https://studio.shotgrid.autodesk.com)
  - `SHOTGRID_SCRIPT_NAME`: Script/bot name
  - `SHOTGRID_API_KEY`: Authentication key

### Vexa Meeting Integration

**Meeting Platforms Supported**:
- Google Meet (meet.google.com URLs)
- Zoom (zoom.us URLs or meeting IDs)
- Microsoft Teams (teams.microsoft.com URLs)

**Transcription Features**:
- **Start Transcription**: Join meeting with Vexa bot
  - POST to Vexa API with meeting URL/ID
  - Platform auto-detection
  - Custom bot name support
  - Language detection (or manual selection)
- **Stop Transcription**: Leave meeting and stop bot
  - Graceful bot removal
  - Final transcript fetch
- **Real-time Updates**: 1-second polling interval
  - Fetches new transcript segments
  - Speaker attribution
  - Timestamp tracking
- **Multi-language Support**: Auto-detect or manual language selection

**Transcript Routing** (Version-specific capture):
- **Activation Tracking**: Timestamp when version is selected
- **Segment Filtering**: Only captures segments after version activation
- **Duplicate Prevention**: 
  - Tracks segment IDs
  - Skips already-seen segments
  - Prevents transcript duplication when switching versions
- **Auto-save**: Transcript automatically saved to active version
- **Background Polling**: Non-blocking QTimer-based updates

**API Configuration**:
- **Vexa API Endpoint**: Configurable (default: https://api.cloud.vexa.ai)
- **API Key**: Required for authentication
- **Meeting ID Parsing**: Extracts meeting ID from various URL formats
- **Settings Storage**: Saved in backend .env file

**Error Handling**:
- Connection errors with user-friendly messages
- API rate limit detection (e.g., concurrent bot limit)
- Graceful degradation on network issues
- Retry logic for transient failures

### LLM Integration (AI Notes Generation)

**Supported Providers**:
1. **OpenAI** (GPT-3.5, GPT-4, etc.)
   - API Key: `OPENAI_API_KEY`
   - Endpoint: OpenAI API
   - Custom prompt per provider
   
2. **Claude** (Anthropic)
   - API Key: `CLAUDE_API_KEY`
   - Endpoint: Anthropic API
   - Custom prompt per provider
   
3. **Gemini** (Google)
   - API Key: `GEMINI_API_KEY`
   - Endpoint: Google AI API
   - Custom prompt per provider

**Features**:
- **Provider Auto-selection**: Uses first available API key
- **Custom Prompts**: Per-provider prompt customization
- **Default Prompt Template**: Optimized for dailies review meetings
  - Focus: Key feedback points, decisions, actionable tasks
  - Style: Concise, bullet-point format
  - Context: VFX/animation artist review meetings
- **Generate Notes**: POST to backend with transcript and selected provider
- **Streaming**: Future support for streaming responses
- **Error Handling**: Graceful fallback on API errors

**Default Prompt** (all providers):
```
You are a helpful assistant that reviews transcripts of artist review meetings and generates concise, readable summaries of the discussions.

The meetings are focused on reviewing creative work submissions ("shots") for a movie. Each meeting involves artists and reviewers (supervisors, leads, etc.) discussing feedback, decisions, and next steps for each shot.

Your goal is to recreate short, clear, and accurate abbreviated conversations that capture:
- Key feedback points
- Decisions made (e.g., approved/finalled shots)
- Any actionable tasks for the artist

Write in a concise, natural tone that's easy for artists to quickly scan and understand what was said and what they need to do next.

Make your responses more bullet pointy.
```

**API Endpoint**:
- **POST /versions/{version_id}/generate-ai-notes**
  - Body: `{"provider": "openai|claude|gemini", "prompt": "custom_prompt_text"}`
  - Returns: `{"ai_notes": "generated_summary_text"}`

---

## Import/Export Features

### CSV Import
- **File Format**: Standard CSV with versions in first column
- **Header Handling**: Automatically skips header row if present
- **Version Creation**: Creates new version for each row
- **Endpoint**: POST /versions/upload-csv
- **Error Handling**: Reports errors for malformed CSV
- **UI Access**: 
  - File → Import CSV
  - Playlists Widget → CSV → Import button
- **File Picker**: Native OS file selection dialog

### CSV Export
- **Export Format**: CSV with version data
- **Columns Included**:
  - Version name/ID
  - User notes
  - AI-generated notes
  - Transcript
  - Status (if enabled)
- **Endpoint**: GET /versions/export/csv
- **File Download**: Browser-style download prompt
- **UI Access**:
  - File → Export CSV
  - Playlists Widget → CSV → Export button
- **File Picker**: Native OS save dialog with suggested filename

### ShotGrid Playlist Import
- **Source**: ShotGrid playlists via API
- **Format**: Shot/version structure from ShotGrid
- **Auto-create Versions**: Versions automatically created from playlist items
- **Status Import**: Optional import of version statuses (when enabled)
- **Batch Loading**: Efficient bulk version creation
- **Project Context**: Maintains project association
- **UI Flow**:
  1. Select Project
  2. Select Playlist
  3. Click "Load Playlist"
  4. Versions populate in sidebar

---

## Version Management

### Version Data Structure
Each version contains:
- **Version ID**: Unique identifier (auto-generated)
- **Version Name**: Display name (from playlist, CSV, or manual entry)
- **User Notes**: Manual notes entered by user
- **AI Notes**: AI-generated summary from transcript
- **Transcript**: Meeting transcript segments specific to this version
- **Status**: Version status code (optional, ShotGrid-linked)
- **Timestamps**: Creation and modification times

### Version Operations

**Create**:
- Manual: POST /versions with version name
- From CSV: Batch import via CSV file
- From ShotGrid: Import from playlist
- Auto-naming: Supports various naming conventions

**Select**:
- Click in sidebar
- Keyboard navigation (Up/Down arrows)
- Auto-select first on playlist load
- Visual highlighting of selected version

**Update**:
- Edit notes: Auto-save on text change
- Update transcript: Append new segments from meeting
- Change status: Dropdown selection (if enabled)
- Generate AI notes: Button or keyboard shortcut

**Delete**:
- Reset Workspace: Clears all versions
- Confirmation dialog before deletion
- Permanent removal from storage

**Navigate**:
- Previous: Ctrl+Shift+Up
- Next: Ctrl+Shift+Down
- Mouse click: Direct selection
- Auto-scroll: Version list scrolls to keep selection visible

### Version-specific Transcript Capture

**How it works**:
1. User selects a version from sidebar
2. Activation timestamp recorded
3. Meeting segments tracked by ID
4. Only NEW segments (after activation) captured
5. Segments appended to version's transcript
6. Auto-saved to backend

**Key Features**:
- **Activation Tracking**: Records exact moment version becomes active
- **Segment Filtering**: Timestamp-based filtering of meeting segments
- **Duplicate Prevention**: 
  - Each segment has unique ID
  - Tracks seen segment IDs per session
  - Skips previously processed segments
- **Version Isolation**: Each version's transcript is independent
- **Real-time Updates**: 1-second polling for new segments
- **Background Processing**: Non-blocking UI updates

**Technical Implementation**:
- `_version_activation_time`: Timestamp of version selection
- `_seen_segment_ids`: Set of processed segment IDs
- `_mark_current_segments_as_seen()`: Initial marking on version switch
- `_poll_transcription()`: Periodic fetch and filter of new segments

---

## Note-taking Features

### AI-Assisted Notes

**Generate AI Notes**:
- **Trigger**: "Generate Notes" button or Ctrl+Shift+R
- **Process**:
  1. Extracts transcript from current version
  2. Sends to backend with selected LLM provider
  3. Backend calls provider API with custom prompt
  4. Returns AI-generated summary
  5. Displays in AI Notes tab
- **Provider Selection**: Automatic based on API key availability
- **Custom Prompts**: Per-provider prompt customization
- **Error Handling**: User-friendly error messages on failure

**Regenerate AI Notes**:
- Same as Generate, but overwrites existing AI notes
- Useful when transcript has been updated
- Keyboard shortcut: Ctrl+Shift+R

**Add AI Notes to Manual Notes**:
- **Trigger**: "Add to Notes" button or Ctrl+Shift+A
- **Behavior**: Appends AI notes to user notes area
- **Non-destructive**: Doesn't overwrite existing notes
- **Use Case**: Review AI summary, then integrate with manual notes

### Manual Notes

**Per-version Storage**:
- Each version has independent notes field
- Switching versions loads that version's notes
- No cross-contamination between versions

**Rich Text Input**:
- Multi-line text area
- Scrollable for long notes
- Word wrap enabled
- Standard text editing (cut, copy, paste)

**Auto-save**:
- Notes saved on text change (debounced)
- Automatic backend synchronization
- No manual save button needed
- Visual feedback on save

**Staging Area**:
- Temporary note buffer before committing
- Allows experimentation without immediate save
- Can be cleared or committed

**Append Mode**:
- Add new notes without overwriting
- Preserves existing content
- Useful for progressive note-taking during long meetings

### Transcript Features

**Real-time Capture**:
- Live meeting transcription via Vexa
- 1-second update interval
- Appears in Transcript tab
- Speaker names included

**Speaker Attribution**:
- Format: "Speaker Name: transcript text"
- Auto-extracted from Vexa API
- Helps identify who said what

**Timestamp Tracking**:
- Each segment has timestamp
- Used for filtering and ordering
- Preserved in backend storage

**Language Detection**:
- Auto-detect meeting language
- Manual override available
- Supports multiple languages via Vexa

**Version Association**:
- Transcript linked to active version only
- New version = new transcript
- Historical transcripts preserved per version

**Smart Auto-scroll**:
- Automatically scrolls to bottom when user is at bottom
- Stays in place if user has scrolled up
- Resumes auto-scroll when user scrolls to bottom
- Smooth, non-intrusive behavior

---

## Settings & Configuration

### ShotGrid Settings
- **ShotGrid URL**: Base URL of ShotGrid instance
  - Example: `https://yoursite.shotgrid.autodesk.com`
  - Required for ShotGrid integration
  - Saved to: `SHOTGRID_URL` in .env
- **API Key**: ShotGrid API authentication key
  - Password-protected input field
  - Required for API access
  - Saved to: `SHOTGRID_API_KEY` in .env
- **Script Name**: Name of script/bot in ShotGrid
  - Example: "DNA Dailies Assistant"
  - Used for API authentication
  - Saved to: `SHOTGRID_SCRIPT_NAME` in .env
- **Include Statuses**: Toggle to enable/disable status management
  - When ON: Shows status dropdown in notes UI
  - When OFF: Hides status dropdown
  - Saved to: `INCLUDE_STATUSES` in .env

### Vexa Settings
- **API Key**: Vexa authentication key
  - Password-protected input field
  - Required for meeting transcription
  - Saved to: `VEXA_API_KEY` in .env
- **API URL**: Vexa API endpoint
  - Default: `https://api.cloud.vexa.ai`
  - Can be changed for custom deployments
  - Saved to: `VEXA_API_URL` in .env

### LLM Settings
- **OpenAI API Key**: OpenAI authentication key
  - Password-protected input field
  - Saved to: `OPENAI_API_KEY` in .env
- **OpenAI Custom Prompt**: Custom prompt text for OpenAI
  - Multi-line text area
  - Defaults to standard dailies prompt
  - Saved to: `OPENAI_PROMPT` in .env

- **Claude API Key**: Anthropic Claude authentication key
  - Password-protected input field
  - Saved to: `CLAUDE_API_KEY` in .env
- **Claude Custom Prompt**: Custom prompt text for Claude
  - Multi-line text area
  - Defaults to standard dailies prompt
  - Saved to: `CLAUDE_PROMPT` in .env

- **Gemini API Key**: Google Gemini authentication key
  - Password-protected input field
  - Saved to: `GEMINI_API_KEY` in .env
- **Gemini Custom Prompt**: Custom prompt text for Gemini
  - Multi-line text area
  - Defaults to standard dailies prompt
  - Saved to: `GEMINI_PROMPT` in .env

### UI Settings (Theme)
- **Background Color**: Main application background (#1a1a1a default)
- **Card Background**: Panel/card backgrounds (#2a2a2a default)
- **Accent Color**: Primary accent/highlight (#3b82f6 default)
- **Accent Hover**: Hover state for accent elements (#2563eb default)
- **Border Color**: Border lines and separators (#404040 default)
- **Text Color**: Primary text color (#e0e0e0 default)
- **Muted Text Color**: Secondary/disabled text (#888888 default)
- **Input Background**: Text input backgrounds (#1a1a1a default)
- **Border Radius**: Corner rounding (0-20px, 8px default)

### UI Settings (Layout)
- **Window Size**: Width, height, position
- **Top Section Visible**: Show/hide Meeting/LLM/Playlists
- **Versions List Visible**: Show/hide version sidebar
- **Version List Width**: Sidebar width (250-500px, 320px default)
- **Split View Positions**: Divider positions between panels

### Settings Persistence

**Backend Storage**:
- All settings stored in backend `.env` file
- Location: `/experimental/cameron/backend/.env`
- Format: Key-value pairs, JSON-serialized for complex values
- Persistent across application restarts

**Auto-load**:
- Settings loaded on application startup
- GET /settings endpoint fetches all values
- Frontend applies settings to UI and services
- Seamless user experience

**Auto-save**:
- Individual settings saved on change
- POST /settings/save-partial endpoint
- No manual save button needed
- Immediate persistence

**API Endpoints**:
- **GET /settings**: Retrieve all settings
  - Returns: JSON object with all key-value pairs
- **POST /settings/save-partial**: Save specific setting
  - Body: `{"key": "value"}`
  - Returns: Success/error status

**Settings Categories**:
1. **Authentication**: API keys for external services
2. **Configuration**: URLs, endpoints, script names
3. **UI Preferences**: Theme colors, layout states
4. **Feature Flags**: Enable/disable features (e.g., statuses)

---

## Technical Architecture

### Frontend Stack
- **Framework**: PySide6 (Qt6 for Python)
- **UI Language**: QML (Qt Modeling Language)
- **Services**: Python backend service classes
- **HTTP Client**: requests library with retry logic

### Backend Stack
- **Framework**: FastAPI (modern Python web framework)
- **Server**: Uvicorn ASGI server
- **Storage**: JSON-based file storage for versions
- **Configuration**: .env file for settings

### Communication
- **Protocol**: HTTP REST API
- **Format**: JSON request/response bodies
- **Base URL**: http://localhost:8000 (configurable)
- **Timeout**: 30 seconds default (configurable)
- **Retry Logic**: 3 attempts with exponential backoff

### Connection Management
- **Health Check**: GET /health for backend connectivity
- **Startup Validation**: Frontend checks backend on launch
- **Error Handling**: User-friendly error messages
- **Reconnection**: Automatic retry on connection loss

### Data Persistence
- **Version Storage**: JSON files in backend
- **Settings Storage**: .env file in backend
- **Per-version Data**: Separate storage per version
- **Workspace Reset**: Complete data wipe with confirmation

### Real-time Features
- **Transcript Polling**: QTimer-based 1-second updates
- **Meeting Status**: Real-time connection state tracking
- **UI Updates**: Qt Signal/Slot mechanism for reactive updates
- **Background Tasks**: Non-blocking operations with threading

### Performance Optimizations
- **Lazy Loading**: Versions loaded on demand
- **Debounced Auto-save**: Prevents excessive API calls
- **Cached Settings**: Settings loaded once on startup
- **Efficient Polling**: Only fetches new transcript segments

---

## File Structure Reference

### Frontend Files
```
frontend_v3/
├── main.py                          # Application entry point
├── config.py                        # Frontend configuration
├── ui/
│   └── main.qml                     # Main UI definition
└── services/
    ├── backend_service.py           # Backend API client
    ├── vexa_service.py              # Vexa meeting integration
    └── color_picker_service.py      # ORI RPA color picker
```

### Backend Files
```
backend/
├── main.py                          # FastAPI application
├── version_service.py               # Version CRUD operations
├── settings_service.py              # Settings management
├── shotgrid_service.py              # ShotGrid integration
├── .env                             # Configuration storage
└── .env.example                     # Configuration template
```

### Documentation Files
```
docs/
├── FEATURES.md                      # This file
├── ARCHITECTURE.md                  # System architecture
├── SHOTGRID_INTEGRATION.md          # ShotGrid details
├── VEXA_TRANSCRIPTION_README.md     # Vexa integration guide
└── QUICKSTART.md                    # Quick setup guide
```

---

## Usage Examples

### Typical Workflow

1. **Setup** (First Time):
   - Open Preferences (Ctrl+Shift+P)
   - Configure ShotGrid credentials
   - Configure Vexa API key
   - Add at least one LLM API key
   - Customize theme (optional)

2. **Load Versions**:
   - Select ShotGrid project from dropdown
   - Select playlist from dropdown
   - Click "Load Playlist"
   - OR: Import CSV with version names

3. **Join Meeting**:
   - Paste meeting URL in Meeting widget
   - Click "Join Meeting"
   - Wait for "Connected" status

4. **Review Process**:
   - Select first version from sidebar
   - Meeting transcript appears in Transcript tab
   - Manually type notes in Notes area
   - OR: Generate AI notes with Ctrl+Shift+R
   - Review AI notes, add to manual notes with Ctrl+Shift+A
   - Move to next version with Ctrl+Shift+Down
   - Repeat for each version

5. **Finish**:
   - Click "Leave Meeting" to stop transcription
   - All notes auto-saved to backend
   - Export CSV for sharing (optional)

### Keyboard-Driven Workflow

```
Ctrl+Shift+P     → Open preferences, configure settings
Ctrl+Shift+S     → Hide version list for more workspace
Ctrl+Shift+U     → Hide upper widgets for focused note-taking
Ctrl+Shift+Down  → Navigate to next version
Ctrl+Shift+R     → Generate AI notes
Ctrl+Shift+A     → Add AI notes to manual notes
Ctrl+Shift+Down  → Move to next version
Ctrl+Shift+D     → Toggle to transcript for reference
Ctrl+Shift+D     → Toggle back to notes
```

---

## Future Enhancements

### Planned Features
- Streaming AI responses for faster feedback
- Keyboard shortcut customization
- Multi-language UI support
- Export to PDF format
- ShotGrid note publishing (write notes back to ShotGrid)
- Offline mode with sync
- Version comparison view
- Search and filter in versions list
- Dark/light theme toggle
- Undo/redo for notes

### API Enhancements
- WebSocket support for real-time transcript streaming
- Batch version operations
- Version history/versioning
- User authentication
- Multi-user collaboration
- Cloud storage backend
- Plugin system for extensibility

---

## Support & Documentation

- **Quickstart Guide**: See `QUICKSTART.md`
- **Architecture**: See `ARCHITECTURE.md`
- **ShotGrid Integration**: See `SHOTGRID_INTEGRATION.md`
- **Vexa Integration**: See `VEXA_TRANSCRIPTION_README.md`
- **API Documentation**: See `backend/API_DOCUMENTATION.md`
- **Issues**: Report bugs or request features on GitHub

---

*Last Updated: 2025-11-10*
*Version: 3.0*
*Frontend: frontend_v3*
