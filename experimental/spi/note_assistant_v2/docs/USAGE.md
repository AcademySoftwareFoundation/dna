# Usage Guide

Step-by-step instructions for using the Dailies Note Assistant v2.

## Starting the Application

### 1. Start Backend Server

```bash
cd backend
python -m uvicorn main:main --reload --port 8000
```

The API will be available at `http://localhost:8000`

### 2. Start Frontend Development Server

```bash
cd frontend
npm run dev
```

The web interface will be available at `http://localhost:5173`

### 3. Verify Setup

1. Open `http://localhost:5173` in your browser
2. Check that the interface loads properly
3. Verify configuration by visiting `http://localhost:8000/config`

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

3. **Verify Connection**: Check that transcription status shows "Connected"

### Step 3: Capture Transcriptions

#### Pin Shots for Focus

1. **Click "Pin" button** on specific shots you want to capture
2. **Pinned shots** will be highlighted and receive transcriptions
3. **Unpin shots** that are no longer being discussed

#### Control Transcription Capture

1. **Toggle "Get Transcripts"** button to start/pause capturing
2. **When active**: Real-time transcriptions appear in shot rows
3. **When paused**: Transcriptions stop but connection remains

#### Monitor Real-time Activity

- **Transcription text** appears in the "Transcription" column
- **Timestamps** show when text was captured
- **Pin status** indicates which shots are actively capturing

### Step 4: Generate AI Summaries

1. **Select LLM Model**: Choose from available models (ChatGPT, Claude, etc.)
2. **Select Prompt Type**: Choose prompt style (short, long, technical, creative)
3. **Click Refresh Icon** in the Summary column for specific shots
4. **Review Generated Summary**: AI-generated summary appears in Summary column

#### Summary Generation Tips

- **Use different models** for different types of feedback
- **Try different prompt types** for varied summary styles
- **Generate summaries incrementally** as transcriptions accumulate
- **Re-generate summaries** if transcriptions are updated

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

### Multiple Shot Management

- **Pin multiple shots** simultaneously for parallel discussions
- **Switch focus** between shots as conversation moves
- **Capture overlapping discussions** for complex review sessions

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
   - Check that "Get Transcripts" is enabled
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