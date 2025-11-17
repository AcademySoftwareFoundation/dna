# ShotGrid Integration

The merged DNA application now includes full ShotGrid integration from the SPI implementation.

## What Was Added

### 1. ShotGrid Hook (`frontend/src/hooks/useShotGrid.ts`)

A React hook that provides:
- Configuration loading (checks if ShotGrid is enabled)
- Project fetching (active projects)
- Playlist fetching (last 20 playlists per project)
- Playlist items fetching (shots/versions from selected playlist)
- Shot/version validation against ShotGrid

**Key Features:**
```typescript
const {
  isEnabled,           // Whether ShotGrid is enabled in backend
  projects,            // List of active projects
  playlists,           // List of playlists for selected project
  selectedProjectId,   // Currently selected project
  setSelectedProjectId,
  selectedPlaylistId,  // Currently selected playlist
  setSelectedPlaylistId,
  loading,             // Loading state
  error,               // Error messages
  fetchPlaylistItems,  // Fetch shots/versions from playlist
  validateShotVersion, // Validate input against ShotGrid
} = useShotGrid();
```

### 2. UI Integration (`frontend/src/App.tsx`)

Added a new card in the control panel with:
- **Project Selector**: Dropdown to select active ShotGrid project
- **Playlist Selector**: Dropdown to select playlist (last 20 playlists)
- **Auto-loading**: When a playlist is selected, shots/versions automatically populate the version list
- **Conditional Display**: Only shows when ShotGrid is enabled in backend

### 3. Automatic Version Population

When a playlist is selected:
1. Fetches playlist items (shots/versions) from backend
2. Converts them to framework versions
3. Adds them to the DNA framework state
4. They appear as version cards with notes/transcript sections

## Backend Requirements

The backend must have these endpoints (already present in SPI backend):

- `GET /config` - Returns `{ shotgrid_enabled: boolean }`
- `GET /shotgrid/active-projects` - Returns list of active projects
- `GET /shotgrid/latest-playlists/{project_id}` - Returns last 20 playlists
- `GET /shotgrid/playlist-items/{playlist_id}` - Returns shots/versions in playlist
- `POST /shotgrid/validate-shot-version` - Validates shot/version input

## Configuration

### Backend Environment Variables

Add to `backend/.env`:

```env
# ShotGrid Configuration
SHOTGRID_URL=https://your-studio.shotgunstudio.com
SHOTGRID_SCRIPT_NAME=your-script-name
SHOTGRID_API_KEY=your-api-key
SHOTGRID_SHOT_FIELD=version
SHOTGRID_VERSION_FIELD=shot
SHOTGRID_TYPE_FILTER=

# Demo Mode (optional - anonymizes data)
DEMO_MODE=false
```

### Frontend Environment Variables

Add to `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:8000
```

## Usage

### 1. Start Backend with ShotGrid Configured

```bash
cd backend
source venv/bin/activate
# Ensure .env has ShotGrid credentials
uvicorn main:app --reload --port 8000
```

### 2. Start Frontend

```bash
cd frontend
npm run dev
```

### 3. Use ShotGrid Integration

1. **Select Project**: Choose from active ShotGrid projects
2. **Select Playlist**: Choose from recent playlists (last 20)
3. **Versions Load**: Shots/versions automatically populate
4. **Take Notes**: Add notes, generate AI summaries, view transcripts
5. **Email Results**: Send compiled notes via email

## Features

### Project Selection
- Lists only active projects
- Shows project code
- Filters based on `SHOTGRID_TYPE_FILTER` if configured

### Playlist Selection
- Shows last 20 playlists for selected project
- Displays playlist code and creation date
- Sorted by most recent first

### Automatic Population
- Fetches shots/versions from selected playlist
- Creates version cards for each item
- Maintains existing notes and transcripts
- Integrates with meeting transcription

### Shot/Version Validation (Available but not in UI yet)
- Backend can validate shot/version names
- Can resolve ShotGrid IDs to names
- Returns proper shot/version structure

## UI Components

### ShotGrid Card

Located in the control panel (third card if enabled):

```
┌─────────────────────────────┐
│ ShotGrid Integration        │
│                             │
│ Project: [Dropdown]         │
│ Playlist: [Dropdown]        │
│                             │
│ Status: Loading...          │
└─────────────────────────────┘
```

### States

- **Disabled**: Card doesn't appear if `shotgrid_enabled: false`
- **Loading**: Shows spinner while fetching data
- **Error**: Displays error message in red
- **Ready**: Dropdowns enabled, ready to select

## Integration with DNA Framework

ShotGrid playlist items integrate seamlessly with the DNA framework:

1. **Version Creation**: Each playlist item becomes a framework version
2. **Context Preservation**: Description stored in version context
3. **Notes Tracking**: User notes and AI notes per version
4. **Transcript Association**: Meeting transcripts linked to versions
5. **Email Integration**: All versions included in email summary

## Demo Mode

If `DEMO_MODE=true` in backend:
- ShotGrid data is anonymized
- Project codes, names hashed consistently
- Shot and version names anonymized
- Structure preserved for testing

## Error Handling

The integration handles:
- **Network Errors**: Shows error message, allows retry
- **Missing Configuration**: Disables gracefully if not configured
- **Invalid Selections**: Validates before API calls
- **Backend Unavailable**: Falls back to manual entry

## CSV Export with Status

When exporting versions to CSV, the status column can be optionally included based on the ShotGrid status mode setting.

### How It Works

1. **Status Mode OFF** (`includeStatuses=False`):
   - CSV exports with columns: `Version, Note, Transcript`
   - Standard export without status information

2. **Status Mode ON** (`includeStatuses=True`):
   - CSV exports with columns: `Version, Note, Transcript, Status`
   - Status field from each version is included in the export
   - Status values are exported exactly as stored (e.g., "rev", "fin", "wtg")

### Usage

The status column inclusion is automatic and controlled by the "Include Statuses" toggle in the ShotGrid settings:

1. Enable "Include Statuses" in ShotGrid settings
2. Load versions from a ShotGrid playlist (statuses will be populated)
3. Export to CSV - the Status column will be automatically included
4. The exported CSV will contain the current status for each version

### Backend Implementation

- **Endpoint**: `GET /versions/export/csv?include_status=true`
- **Parameter**: `include_status` (boolean, default: false)
- **Location**: `backend/version_service.py`

### Frontend Implementation

- **Method**: `BackendService.exportCSV(file_url)`
- **Behavior**: Automatically passes `include_status` based on `includeStatuses` property
- **Location**: `frontend_v3/services/backend_service.py`

## Future Enhancements

Potential additions:
- Manual shot/version entry with validation
- Refresh button for playlists
- Filter playlists by date range
- Show playlist notes/description
- Bulk operations on playlist items
- Direct ShotGrid status updates from UI
- Link versions to ShotGrid review notes
- Import CSV with status column to update statuses

## Comparison to SPI Implementation

### What's the Same
✅ All backend endpoints and logic  
✅ Project/playlist fetching  
✅ Playlist item loading  
✅ Validation API  
✅ Demo mode support  

### What's Different
✅ Uses Radix UI components (instead of custom CSS)  
✅ Integrated with ILM framework (instead of React state)  
✅ TypeScript hook pattern (instead of inline state)  
✅ Cleaner, more maintainable code structure  
✅ Better type safety throughout  

### What's Better
✅ Type-safe with TypeScript  
✅ Reusable hook pattern  
✅ Better UI/UX with Radix components  
✅ Automatic framework integration  
✅ Consistent with rest of merged app  

## Testing

To test ShotGrid integration:

1. **Without ShotGrid**:
   - Don't configure `SHOTGRID_URL` in backend
   - Card should not appear
   - App works normally

2. **With ShotGrid (Demo Mode)**:
   ```env
   SHOTGRID_URL=https://demo.shotgunstudio.com
   DEMO_MODE=true
   ```
   - Card appears
   - Mock data returned
   - Can test UI without real ShotGrid

3. **With Real ShotGrid**:
   - Configure real credentials
   - Select real projects
   - Load real playlists
   - Take notes on real shots

## Troubleshooting

**Card doesn't appear?**
- Check backend `/config` endpoint returns `{ shotgrid_enabled: true }`
- Verify backend is running
- Check browser console for errors

**No projects shown?**
- Check ShotGrid credentials in backend `.env`
- Verify backend can connect to ShotGrid
- Check backend logs for errors
- Try `DEMO_MODE=true` for testing

**No playlists shown?**
- Ensure project is selected
- Check project has playlists in ShotGrid
- Verify backend endpoint returns data

**Versions don't load?**
- Ensure playlist is selected
- Check backend endpoint response
- Verify playlist has items in ShotGrid
- Check browser console for errors

## Summary

The ShotGrid integration provides a seamless way to load shot/version lists from ShotGrid playlists directly into the DNA application, making it easy to take notes during dailies reviews with pre-populated shot lists from your production tracking system.

**Status**: ✅ Complete and Ready to Use
