# Google Meet Recording Processing Pipeline - User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Quick Start Guide](#quick-start-guide)
3. [Complete Pipeline Usage](#complete-pipeline-usage)
4. [Individual Tools for Troubleshooting](#individual-tools-for-troubleshooting)
5. [Configuration Guide](#configuration-guide)
6. [Common Workflows](#common-workflows)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [FAQ](#faq)
9. [Appendix](#appendix)

---

## Introduction

### What Does This Pipeline Do?

The Google Meet Recording Processing Pipeline automatically extracts and processes information from dailies review meetings recorded in Google Meet. It:

- **Extracts** what was said (audio transcription) and what was shown (version IDs on screen)
- **Combines** meeting conversations with your ShotGrid playlist notes
- **Generates** AI summaries of discussions for each version
- **Emails** formatted results with clickable timestamp links

**End Result**: You get a CSV file and/or email with all your version notes, meeting conversations, and AI-generated summaries in one place.

### When to Use the Complete Pipeline vs Individual Tools

**Use the complete pipeline when:**
- You want to process an entire dailies review meeting from start to finish
- You have both a recording and a ShotGrid playlist export
- You want the full automated workflow

**Use individual tools when:**
- Something goes wrong and you need to troubleshoot specific stages
- You only need one piece of functionality (e.g., just transcription)
- You want to test settings before running the full pipeline

### Prerequisites

Before running the pipeline, you'll need:

1. **Python Environment**: Python 3.8 or newer
2. **Video Recording**: A Google Meet recording file (MP4) or Google Drive link
3. **ShotGrid CSV**: An exported playlist from ShotGrid
4. **Configuration File**: A `.env` file with your settings (see [Configuration Guide](#configuration-guide))
5. **Version Pattern**: Know how your version IDs are formatted (e.g., "v001", "shot-1234", "proj-0042")

**Optional for email:**
- Gmail credentials file (`client_secret.json`) OR SMTP server access
- Configured email settings in `.env`

---

## Quick Start Guide

### Simplest Complete Pipeline Example

Here's the fastest way to process a meeting and get results:

```bash
cd experimental/spi/note_assistant_v2/backend/tools

python process_gmeet_recording.py \
    dailies_recording.mp4 \
    shotgrid_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp
```

This will:
1. Extract transcript and version IDs from the video
2. Combine with ShotGrid data
3. Generate AI summaries
4. Create `shotgrid_playlist_processed.csv` with all results

**Expected Outputs:**
- `shotgrid_playlist_processed.csv` - Final results with summaries

**Processing Time:**
Processing time varies based on video length, audio model selection, hardware (CPU/GPU), available memory, and whether parallel processing is enabled.

### Adding Email Delivery

To email results to someone:

```bash
python process_gmeet_recording.py \
    dailies_recording.mp4 \
    shotgrid_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    artist@studio.com
```

The email will include:
- Formatted HTML table with version notes and summaries
- CSV attachment
- Clickable timestamp links (if you provide `--drive-url`)

---

## Complete Pipeline Usage

### Overview: process_gmeet_recording.py

This is the main script that runs the entire workflow from start to finish. It orchestrates four stages:

1. **Stage 1**: Extract Google Meet data (audio transcript + visual detection)
2. **Stage 2**: Combine with ShotGrid playlist data
3. **Stage 3**: Generate LLM summaries for each version
4. **Stage 4**: Email results (optional)

### Required Parameters

These parameters are always required:

| Parameter | What It Means | Example |
|-----------|---------------|---------|
| `video_input` | Path to your video file or Google Drive URL | `dailies_2024-01-15.mp4` |
| `sg_playlist_csv` | Path to your ShotGrid CSV export | `playlist_export.csv` |
| `--version-pattern` | Regex pattern with capture group for version IDs | `"v(\d+)"` for v001, v002, etc. |
| `--version-column` | Column name in SG CSV with version info | `"version"` or `"code"` |
| `--model` | AI model to use for summaries | `gemini-2.0-flash-exp` |

### Optional Parameters

| Parameter | What It Does | Default | Example |
|-----------|--------------|---------|---------|
| `recipient_email` | Email address to send results to | None (no email) | `producer@studio.com` |
| `--output` | Directory for organized outputs OR CSV file path | `<sg_basename>_processed.csv` | `/outputs` or `results.csv` |
| `--project` | Project name for organizing outputs (required with directory) | None | `myproject` |
| `--force-download` | Force re-download from Drive even if cached | Off | Add flag to bypass cache |
| `--drive-url` | Google Drive link for clickable timestamps | None | See below |
| `--thumbnail-url` | Base URL for version thumbnails in email | None | `http://thumbs.server.com/` |
| `--timeline-csv` | Save timeline CSV showing version chronology | None | `timeline.csv` |
| `--parallel` | Process audio and video at the same time (faster) | Off | Add flag to enable |
| `--audio-model` | Whisper transcription quality | `base` | `tiny`, `small`, `medium` |
| `--frame-interval` | How often to check for version IDs (seconds) | 5.0 | `3.0` for more frequent |
| `--reference-threshold` | Max seconds for brief mentions vs main discussion | 30 | `45` |
| `--start-time` | Skip to this time in video (seconds) | 0 | `120` (start at 2 min) |
| `--duration` | Only process this many seconds | Full video | `600` (10 minutes) |
| `-v, --verbose` | Show detailed progress messages | Off | Add flag for more info |
| `--keep-intermediate` | Keep intermediate files in organized location | Off | Add flag to preserve |

### Common Usage Examples

**Basic processing with email:**
```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    supervisor@studio.com
```

**With Google Drive URL for clickable timestamps:**
```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "shot-(\d+)" \
    --version-column "code" \
    --model gemini-2.0-flash-exp \
    team@studio.com \
    --drive-url "https://drive.google.com/file/d/1aB2cD3eF4gH5iJ/view"
```

**Process only the first 10 minutes (testing):**
```bash
python process_gmeet_recording.py \
    long_meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --duration 600 \
    --verbose
```

**Fast processing with parallel mode:**
```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --parallel
```

**Process Google Drive video directly (no manual download needed):**
```bash
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/1aB2cD3eF4gH5iJ/view" \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    artist@studio.com
```

**Save timeline CSV showing when each version appeared:**
```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --timeline-csv version_timeline.csv
```

**Use case:** The timeline CSV enables building additional tools (e.g., desktop review system plugins) that let users search for specific versions and jump directly to the relevant discussion in the recorded video.

---

### Using Organized Output Mode with Caching

**What is organized output mode?**

When you provide a directory path to `--output` (instead of a CSV filename), the pipeline organizes all outputs by project and recording name, and automatically caches downloaded Google Drive recordings to avoid re-downloading.

**Benefits:**
- **Avoid re-downloads**: Cached recordings are reused on subsequent runs
- **Organized structure**: All outputs grouped by project and recording
- **Offline capability**: Process cached recordings without internet access
- **Bandwidth savings**: No redundant downloads from Google Drive

**Directory structure:**
```
{output_dir}/
└── {project}/
    └── {recording_name}/
        ├── recording.mp4              ← Cached video
        ├── {sg_basename}_processed.csv ← Final results
        ├── timeline.csv               ← Timeline (if requested)
        └── intermediate/              ← Intermediate files (if --keep-intermediate)
            ├── audio_transcript.csv
            └── visual_detections.csv
```

**Basic usage with caching:**
```bash
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/1aB2cD3eF/view" \
    playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --output /path/to/outputs \
    --project myproject
```

**First run (cache miss):**
- Downloads video from Google Drive
- Caches to `/path/to/outputs/myproject/Daily_Review_2025_01_15/recording.mp4`
- Processes video and saves results in same directory
- Output: `/path/to/outputs/myproject/Daily_Review_2025_01_15/playlist_processed.csv`

**Second run (cache hit):**
```bash
# Run same command again
```
- Detects cached recording
- Skips download (prints "Cache hit! Using cached file...")
- Processes from cache (much faster)
- Updates CSV in same location

**Force re-download (refresh cache):**
```bash
# Add --force-download flag
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/1aB2cD3eF/view" \
    playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --output /path/to/outputs \
    --project myproject \
    --force-download
```
- Re-downloads even if cached
- Updates cache with new version
- Useful when source file was updated on Google Drive

**With intermediate files:**
```bash
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/1aB2cD3eF/view" \
    playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --output /path/to/outputs \
    --project myproject \
    --keep-intermediate
```
- Intermediate files saved to `/path/to/outputs/myproject/Daily_Review_2025_01_15/intermediate/`
- Preserved across runs (not in temp directory)

**Multiple recordings for same project:**
```bash
# First recording
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/RECORDING1/view" \
    playlist1.csv \
    --output /outputs --project myproject ...

# Second recording (different file)
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/RECORDING2/view" \
    playlist2.csv \
    --output /outputs --project myproject ...
```

Result:
```
/outputs/myproject/
├── Daily_Review_Monday/
│   ├── recording.mp4
│   └── playlist1_processed.csv
└── Weekly_Review_Friday/
    ├── recording.mp4
    └── playlist2_processed.csv
```

Each recording gets its own directory, preventing files from being overwritten.

**Legacy mode (backward compatible):**

If you specify a CSV filename (ending with `.csv`), the pipeline works as before:
```bash
# File mode - no caching, no project organization
python process_gmeet_recording.py \
    video.mp4 \
    playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --output results/output.csv
```
- No caching
- No project organization
- CSV saved to specified path

**Requirements for organized mode:**
- `--output` must be a directory path (not ending in `.csv`)
- `--project` is required when using directory mode
- Works with both Google Drive URLs and local video files

---

### Understanding the Output

The final CSV contains these columns:

| Column | Description |
|--------|-------------|
| `shot` | Shot name from ShotGrid |
| `<version_column>` | Version identifier (name varies by your `--version-column`) |
| `notes` | Original notes from ShotGrid |
| `transcription` | What was said during the review (grouped by speaker) |
| `timestamp` | When this version was discussed (HH:MM:SS format) |
| `reference_versions` | Other versions briefly mentioned during this discussion |
| `version_id` | Extracted version number |
| `summary` | AI-generated summary of the discussion |
| `llm_provider` | Which AI service generated the summary |
| `llm_model` | Which AI model was used |
| `llm_prompt_type` | Type of prompt used |
| `llm_error` | Any errors during summary generation (usually empty) |

**What the data means:**
- **Empty `transcription`**: Version wasn't discussed in the meeting
- **Empty `summary`**: No conversation to summarize (relies on transcription)
- **Reference versions format**: `version_id:timestamp,version_id:timestamp` (other versions mentioned)

---

## Individual Tools for Troubleshooting

When the complete pipeline fails or you want to test individual components, these tools can be run separately.

### 1. Extract Google Meet Data: get_data_from_google_meet.py

**What it does:** Extracts who said what and when, plus what version IDs appeared on screen.

**When to use it standalone:**
- Test if your version pattern is working correctly
- Check transcription quality before running the full pipeline
- Troubleshoot audio or visual detection issues
- Generate a timeline CSV to see version chronology

**Basic usage:**
```bash
python get_data_from_google_meet.py \
    meeting.mp4 \
    --version-pattern "v(\d+)" \
    -o meeting_data.csv
```

**Useful options:**
```bash
# Faster processing with parallel mode
python get_data_from_google_meet.py meeting.mp4 --version-pattern "v(\d+)" --parallel

# Better transcription quality (slower)
python get_data_from_google_meet.py meeting.mp4 --version-pattern "v(\d+)" --audio-model medium

# Check for version IDs more frequently
python get_data_from_google_meet.py meeting.mp4 --version-pattern "v(\d+)" --frame-interval 3.0

# Process just the first 5 minutes (testing)
python get_data_from_google_meet.py meeting.mp4 --version-pattern "v(\d+)" --duration 300 -v

# Generate timeline CSV
python get_data_from_google_meet.py meeting.mp4 \
    --version-pattern "v(\d+)" \
    --timeline-csv timeline.csv
```

**Output CSV columns:**
- `timestamp` - When this was said (HH:MM:SS)
- `transcript_text` - What was said
- `speaker_name` - Who said it
- `version_id` - Version ID detected on screen at this time

**Timeline CSV format** (if `--timeline-csv` specified):
Shows chronological order of versions as they appear:
- `timestamp` - When version first appeared
- `version_id` - Which version
- Order reflects the actual review sequence

This timeline file is useful for building additional tools like review system plugins or desktop UIs that enable searching for versions and jumping to specific timestamps in the recorded video.

**Common problems:**
- **No version IDs detected**: Check your `--version-pattern` matches the on-screen format
- **Wrong speaker names**: Names come from OCR of Google Meet's speaker labels
- **Poor transcription**: Try `--audio-model medium` or `large` (slower but more accurate)

---

### 2. Audio Transcription Only: get_audio_transcript.py

**What it does:** Converts speech to text with timestamps.

**When to use it standalone:**
- Test transcription quality
- Get a simple transcript without version detection
- Troubleshoot audio issues

**Basic usage:**
```bash
python get_audio_transcript.py meeting.mp4 -o transcript.csv
```

**Useful options:**
```bash
# Better quality (slower)
python get_audio_transcript.py meeting.mp4 -o transcript.csv -m medium

# Process audio file directly (MP3, WAV, etc.)
python get_audio_transcript.py audio.mp3 -o transcript.csv

# Show progress details
python get_audio_transcript.py meeting.mp4 -o transcript.csv -v
```

**Output CSV columns:**
- `start_time` - Segment start (seconds)
- `end_time` - Segment end (seconds)
- `text` - What was said

**Common problems:**
- **Slow processing**: This is normal for longer videos. Try `--audio-model tiny` for speed
- **Poor accuracy**: Try `--audio-model medium` or `large`
- **"File not found"**: Make sure FFmpeg is installed

---

### 3. Visual Detection Only: get_onscreen_text.py

**What it does:** Detects speaker names and version IDs from video frames.

**When to use it standalone:**
- Test if version IDs are being detected correctly
- Check speaker name detection
- Troubleshoot visual detection issues

**Basic usage:**
```bash
# Detect speaker names only
python get_onscreen_text.py meeting.mp4 -o speakers.csv -v

# Detect speaker names AND version IDs
python get_onscreen_text.py meeting.mp4 --version-pattern "v(\d+)" -o visual_data.csv -v
```

**Useful options:**
```bash
# Check frames more frequently
python get_onscreen_text.py meeting.mp4 --version-pattern "v(\d+)" --interval 2.0

# Faster processing with parallel mode
python get_onscreen_text.py meeting.mp4 --version-pattern "v(\d+)" --parallel

# Test on a single screenshot
python get_onscreen_text.py screenshot.png -v
```

**Output CSV columns (without version pattern):**
- `timestamp` - When detected (HH:MM:SS)
- `speaker_name` - Speaker name

**Output CSV columns (with version pattern):**
- `timestamp` - When detected
- `speaker_name` - Speaker name
- `version_id` - Version ID detected

**Common problems:**
- **No speaker names**: Check that Google Meet's speaker labels are visible in the video
- **No version IDs**: Verify `--version-pattern` matches your format
- **Wrong names/versions**: OCR can sometimes misread text - visual quality matters

---

### 4. Combine Data: combine_data_from_gmeet_and_sg.py

**What it does:** Merges meeting transcript with ShotGrid notes and identifies brief mentions vs main discussions.

**When to use it standalone:**
- Test the data merging logic
- Troubleshoot version matching issues
- Experiment with reference detection threshold

**Basic usage:**
```bash
python combine_data_from_gmeet_and_sg.py \
    sg_playlist.csv \
    meeting_data.csv \
    --version-columns "version,version_id" \
    --version-pattern "(\d+)" \
    --output combined.csv
```

**Key parameter explained:**
- `--version-columns`: Format is `"sg_column,transcript_column"`
  - `sg_column`: Column name in your SG CSV (e.g., "version", "code", "jts")
  - `transcript_column`: Usually `version_id` (output from stage 1)

**Useful options:**
```bash
# Adjust what counts as a "brief reference" (default: 30 seconds)
python combine_data_from_gmeet_and_sg.py \
    sg_playlist.csv meeting_data.csv \
    --version-columns "code,version_id" \
    --version-pattern "(\d+)" \
    --reference-threshold 45 \
    --output combined.csv
```

**What "reference detection" means:**
If a version is discussed for less than the threshold (default: 30 seconds), it's considered a brief reference and linked to the previous main discussion via the `reference_versions` column.

**Common problems:**
- **No matches found**: Check that `--version-pattern` extracts the same number format from both CSVs
- **Version column error**: Make sure `--version-columns` specifies correct column names

---

### 5. Generate AI Summaries: llm_service.py

**What it does:** Creates concise summaries of meeting conversations using AI.

**When to use it standalone:**
- Test AI summary quality
- Troubleshoot LLM provider issues
- Try different models or prompts

**Basic usage:**
```bash
python llm_service.py \
    --csv-input gmeet_and_sg_data.csv \
    --csv-output with_summaries.csv \
    --provider google \
    --model gemini-2.0-flash-exp
```

**Available providers:**
- `google` - Google Gemini models (recommended)
- `openai` - OpenAI GPT models
- `claude` - Anthropic Claude models
- `ollama` - Local models (requires Ollama running)

**Test a single summary:**
```bash
python llm_service.py \
    --provider google \
    --model gemini-2.0-flash-exp \
    --text "Artist: The lighting is too bright. Lead: Agreed, reduce by 50% and resubmit."
```

**Common problems:**
- **"Model not found"**: Check that provider is enabled in `.env` and API key is set
- **"Safety filter blocked"**: Gemini sometimes blocks content - check `./debug_gemini_*.json` files
- **Slow processing**: This is normal - each version requires an API call

---

### 6. Send Email: email_service.py

**What it does:** Sends formatted email with CSV data and optional clickable links.

**When to use it standalone:**
- Test email configuration
- Send results without re-running the pipeline
- Troubleshoot email delivery issues

**Basic usage:**
```bash
python email_service.py recipient@studio.com results.csv
```

**With clickable timestamp links:**
```bash
python email_service.py recipient@studio.com results.csv \
    --drive-url "https://drive.google.com/file/d/1aB2cD3eF4gH5iJ/view"
```

**With thumbnails:**
```bash
python email_service.py recipient@studio.com results.csv \
    --thumbnail-url "http://thumbs.server.com/images/version-"
```

**Common problems:**
- **Email not sent**: Check `EMAIL_SENDER` and credentials in `.env`
- **Gmail authentication error**: Re-run to trigger browser login, or check `client_secret.json`
- **SMTP connection failed**: Verify SMTP server settings in `.env`

---

## Configuration Guide

### Environment Variables (.env file)

The pipeline uses a `.env` file in `experimental/spi/note_assistant_v2/backend/` to store configuration. Here are the important settings:

**Email Configuration:**
```bash
# Your email address (sender)
EMAIL_SENDER=your-email@studio.com

# Email provider: 'gmail' or 'smtp'
EMAIL_PROVIDER=gmail

# For SMTP (if not using Gmail):
SMTP_HOST=mail.studio.com
SMTP_PORT=587
SMTP_USER=username
SMTP_PASSWORD=password
SMTP_TLS=true
```

**LLM Provider Configuration:**

Enable the AI providers you want to use:

```bash
# Google Gemini (recommended)
USE_GOOGLE_LLM=true
GOOGLE_API_KEY=your-api-key-here

# OpenAI (optional)
USE_OPENAI_LLM=true
OPENAI_API_KEY=your-api-key-here

# Anthropic Claude (optional)
USE_CLAUDE_LLM=true
ANTHROPIC_API_KEY=your-api-key-here

# Ollama local models (optional)
USE_OLLAMA_LLM=true
OLLAMA_BASE_URL=http://localhost:11434
```

You only need to enable ONE provider, but having multiple gives you fallback options.

### Finding Credential Files

**Gmail OAuth (`client_secret.json`):**
1. Located in: `experimental/spi/note_assistant_v2/backend/client_secret.json`
2. First run will open your browser for Google login
3. Token saved to `token.json` for future use
4. If you get auth errors, delete `token.json` and re-run to re-authenticate

**Google Drive OAuth:**
Uses the same `client_secret.json` as email.

### Model Selection and Tradeoffs

**Audio Models (Whisper):**

| Model | Speed | Accuracy | Best For |
|-------|-------|----------|----------|
| `tiny` | Fastest | Lowest | Quick tests, simple speech |
| `base` | Fast | Good | **Default - balanced option** |
| `small` | Medium | Better | Better accuracy, still reasonable speed |
| `medium` | Slow | Very good | High accuracy needs |
| `large` | Slowest | Best | Maximum accuracy, lots of time |

**LLM Models:**

| Provider | Model | Speed | Quality | Cost |
|----------|-------|-------|---------|------|
| Google | `gemini-2.0-flash-exp` | Fast | Very good | Low |
| Google | `gemini-2.5-pro` | Medium | Excellent | Medium |
| OpenAI | `gpt-4o-mini` | Fast | Good | Low |
| OpenAI | `gpt-4o` | Medium | Excellent | Higher |
| Anthropic | `claude-3-5-sonnet-20241022` | Medium | Excellent | Medium |

**Recommendation**: Start with `gemini-2.0-flash-exp` (fast and good quality).

### Email Setup

**Option 1: Gmail (Recommended)**
1. Set `EMAIL_PROVIDER=gmail` in `.env`
2. Obtain `client_secret.json` from Google Cloud Console
3. First run will open browser for login
4. Subsequent runs use saved token

**Option 2: SMTP Server**
1. Set `EMAIL_PROVIDER=smtp` in `.env`
2. Configure SMTP settings (host, port, credentials)
3. No browser authentication needed

---

## Common Workflows

### Workflow 1: Full Pipeline with Email

**Goal**: Process meeting, generate summaries, email results to team.

```bash
python process_gmeet_recording.py \
    dailies_2024-01-15.mp4 \
    shotgrid_playlist_2024-01-15.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    team@studio.com \
    --drive-url "https://drive.google.com/file/d/1aB2cD3eF4gH5iJ/view" \
    --parallel \
    --verbose
```

**Expected result:**
- CSV file created
- Email sent with HTML table and attachments
- Timestamps clickable (jump to Drive video)

---

### Workflow 2: CSV Output Only (No Email)

**Goal**: Generate CSV for your own use, skip email.

```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --output my_results.csv
```

**Note**: Don't provide `recipient_email` parameter - pipeline will skip Stage 4.

---

### Workflow 3: Process Partial Video (Testing)

**Goal**: Test on first 5 minutes before processing the full hour-long meeting.

```bash
python process_gmeet_recording.py \
    long_meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --duration 300 \
    --verbose
```

**Tip**: Use `--start-time 600` to skip the first 10 minutes if the review starts later.

---

### Workflow 4: Using Google Drive URLs

**Goal**: Process video stored in Google Drive without manual download.

```bash
python process_gmeet_recording.py \
    "https://drive.google.com/file/d/1aB2cD3eF4gH5iJ/view" \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    recipient@studio.com
```

**Benefits:**
- No manual download required (downloads and cleans up automatically in the background)
- Automatic authentication handling
- Works directly with shared Drive links

**Note**: First run will open browser for Google Drive authentication.

---

### Workflow 5: Generate Timeline Report

**Goal**: Get a chronological CSV showing when each version appeared in the review.

```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --timeline-csv version_timeline.csv
```

**Timeline CSV format:**
- Shows versions in the order they were reviewed
- Includes timestamp when each version first appeared
- Useful for understanding review sequence

**Use cases:**
- Quick reference to find when specific versions were discussed
- Foundation for building additional tools and integrations
- Can be used to develop review system plugins or desktop UIs that allow searching for versions and jumping directly to relevant discussions in the recorded video

---

### Workflow 6: Debug Mode (Keep All Intermediate Files)

**Goal**: Troubleshoot issues by examining intermediate processing steps.

```bash
python process_gmeet_recording.py \
    meeting.mp4 \
    sg_playlist.csv \
    --version-pattern "v(\d+)" \
    --version-column "version" \
    --model gemini-2.0-flash-exp \
    --keep-intermediate \
    --verbose
```

**Preserved files (in temp directory):**
- `gmeet_data.csv` - Stage 1 output (transcript + visual detection)
- `gmeet_and_sg_data.csv` - Stage 2 output (merged with SG)
- Visual detection intermediate files

**Temp directory location** shown in output, e.g.:
```
Temp directory: /tmp/gmeet_recording_abc123/
```

---

## Troubleshooting Guide

### General Debugging Approach

When something goes wrong, follow this workflow:

1. **Run with verbose mode**: Add `--verbose` flag to see detailed progress
2. **Keep intermediate files**: Add `--keep-intermediate` to examine each stage
3. **Test individual stages**: Run standalone tools to isolate the problem
4. **Check configuration**: Verify `.env` settings and credentials

### Stage-by-Stage Debugging

**If Stage 1 fails (Google Meet extraction):**

```
=== Stage 1: Extracting Google Meet Data ===
Error: Failed to extract Google Meet data
```

**Troubleshooting steps:**

1. Test audio transcription separately:
   ```bash
   python get_audio_transcript.py meeting.mp4 -o test_transcript.csv -v
   ```

2. Test visual detection separately:
   ```bash
   python get_onscreen_text.py meeting.mp4 --version-pattern "v(\d+)" -v
   ```

3. Check your version pattern:
   ```bash
   # Test on a single screenshot
   python get_onscreen_text.py screenshot.png --version-pattern "your-pattern" -v
   ```

**Common causes:**
- FFmpeg not installed (audio extraction fails)
- Invalid version pattern (no versions detected)
- Video format not supported

---

**If Stage 2 fails (Data combination):**

```
=== Stage 2: Combining with ShotGrid Data ===
Error: Failed to combine data
```

**Troubleshooting steps:**

1. Check that intermediate file was created:
   ```bash
   # Look in temp directory shown in output
   ls /tmp/gmeet_recording_*/
   cat /tmp/gmeet_recording_*/gmeet_data.csv
   ```

2. Test combination separately:
   ```bash
   python combine_data_from_gmeet_and_sg.py \
       sg_playlist.csv \
       /tmp/gmeet_recording_*/gmeet_data.csv \
       --version-columns "version,version_id" \
       --version-pattern "(\d+)" \
       --output test_combined.csv
   ```

**Common causes:**
- Version column name mismatch (`--version-column` wrong)
- Version pattern doesn't extract matching numbers
- ShotGrid CSV format unexpected

---

**If Stage 3 fails (LLM summaries):**

```
=== Stage 3: Generating LLM Summaries ===
Error: Failed to generate LLM summaries
```

**Troubleshooting steps:**

1. Check that provider is enabled:
   ```bash
   # Look in .env file
   grep "USE_.*_LLM" ../backend/.env
   ```

2. Test LLM service separately:
   ```bash
   python llm_service.py \
       --provider google \
       --model gemini-2.0-flash-exp \
       --text "Test summary"
   ```

3. Check for Gemini safety filter blocks:
   ```bash
   # Look for debug files
   ls ./debug_gemini_*.json
   ```

**Common causes:**
- API key not set or invalid
- Provider not enabled in `.env`
- Model name incorrect
- Rate limiting (too many API calls)
- Safety filters (Gemini-specific)

---

**If Stage 4 fails (Email):**

```
=== Stage 4: Sending Email ===
Warning: Email send failed
```

**Troubleshooting steps:**

1. Check email configuration:
   ```bash
   # Look in .env file
   grep "EMAIL" ../backend/.env
   ```

2. Test email separately:
   ```bash
   python email_service.py test@studio.com final_results.csv
   ```

3. Re-authenticate Gmail (if using Gmail):
   ```bash
   # Delete old token and re-run
   rm ../backend/token.json
   python email_service.py test@studio.com results.csv
   ```

**Common causes:**
- EMAIL_SENDER not set
- Gmail token expired (delete `token.json` and re-authenticate)
- SMTP credentials incorrect
- Firewall blocking SMTP connection

---

### Common Error Messages

**"FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'"**

**Problem**: FFmpeg is not installed.

**Solution**: Install FFmpeg:
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

---

**"Error: Model 'gemini-xyz' not found or provider not enabled"**

**Problem**: LLM provider not configured or model name wrong.

**Solution**:
1. Check `.env` has `USE_GOOGLE_LLM=true` and `GOOGLE_API_KEY=your-key`
2. Verify model name is correct (check `llm_models.yaml`)

---

**"ValueError: Version pattern did not match any versions"**

**Problem**: Your `--version-pattern` doesn't match the version IDs in your video.

**Solution**:
1. Check what's actually on screen (take a screenshot)
2. Test your pattern:
   ```bash
   python get_onscreen_text.py screenshot.png --version-pattern "your-pattern" -v
   ```
3. Adjust pattern to match format (see [Appendix: Version Pattern Examples](#version-pattern-examples))

---

**"Exception: No frames with version IDs detected"**

**Problem**: Visual detection didn't find any version IDs.

**Solution**:
1. Verify version IDs are visible in the video
2. Check `--frame-interval` (try a smaller value like `2.0` for more frequent checking)
3. Ensure `--version-pattern` matches your format

---

**"google.auth.exceptions.RefreshError"**

**Problem**: Gmail OAuth token expired or invalid.

**Solution**:
```bash
# Delete token and re-authenticate
rm experimental/spi/note_assistant_v2/backend/token.json

# Re-run - browser will open for login
python email_service.py test@studio.com results.csv
```

---

### Preserving Intermediate Files for Inspection

When you use `--keep-intermediate`, the pipeline preserves temporary files. Here's how to examine them:

1. **Note the temp directory** from the output:
   ```
   Temp directory: /tmp/gmeet_recording_abc123/
   ```

2. **Examine intermediate files:**
   ```bash
   # Stage 1 output
   cat /tmp/gmeet_recording_abc123/gmeet_data.csv

   # Stage 2 output
   cat /tmp/gmeet_recording_abc123/gmeet_and_sg_data.csv
   ```

3. **What to look for:**
   - **gmeet_data.csv**: Check if transcription is accurate, speaker names correct, version IDs detected
   - **gmeet_and_sg_data.csv**: Verify SG notes merged correctly, conversations grouped properly

---

## FAQ

### How long does processing take?

Processing time depends on multiple factors:
- Video length
- Hardware resources (CPU/GPU, available memory)
- Audio model selection (tiny/base/small/medium/large)
- Frame interval settings
- Whether parallel processing is enabled

**Speed up processing:**
- Use `--parallel` flag (processes audio and video simultaneously)
- Use `--audio-model tiny` (faster transcription, lower accuracy)
- Use faster LLM models like `gemini-2.0-flash-exp`

**What affects processing time:**
- Audio transcription is CPU-intensive (runs locally via Whisper)
- Visual detection requires processing many frames
- LLM summaries require API calls for each version

---

### Which audio model should I use?

**For most cases**: `base` (default)
- Good balance of speed and accuracy
- Handles most meeting audio well

**If transcription quality is poor**:
- Try `small` or `medium`
- Check if there's background noise or poor audio quality

**If speed is critical**:
- Use `tiny` for quick tests
- Results may have more transcription errors

**When you have time**:
- Use `large` for maximum accuracy
- Best for important meetings or difficult audio

---

### What if my version pattern is different?

Version patterns use "regular expressions" to match your version ID format. See [Appendix: Version Pattern Examples](#version-pattern-examples) for common formats.

**Steps to figure out your pattern:**

1. Look at what appears on screen in your video
2. Find the pattern in [Appendix](#version-pattern-examples) that matches
3. Test it on a screenshot:
   ```bash
   python get_onscreen_text.py screenshot.png --version-pattern "your-pattern" -v
   ```

**If you can't find a matching pattern**, ask your technical contact - they can help create a custom pattern.

---

### Can I process multiple videos at once?

**No** - the pipeline processes one video at a time.

**Workaround**: Write a simple shell script to run multiple processing jobs:

```bash
#!/bin/bash
python process_gmeet_recording.py video1.mp4 sg1.csv --version-pattern "v(\d+)" --version-column "version" --model gemini-2.0-flash-exp
python process_gmeet_recording.py video2.mp4 sg2.csv --version-pattern "v(\d+)" --version-column "version" --model gemini-2.0-flash-exp
python process_gmeet_recording.py video3.mp4 sg3.csv --version-pattern "v(\d+)" --version-column "version" --model gemini-2.0-flash-exp
```

---

### How do I know if it's working?

**Use verbose mode** to see detailed progress:

```bash
python process_gmeet_recording.py meeting.mp4 sg.csv \
    --version-pattern "v(\d+)" --version-column "version" \
    --model gemini-2.0-flash-exp \
    --verbose
```

**You'll see:**
- Stage completion messages: `✓ Stage 1 complete`
- Progress indicators: `Transcribing audio...`, `Processing frames...`
- Detection results: `Found 23 transcript versions`, `Loaded 45 ShotGrid versions`
- LLM progress: Processing summaries for each version

**Warning signs:**
- Process stuck for >10 minutes with no output
- Error messages in red
- `Error:` or `Warning:` messages

---

### What if I don't have a ShotGrid CSV?

The pipeline requires both:
1. Video recording
2. ShotGrid CSV export

**If you don't have the SG CSV**, you can still extract meeting data:

```bash
python get_data_from_google_meet.py meeting.mp4 \
    --version-pattern "v(\d+)" \
    -o meeting_data.csv
```

This gives you timestamps, transcripts, and version IDs, but you won't get:
- ShotGrid notes merged in
- LLM summaries (requires combined data)
- Email formatting with shot names

---

### Can I customize the AI summary style?

**Currently**: Summaries use pre-defined prompts configured in `llm_prompts.yaml`.

**To change prompt type**:
```bash
python process_gmeet_recording.py ... --prompt-type detailed
```

**Available prompt types** depend on your `llm_prompts.yaml` configuration. Common types:
- `short` (default): Concise summaries
- `detailed`: More comprehensive summaries

**To create custom prompts**: Edit `llm_prompts.yaml` (requires technical knowledge).

---

### What's the difference between `notes` and `summary` columns?

**`notes` column**:
- Comes from ShotGrid
- Written before/during the meeting
- Manually entered by artists or coordinators
- May not include all discussion points

**`summary` column**:
- Generated by AI
- Based on actual meeting conversation
- Captures what was said during review
- May include context not in original notes

**Best practice**: Use both together:
- `notes`: Original intent/context
- `summary`: What was actually discussed
- `transcription`: Full verbatim conversation

---

### How does caching work?

**What gets cached?**

When using organized output mode (`--output` as directory + `--project`), Google Drive recordings are automatically cached locally to avoid re-downloading.

**Cache location:**
```
{output_dir}/{project}/{recording_name}/recording.mp4
```

**How caching works:**

1. **First run**:
   - Downloads from Google Drive
   - Saves to cache location
   - Processes video

2. **Subsequent runs**:
   - Checks if cached file exists
   - Validates file size matches
   - Uses cached version (skips download)

**When is cache used?**
- Same Google Drive link
- Same project name
- Same output directory
- Recording hasn't changed

**Force refresh:**
```bash
# Re-download even if cached
--force-download
```

**Cache benefits:**
- **Speed**: Skip 100MB+ downloads
- **Offline**: Process without internet
- **Bandwidth**: Avoid redundant downloads

**Clearing cache:**

Simply delete the recording directory:
```bash
rm -rf /outputs/myproject/Daily_Review_2025_01_15/
```

**Important notes:**
- Cache only works with `--output` directory mode
- Requires `--project` parameter
- Each recording gets its own subdirectory
- Multiple recordings per project won't overwrite each other

---

## Appendix

### ShotGrid CSV Export Instructions

To export a playlist from ShotGrid:

1. Open your playlist in ShotGrid
2. Click the "Export" button (usually top right)
3. Select "CSV" format
4. Choose which columns to include (make sure to include your version column)
5. Download the CSV file

**Important**: Note the column name that contains version information (e.g., "Version", "Code", "Version Name") - you'll need this for `--version-column`.

---

### Version Pattern Examples

Version patterns use "regular expressions" to match your version ID format. Here are common examples:

| Your Format | Pattern | Explanation |
|-------------|---------|-------------|
| v001, v002, v123 | `"v(\d+)"` | "v" followed by captured digits |
| shot-001, shot-042 | `"shot-(\d+)"` | "shot-" followed by captured digits |
| proj-0042 | `"proj-(\d+)"` | "proj-" followed by captured digits |
| ABC_001_v01 | `"[A-Z]+_(\d+)_v\d+"` | Letters, underscore, captured digits, "_v", digits |
| render_0042 | `"render_(\d+)"` | "render_" followed by captured digits |
| Take 5, Take 12 | `"Take\s+(\d+)"` | "Take" followed by space and captured digits |
| ANY number | `"(\d+)"` | Just extract any number (with capture group) |

**Important: Capture Groups**
- Patterns must include parentheses `()` to capture the version number
- Everything inside `()` becomes the extracted version_id
- Example: `"v(\d+)"` captures "001" from "v001"
- Example: `"shot-(\d+)"` captures "042" from "shot-042"

**Special characters explained:**
- `\d` = any digit (0-9)
- `+` = one or more of the previous character
- `()` = capture group (REQUIRED - extracts the version number)
- `\.` = literal period (dot)
- `\s` = space
- `[A-Z]` = any capital letter
- `[A-Z]+` = one or more capital letters

**Testing your pattern:**
```bash
# Take a screenshot of a frame with the version ID visible
python get_onscreen_text.py screenshot.png --version-pattern "your-pattern" -v
```

---

### Output File Format Reference

**Main Output CSV** (`*_processed.csv`):

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `shot` | Text | Shot name from ShotGrid | `ABC_0010_lighting` |
| `version` | Text | Version identifier (column name varies) | `v003` or `ABC_0010_v003` |
| `notes` | Text | Original ShotGrid notes | `Lighting needs adjustment` |
| `transcription` | Text | Meeting conversation grouped by speaker | `John: Looks good. Mary: Increase highlights.` |
| `timestamp` | Time | When discussed (HH:MM:SS) | `00:15:32` |
| `reference_versions` | Text | Other versions mentioned briefly | `v002:00:14:12,v001:00:14:45` |
| `version_id` | Text | Extracted version number | `003` or `0042` |
| `summary` | Text | AI-generated summary | `Lighting approved with minor highlight adjustments needed` |
| `llm_provider` | Text | AI provider used | `google` |
| `llm_model` | Text | AI model used | `gemini-2.0-flash-exp` |
| `llm_prompt_type` | Text | Prompt style | `short` |
| `llm_error` | Text | Error if summary failed | (usually empty) |

---

**Timeline CSV** (optional `--timeline-csv`):

Shows chronological order of versions as they appeared in the review.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `timestamp` | Time | When version first appeared (HH:MM:SS) | `00:12:34` |
| `version_id` | Text | Version identifier | `v003` |

**Use case**: Understand the sequence in which versions were reviewed, which may differ from playlist order.

---

### Understanding Reference Versions

**What are reference versions?**

During a review, people often briefly mention other versions:
- "This looks better than v002"
- "Make it more like v001"
- "Compare with what we saw earlier"

**How detection works:**

The system analyzes how long each version is discussed:
- **Main discussion**: Talked about for more than threshold (default: 30 seconds)
- **Brief reference**: Mentioned for less than threshold

**Reference format in CSV:**
```
reference_versions: v002:00:14:12,v001:00:14:45
```

This means: "During this version's main discussion, v002 was mentioned at 14:12 and v001 at 14:45"

**Adjusting the threshold:**

If you find too many/too few references detected:
```bash
# More sensitive (detect shorter mentions as separate discussions)
--reference-threshold 15

# Less sensitive (treat longer mentions as references)
--reference-threshold 60
```

---

### Getting Help

**For troubleshooting:**
1. Run with `--verbose` and `--keep-intermediate` flags
2. Check error messages and refer to [Troubleshooting Guide](#troubleshooting-guide)
3. Examine intermediate CSV files
4. Test individual tools to isolate the problem

**For configuration issues:**
- Verify `.env` file settings
- Check credential files exist and are valid
- Ensure API keys are set correctly

**For questions about:**
- ShotGrid export: Contact your pipeline team
- Version patterns: Contact your technical lead
- Email setup: Contact your IT department
- Custom requirements: Contact your pipeline/tools team

---

## Quick Reference: All Commands

**Complete pipeline:**
```bash
python process_gmeet_recording.py VIDEO SG_CSV \
    --version-pattern PATTERN --version-column COLUMN \
    --model MODEL [EMAIL] [OPTIONS]
```

**Extract meeting data:**
```bash
python get_data_from_google_meet.py VIDEO --version-pattern PATTERN [OPTIONS]
```

**Audio transcription only:**
```bash
python get_audio_transcript.py VIDEO -o OUTPUT.csv [OPTIONS]
```

**Visual detection only:**
```bash
python get_onscreen_text.py VIDEO --version-pattern PATTERN [OPTIONS]
```

**Combine data:**
```bash
python combine_data_from_gmeet_and_sg.py SG_CSV TRANSCRIPT_CSV \
    --version-columns "sg_col,trans_col" --version-pattern PATTERN [OPTIONS]
```

**Generate summaries:**
```bash
python llm_service.py --csv-input INPUT --csv-output OUTPUT \
    --provider PROVIDER --model MODEL [OPTIONS]
```

**Send email:**
```bash
python email_service.py EMAIL CSV [OPTIONS]
```

---

**End of User Guide**
