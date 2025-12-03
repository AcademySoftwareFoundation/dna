# Usage Guide

Step-by-step instructions for using the Dailies Note Assistant v2.

**Prerequisites**: If you haven't installed and configured the application yet, see the [Installation Guide](INSTALLATION.md) first.

## Basic Workflow

### Step 1: Load Shot List

Choose one of two methods to load your shots:

#### Option A: Upload CSV File

1. **Prepare CSV file** with shot information:
   ```csv
   Shot,Version,Notes,Transcription
   shot_010,v001,Character animation scene,
   shot_020,v002,Lighting pass,
   shot_030,v001,Environment matte painting,
   ```

   **Note**: Column headers can be customized (e.g., "jts" instead of "Version"). See [Configuration Guide](CONFIGURATION.md#csv-upload-configuration).

2. **Drag and drop** the CSV file into the upload area
3. **Review imported shots** in the shots table

#### Option B: ShotGrid Integration (if enabled)

1. **Select Project**: Choose from active ShotGrid projects dropdown
2. **Select Playlist**: Choose from recent playlists for the project
3. **Import Shots**: Click "Load Playlist" to import shots/versions
4. **Review imported shots** in the shots table

### Step 2: Join Google Meet Session

1. **Enter Meeting Information**:
   - **Google Meet URL**: Full meeting URL (e.g., `https://meet.google.com/abc-defg-hij`)
   - **OR Meeting ID**: Just the meeting ID (e.g., `abc-defg-hij`)

2. **Click "Join"** to start the transcription bot

3. **Wait for "Get Transcripts" Button**: After joining, wait for the "Get Transcripts" button to appear (may take 10-20 seconds)
   - The bot needs to detect incoming audio before enabling transcript streaming
   - If the button doesn't appear after 20 seconds, try speaking a few words to trigger audio detection
   - Once the button appears, click it to start receiving transcripts

4. **Verify Connection**: Check that transcription status shows "Connected"

### Step 3: Capture Transcriptions

#### Focus Management for Shot Tracking

1. **Set Row Focus**: Click on any field within a shot row to set it as the active row
   - **Active row** is highlighted with a blue border (solid when streaming, dotted when paused)
   - **Transcriptions automatically flow** to the currently focused row
   - **Switch focus** by clicking on a different row as the conversation moves to the next shot
   - **Quick pause**: Click outside text areas or press Escape key to quickly pause streaming

2. **Follow the Conversation**: As the review progresses through different shots, click on the corresponding text fields in the rows to redirect transcription capture

3. **Visual Streaming Feedback**: Monitor transcript streaming status through border styling
   - **Solid blue border**: Transcripts are actively streaming to this shot
   - **Dotted blue border**: Transcript streaming is paused for this shot
   - **No border**: Shot is not currently selected for transcript capture

4. **Automatic Summary Generation**: When enabled in settings, summaries are automatically generated when switching shot context
   - **Triggers on focus change**: When you switch from one shot to another, the previous shot's transcription is automatically summarized
   - **Uses preferred LLM and prompt**: Respects your configured default LLM model and prompt type settings
   - **Background processing**: Summaries generate in the background without interrupting your workflow
   - **Smart triggering**: Only generates summaries if transcription content has accumulated for the shot

#### Pause and Resume Transcription

1. **Manual and Automatic Pause/Resume**: 
   - **Click "Pause Transcripts"** to temporarily stop streaming
   - **Click "Get Transcripts"** to resume when conversation becomes relevant
   - **Press Escape key** to quickly toggle between pause/resume states
   - **Click outside text areas** to automatically pause streaming when no shot is pinned

2. **When to Pause**:
   - **Use during off-topic discussions** (breaks, unrelated conversations)
   - **Helps improve LLM summarization** by avoiding irrelevant content
   - **During administrative portions** of the review session

#### Pin Shots for Extended Discussions

1. **Pin for Long Discussions**: Click "Pin" button when a shot requires extended conversation
   - **Locks transcription** to that specific shot regardless of row focus
   - **Allows multitasking**: Edit other rows, generate summaries, add notes
   - **Prevents accidental redirection** during complex discussions
   - **Overrides automatic pause**: Pinned shots continue receiving transcripts even when clicking outside text areas

2. **Unpin to Resume**: Click "Unpin" to return to normal focus-based workflow

#### Keyboard Shortcuts

1. **Escape Key**: Quick toggle for transcript streaming
   - **First press**: Starts transcript streaming if not active
   - **Subsequent presses**: Toggles between pause/resume states
   - **Works from anywhere**: No need to click floating controls
   - **Respects pinned shots**: Functions the same whether shots are pinned or not

2. **Ctrl+P**: Smart pin/unpin and context switching
   - **No shot pinned**: Pins the current/focused shot for extended discussion
   - **Same shot pinned**: Unpins the currently pinned shot (returns to normal workflow)
   - **Different shot**: Unpins previous shot and switches context to current shot (without pinning)
   - **Intelligent targeting**: Automatically detects which row you're editing
   - **Quick workflow**: Seamlessly switch between shots during complex reviews

3. **Alt+Up/Down Arrow**: Navigate between shot rows
   - **Alt+Up Arrow**: Move to the previous shot row
   - **Alt+Down Arrow**: Move to the next shot row
   - **Smart focus**: Automatically focuses the active tab (Notes or LLM summary) in the target row
   - **Respects tabs**: Maintains your current tab selection when navigating
   - **Boundary aware**: Won't navigate beyond first or last row

#### Monitor Real-time Activity

- **Active row highlight**: Blue border shows which row is receiving transcripts
- **Transcription text** appears in real-time in the "Transcription" column
- **Timestamps** show when text was captured

## User Interface Controls

### Collapsible Panels

The interface includes collapsible components to save screen space:

#### Left Panel Controls
- **Top Panel**: Contains Import, Google Meet, Export, and Settings tabs
- **Collapsible**: Click chevron (▲/▼) button to collapse/expand
- **Purpose**: Save space for the shot notes table during active reviews

#### Floating Controls
- **Location**: Top-right corner of the screen
- **Contains**: Add shot input, status messages, and transcript controls  
- **Collapsible**: Click chevron (▲/▼) button to show/hide non-essential controls
- **Purpose**: Minimize distractions while keeping transcript controls accessible

### Step 4: Generate AI Summaries

1. **Select LLM Model**: Choose from available models (ChatGPT, Claude, etc.)
2. **Select Prompt Type**: Choose prompt style (short, long, technical, creative)
3. **Click Refresh Icon** in the Summary column for specific shots
4. **Bulk Refresh (optional)**: Open the **Settings** tab, enable *Auto generate summary on context switch*, pick your preferred LLM, and click **Refresh All** to queue summaries for every shot with transcription data. Progress and cancellation controls let you run this in the background without disrupting your current tab selections.
5. **Review Generated Summary**: AI-generated summary appears in Summary column
6. **Copy to Notes**: Use the "Add to Notes" button to transfer content to your personal notes
   - **Select specific text**: Highlight portions of the LLM summary to copy only selected content
   - **Copy entire summary**: Leave text unselected to copy the complete LLM summary
   - **Combine sources**: Mix and match content from different LLM models and prompt types

#### Summary Generation Tips

- **Use different models** for different types of feedback
- **Try different prompt types** for varied summary styles
- **Generate summaries incrementally** as transcriptions accumulate
- **Re-generate summaries** if transcriptions are updated
- **Curate your notes** by selectively copying the best parts from multiple AI summaries

### Step 5: Configure Transcription Settings

#### Speaker Label Control

1. **Access Settings Tab**: Click on the "Settings" tab in the top panel
2. **Speaker Labels Option**: Toggle "Include speaker labels in the transcript"
   - **Enabled (default)**: Shows speaker names and timestamps (e.g., "Speaker1 [10:30]: transcript text")
   - **Disabled**: Shows only timestamps (e.g., "[10:30]: transcript text")

#### When to Disable Speaker Labels

- **Meeting room scenarios**: When multiple people join from the same room/device
- **Unclear speaker identification**: When the system cannot reliably identify individual speakers
- **Simplified transcripts**: When you prefer cleaner transcripts without speaker attribution
- **Anonymous feedback**: When speaker identity should not be recorded

**Note**: Timestamps are always preserved regardless of speaker label setting for chronological reference.

### Step 6: Export and Share Results

#### Download Options

1. **Download Notes (CSV)**:
   - Click "Download Notes" button
   - Exports structured data with shots, transcriptions, and summaries
   - Includes timestamps and metadata

2. **Download Transcript (TXT)**:
   - Click "Download Transcript" button
   - Exports raw transcription text
   - Chronological format with timestamps

#### Email Notes

1. **Enter Email Address**: Type recipient email in the email field
2. **Click "Email Notes"**: Sends formatted notes via configured email service
3. **Email Format**: Structured email with shot-by-shot breakdown

## Advanced Features

### Summary Customization

- **Different models per shot**: Use specialized models for different shot types
- **Multiple prompt types**: Generate different summary styles for same content
- **Iterative refinement**: Re-generate summaries as more transcription is captured

### Demo Mode Usage

When `DEMO_MODE=true` is configured:
- **ShotGrid data** is automatically anonymized
- **Project and shot names** are scrambled but consistent
- **Perfect for screenshots** and demonstrations
- **Data structure preserved** for full functionality

## CSV Format Reference

### Required Format

```csv
Shot,Version,Notes,Transcription
shot_010,v001,Character animation for opening sequence,
shot_020,v002,Lighting pass for interior scene,
shot_030,v001,Environment matte painting,
```

### Format Rules

- **Shot column**: Shot identifier (required) - identified by header text (default: "Shot")
- **Version column**: Version identifier (required) - identified by header text (default: "Version") 
- **Notes column**: Notes/description (optional) - identified by "Notes" header
- **Transcription column**: Transcription (optional, usually empty on import) - identified by "Transcription" header
- **Column order**: Columns can be in any order, identified by header text
- **Header row**: Required for column identification
- **Standard CSV**: Use commas, quote fields containing commas
- **File encoding**: UTF-8 recommended

**Note**: The header text for Shot and Version columns can be customized via environment variables `SG_CSV_SHOT_FIELD` and `SG_CSV_VERSION_FIELD`. See [Configuration Guide](CONFIGURATION.md#csv-upload-configuration) for details.

### Example with Complex Data

```csv
"Shot","Version","Notes","Transcription","Artist","Status"
"shot_010","v001","Character animation, facial work","","John Smith","In Progress"
"shot_020","v002","Lighting pass with volumetrics","","Jane Doe","Ready for Review"
"shot_030","v001","Environment matte painting, sky replacement","","Bob Wilson","Final"
```

**Note**: Columns can be in any order. Additional columns (like "Artist" and "Status") are allowed and will be preserved.

## Troubleshooting Usage Issues

### Connection Problems

1. **Backend not responding**:
   - Verify backend is running on port 8000
   - Check for error messages in terminal

2. **Frontend not loading**:
   - Verify frontend is running on port 5173
   - Check browser console for errors

3. **WebSocket connection fails**:
   - Check firewall settings
   - Verify both servers are running

### Google Meet Integration

1. **Bot won't join meeting**:
   - Verify Vexa.ai configuration
   - Check meeting URL format
   - Ensure meeting is active

2. **No transcription data**:
   - Verify bot has joined successfully
   - Wait for the "Get Transcripts" button to appear (may take 10-20 seconds after joining)
   - If button doesn't appear, try speaking to trigger audio detection
   - Check that "Get Transcripts" is enabled/clicked
   - Ensure shots are pinned for capture

### LLM Summary Issues

1. **No models available**:
   - Check API keys are configured
   - Verify LLM providers are enabled
   - Use `DISABLE_LLM=true` for testing

2. **Summary generation fails**:
   - Check API rate limits
   - Verify transcription data exists
   - Review backend logs for errors

### File and Email Issues

1. **CSV upload fails**:
   - Check file format matches requirements
   - Verify file is not corrupted
   - Check file size limits

2. **Email sending fails**:
   - Verify Gmail API setup or SMTP configuration
   - Check email credentials
   - Test email service independently

See [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed solutions.
