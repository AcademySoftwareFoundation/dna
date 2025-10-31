# Dailies Note Assistant v2 (DNA)

An AI-powered assistant that joins Google Meet sessions to capture audio transcriptions and generate summaries for specific shots during dailies review sessions.

## Overview

The Dailies Note Assistant v2 is a full-stack application designed to streamline the process of taking notes during film/animation dailies review sessions. The application can join Google Meet calls, transcribe conversations in real-time, and generate AI-powered summaries for specific shots using LLM models.

## Architecture

- **Frontend**: React application with Vite build system
- **Backend**: FastAPI server with multiple services
- **AI Integration**: Support for multiple LLM providers (OpenAI, Claude, Gemini, Ollama)
- **Email Service**: Gmail API or SMTP server integration for sending notes
- **ShotGrid Integration**: Optional direct integration with ShotGrid for project and playlist management
- **Real-time Transcription**: WebSocket-based live transcription

## Features

- 🎯 **Shot-based Organization**: Upload CSV playlists or import from ShotGrid to organize notes by shot/version
- �️ **ShotGrid Integration**: Connect directly to ShotGrid projects and playlists for seamless workflow
- �🎤 **Live Transcription**: Real-time audio transcription from Google Meet sessions
- 🤖 **AI Summaries**: Generate concise summaries using various LLM providers
- 📧 **Email Integration**: Send formatted notes via Gmail or SMTP
- 📊 **Export Functionality**: Download notes as CSV files or raw transcripts as TXT files
- 🎯 **Pin/Focus System**: Pin specific shots to capture targeted transcriptions
- 🎭 **Demo Mode**: Anonymize sensitive data for demonstrations and screenshots

## Prerequisites

- Python 3.9 or higher
- Node.js 18 or higher
- Google Cloud Project with Gmail API enabled
- **ShotGrid access** with API credentials (optional - for production pipeline integration)
- API keys for desired LLM providers (optional)
- **Vexa.ai account or self-hosted instance** for Google Meet transcription bot management

## Vexa.ai Integration

This application uses [Vexa.ai](https://vexa.ai/) to manage the Google Meet transcription bots that capture audio during dailies sessions. Vexa provides the infrastructure to programmatically join Google Meet calls and stream real-time transcriptions.

### Vexa Setup Options

**Option 1: Cloud Subscription (Recommended)**
- Sign up for a Vexa.ai cloud account at [https://vexa.ai/get-started](https://vexa.ai/get-started)
- Obtain your API key from the Vexa dashboard
- No additional setup required

**Option 2: Self-Hosted**
- Follow the self-hosting documentation at [https://vexa.ai/get-started](https://vexa.ai/get-started)
- Deploy Vexa on your own infrastructure
- Configure the API endpoint and authentication

### Vexa Configuration

Add your Vexa credentials to the frontend environment:

```bash
# .env.local in frontend directory
VITE_VEXA_API_URL=https://api.vexa.ai  # or your self-hosted URL
VITE_VEXA_API_KEY=your_vexa_api_key_here
```

The application communicates with Vexa to:
- Join Google Meet sessions with transcription bots
- Stream real-time audio transcriptions via WebSocket
- Manage bot lifecycle (join/leave meetings)

For detailed Vexa setup instructions, API documentation, and troubleshooting, visit [https://vexa.ai/get-started](https://vexa.ai/get-started).

#### API Routing (Optional)

The backend provides optional VEXA API routing to bypass CORS restrictions when accessing VEXA services directly from the frontend.

**Configuration:**
Set the following environment variables in your `.env` file:

```bash
# VEXA Configuration
VEXA_BASE_URL=http://localhost:18056
VEXA_API_KEY=your_vexa_api_key
VEXA_ADMIN_KEY=your_vexa_admin_key
```

If `VEXA_BASE_URL` is not configured, the VEXA routing endpoints will be disabled.

**Available Endpoints:**

HTTP Endpoints:
- `GET /vexa/bots/status` - Get running bots status
- `POST /vexa/bots` - Request a new bot
- `DELETE /vexa/bots/{platform}/{native_meeting_id}` - Stop a bot

WebSocket Proxy:
- `WS /vexa/ws` - WebSocket proxy to VEXA backend

The WebSocket proxy forwards all query parameters and messages bidirectionally between your frontend and the VEXA backend, allowing you to use the same client code for both direct VEXA connections and proxied connections.

**Usage:**
To use the backend VEXA routing, update your frontend `.local.env` file to point to the backend instead of the VEXA API directly:

```bash
# Frontend .local.env - Direct VEXA connection
VITE_VEXA_BASE_URL=http://localhost:18056

# Frontend .local.env - Via backend proxy (when CORS is an issue)
VITE_VEXA_BASE_URL=http://localhost:8000/vexa
```

Frontend code can use the same WebSocket connection logic for both scenarios:

```javascript
// Direct VEXA connection
const ws = new WebSocket('ws://localhost:18056/ws?api_key=your_key&platform=zoom&...');

// Proxied through backend (when CORS is an issue)
const ws = new WebSocket('ws://localhost:8000/vexa/ws?api_key=your_key&platform=zoom&...');
```

The backend will automatically proxy all messages and handle connection lifecycle management.

## ShotGrid Integration (Optional)

The application integrates directly with ShotGrid (formerly Shotgun) to provide seamless access to your studio's project and playlist data. This allows users to select shots directly from existing ShotGrid playlists rather than manually uploading CSV files. Note this is optional and the application can work with traditional CSV import/export for other production tracking systems.

### ShotGrid Setup

1. **Create a Script User in ShotGrid**:
   - Go to your ShotGrid site admin panel
   - Navigate to Scripts and create a new script user
   - Note the script name and generate an API key

2. **Configure Field Names**:
   - Identify the field names in your ShotGrid schema for shots and versions
   - Common examples: `code`, `sg_shot`, `sg_version`, etc.

3. **Set Project Type Filters**:
   - Determine which project types should appear in the active projects list
   - Examples: `Feature`, `Episodic`, `Commercial`, etc.

### ShotGrid Configuration in .env

```bash
SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
SHOTGRID_SCRIPT_NAME=your-script-name
SHOTGRID_API_KEY=your-api-key
SHOTGRID_SHOT_FIELD=code  # or your shot field name
SHOTGRID_VERSION_FIELD=code  # or your version field name  
SHOTGRID_TYPE_FILTER=Feature,Episodic  # comma-separated project types
```

The ShotGrid integration provides:
- **Project Selection**: Browse active projects filtered by type
- **Playlist Access**: View recent playlists for selected projects
- **Shot Import**: Import shots/versions directly from ShotGrid playlists
- **Demo Mode**: Anonymize ShotGrid data for demonstrations (see Demo Mode section)

**ShotGrid integration is completely optional.** The application can function without ShotGrid by using CSV file uploads for shot lists instead.

#### Disabling ShotGrid Integration

To disable ShotGrid integration:

1. **Comment out or remove the `SHOTGRID_URL` environment variable** in your `.env` file:
   ```bash
   # ShotGrid Configuration (comment out SHOTGRID_URL to disable ShotGrid integration)
   # SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
   SHOTGRID_SCRIPT_NAME=your-script-name  # These can remain but won't be used
   SHOTGRID_API_KEY=your-api-key
   ```

2. **The ShotGrid UI will be automatically hidden** when the backend detects no `SHOTGRID_URL` is configured.

3. **Use CSV uploads instead** - The "Upload Playlist" section will still be available for importing shot lists via CSV files.

#### Benefits of Disabling ShotGrid

- **No ShotGrid dependencies**: No need for ShotGrid access, credentials, or network connectivity
- **Simplified setup**: Faster installation and configuration  
- **Standalone operation**: Use the application in environments without ShotGrid access
- **CSV-based workflow**: Still maintain shot-based organization using CSV file uploads

#### When to Use Each Approach

**Use ShotGrid Integration When**:
- You have active ShotGrid projects and playlists
- You want seamless integration with existing studio pipelines
- You need to access up-to-date project and shot information
- Multiple users need consistent access to the same shot lists

**Use CSV Upload When**:
- ShotGrid is not available or accessible
- Working with external vendors or clients
- Prototyping or testing the application
- You prefer manual control over shot lists
- Working in isolated or air-gapped environments

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On macOS/Linux
# or
.venv\Scripts\activate  # On Windows
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
Create a `.env` file in the backend directory:
```bash
# Gmail Configuration
EMAIL_SENDER=your-email@gmail.com

# LLM API Keys (optional - set DISABLE_LLM=true to use mock responses)
DISABLE_LLM=false
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-claude-api-key
GEMINI_API_KEY=your-gemini-api-key

# ShotGrid Configuration (optional - comment out SHOTGRID_URL to disable)
SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
SHOTGRID_SCRIPT_NAME=your-script-name
SHOTGRID_API_KEY=your-api-key
SHOTGRID_SHOT_FIELD=shot_field_name
SHOTGRID_VERSION_FIELD=version_field_name
SHOTGRID_TYPE_FILTER=Project,Types,To,Include

# Demo Mode - anonymize data when set to true
DEMO_MODE=false

# For Ollama (if using local models)
# Ensure Ollama is running on localhost:11434
```

5. Set up email sending (choose Gmail API or SMTP):
   
   **Option A: Gmail API (recommended for Google accounts)**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create or select a project
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Download the credentials and save as `client_secret.json` in the backend directory
   - **Generate `token.json` for Gmail API authentication:**
     - Run the following command in your backend directory:
       ```bash
       python email_service.py
       ```
     - The first time you run this, it will launch a browser window for Google authentication.
     - After you log in and authorize, a `token.json` file will be created automatically.
     - This file is required for sending emails via the Gmail API.
   
   **Option B: SMTP Server (for non-Gmail or internal mail servers)**
   - Set the following environment variables in your `.env` file:
     ```bash
     EMAIL_PROVIDER=smtp
     EMAIL_SENDER=your@email.com
     SMTP_HOST=smtp.yourserver.com   # or 'localhost' for local testing
     SMTP_PORT=587                   # or your server's port
     SMTP_USER=your_smtp_username    # optional if your server does not require auth
     SMTP_PASSWORD=your_smtp_password # optional if your server does not require auth
     SMTP_TLS=true                   # set to 'true' if your server requires TLS (default is 'false')
     ```
   - The backend will use these settings to send emails via SMTP instead of Gmail API.
   - You can test your SMTP configuration by running:
     ```bash
     python email_service.py
     ```
   - If SMTP is configured, a test email will be sent using your SMTP settings.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Create environment configuration (optional):
Create a `.env.local` file for development settings:
```bash
# Enable mock mode for testing without authentication
VITE_MOCK_MODE=false
VITE_VEXA_API_URL=http://localhost:18056 # point to where VEXA server is located
VITE_VEXA_API_KEY=your_vexa_client_api_key_here
```

## Usage

### Starting the Application

1. **Start the Backend Server**:
```bash
cd backend
python -m uvicorn main:main --reload --port 8000
```
The API will be available at `http://localhost:8000`

2. **Start the Frontend Development Server**:
```bash
cd frontend
npm run dev
```
The web interface will be available at `http://localhost:5173`

### Using the Application

1. **Choose Your Shot Source**:
   - **Option A - Upload CSV**: Drag and drop a CSV file with shot/version information
   - **Option B - ShotGrid Integration**: Select an active ShotGrid project and playlist to import shots (if enabled)

2. **Join Google Meet**:
   - Enter a Google Meet URL or Meeting ID
   - Click "Join" to start the bot transcription service

3. **Capture Transcriptions**:
   - Use the "Pin" button on specific shots to focus transcription capture
   - Toggle "Get Transcripts" to start/pause real-time transcription
   - Transcriptions will appear in the corresponding shot rows

4. **Generate Summaries**:
   - Click the refresh button in the Summary column to generate AI summaries
   - Summaries are generated from the transcription text using configured LLM

5. **Export and Share**:
   - Use "Download Notes" to export structured notes as CSV
   - Use "Download Transcript" to export raw transcriptions as TXT file
   - Enter an email address and click "Email Notes" to send formatted notes

### CSV Format

The playlist CSV should have the following format:
```csv
Shot/Version,Description
shot_010_v001,Character animation scene
shot_020_v002,Lighting pass
```
Only the first column (shot identifier) is required.

## API Endpoints

### Core Functionality
- `GET /config` - Get application configuration (includes ShotGrid availability)
- `POST /upload-playlist` - Upload CSV playlist
- `POST /llm-summary` - Generate AI summary from text
- `POST /email-notes` - Send notes via email (Gmail API or SMTP, depending on configuration)

### ShotGrid Integration
- `GET /shotgrid/active-projects` - Get list of active ShotGrid projects
- `GET /shotgrid/latest-playlists/{project_id}` - Get recent playlists for a project
- `GET /shotgrid/playlist-items/{playlist_id}` - Get shots/versions from a playlist
- `GET /shotgrid/most-recent-playlist-items` - Get items from most recent playlist

### Real-time Communication
- WebSocket endpoints for real-time transcription

## Configuration

### Demo Mode

The backend supports a **Demo Mode** that anonymizes sensitive data from ShotGrid before returning it to the frontend. This is useful for demonstrations, screenshots, or sharing the application without exposing real project information.

Add the following line to your `.env` file in the backend directory:

```bash
# Demo Mode - anonymize data when set to true
DEMO_MODE=false
```

Set `DEMO_MODE=true` to enable anonymization, or `DEMO_MODE=false` (or omit entirely) to use real data.

#### How Demo Mode Works

When demo mode is enabled, the system:

1. **Fetches real data from ShotGrid** - All ShotGrid queries work normally
2. **Anonymizes data before returning** - Text is scrambled using consistent hashing
3. **Preserves data structure** - IDs, dates, and relationships remain intact
4. **Maintains consistency** - The same input always produces the same anonymized output

#### What Gets Anonymized

- **Project codes**: `SPIDERMAN_001` → `PROJ_70B19AF5_001`
- **Project names**: `Spider-Man: No Way Home` → `PROJECT_2B76F2DD`
- **Playlist codes**: `dailies_review_v3` → `PLAYLIST_8A3F9B12`
- **Shot names**: `shot_010/v001` → `A1B2C/12345` (5 chars max / 5-digit version)

**Note**: Database IDs, dates, and relationships remain unchanged to preserve functionality.

### LLM Providers

The application supports multiple LLM providers:

- **OpenAI**: GPT-4 and other models
- **Claude**: Anthropic's Claude models  
- **Gemini**: Google's Gemini models
- **Ollama**: Local models via Ollama server

Configure by setting the appropriate API keys in the `.env` file.

### Mock Mode

For development and testing, set `DISABLE_LLM=true` to use mock responses instead of actual LLM calls.

## Development

### Backend Development

The backend uses FastAPI with the following structure:
- `main.py` - Main application and routing
- `email_service.py` - Gmail API and SMTP integration
- `note_service.py` - LLM summary generation
- `playlist.py` - CSV upload handling
- `shotgrid_service.py` - ShotGrid API integration and demo mode

### Frontend Development

The frontend is built with:
- React 18 with hooks
- Vite for build tooling
- WebSocket for real-time communication
- Modern CSS for styling

To build for production:
```bash
cd frontend
npm run build
```

## Troubleshooting

### Common Issues

1. **Gmail API Authentication / SMTP Configuration**:
   - For Gmail: Ensure `client_secret.json` is properly configured and Gmail API is enabled in Google Cloud Console
   - For SMTP: Ensure your SMTP server details are correct and accessible from the backend

2. **LLM API Errors**:
   - Verify API keys are correctly set
   - Check API rate limits and quotas
   - Use `DISABLE_LLM=true` for testing without LLM calls

3. **ShotGrid Connection Issues**:
   - Verify ShotGrid URL, script name, and API key are correct
   - Ensure the script user has proper permissions
   - Check that field names match your ShotGrid schema
   - Confirm project type filters are valid
   - **If ShotGrid is not needed**: Comment out `SHOTGRID_URL` in `.env` to disable ShotGrid integration entirely

4. **WebSocket Connection Issues**:
   - Ensure backend server is running on port 8000
   - Check firewall settings for WebSocket connections

5. **File Upload Problems**:
   - Ensure CSV files are properly formatted
   - Check file size limits

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License
See the main repository for licensing information.

## Support

For issues and questions, please use the GitHub issues tracker in the main repository.


