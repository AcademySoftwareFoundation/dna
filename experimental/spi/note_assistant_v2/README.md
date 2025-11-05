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
- 🎥 **ShotGrid Integration**: Connect directly to ShotGrid projects and playlists for seamless workflow
- 🎤 **Live Transcription**: Real-time audio transcription from Google Meet sessions
- 🤖 **AI Summaries**: Generate concise summaries using various LLM providers
- 📧 **Email Integration**: Send formatted notes via Gmail or SMTP
- 📊 **Export Functionality**: Download notes as CSV files or raw transcripts as TXT files
- 🎯 **Pin/Focus System**: Pin specific shots to capture targeted transcriptions
- 🎭 **Demo Mode**: Anonymize sensitive data for demonstrations and screenshots

## Quick Start

### Prerequisites

- Python 3.9 or higher
- Node.js 18 or higher
- Google Cloud Project with Gmail API enabled (optional)
- ShotGrid access with API credentials (optional)
- API keys for desired LLM providers (optional)
- Vexa.ai account or self-hosted instance for Google Meet transcription bot management

### Installation

1. **Backend Setup**:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On macOS/Linux
pip install -r requirements.txt
```

2. **Frontend Setup**:
```bash
cd frontend
npm install
```

3. **Environment Configuration**:
Create a `.env` file in the backend directory:
```bash
# Basic Configuration
EMAIL_SENDER=your-email@gmail.com
DISABLE_LLM=false

# Optional: Add API keys for LLM providers
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-claude-key

# Optional: ShotGrid integration
SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
SHOTGRID_SCRIPT_NAME=your-script-name
SHOTGRID_API_KEY=your-api-key
```

### Running the Application

1. **Start Backend**:
```bash
cd backend
python -m uvicorn main:main --reload --port 8000
```

2. **Start Frontend**:
```bash
cd frontend
npm run dev
```

3. **Access Application**: Open `http://localhost:5173`

## First-Time Setup

After installation, you'll need to complete authentication setup:

1. **Gmail Authentication** (if using Gmail API): Run `python email_service.py` in backend directory for browser-based OAuth setup
2. **Vexa.ai Setup**: Configure API keys in frontend `.env.local` file
3. **LLM Providers**: Add API keys to backend `.env` file for desired AI models
4. **ShotGrid** (optional): Verify connection with your studio's ShotGrid instance

See [Installation Guide](docs/INSTALLATION.md) for detailed authentication steps.

## Basic Usage

1. **Upload Shot List**: Drag and drop a CSV file or use ShotGrid integration
2. **Join Google Meet**: Enter meeting URL or ID and click "Join"
3. **Capture Transcriptions**: Pin shots and toggle "Get Transcripts"
4. **Generate Summaries**: Click refresh button to generate AI summaries
5. **Export Notes**: Download as CSV or email formatted notes

## Documentation

For detailed setup, configuration, and usage instructions, see the [docs](docs/) directory:

- **[Installation Guide](docs/INSTALLATION.md)** - Complete setup instructions
- **[Configuration](docs/CONFIGURATION.md)** - Environment variables, LLM setup, demo mode
- **[Integrations](docs/INTEGRATIONS.md)** - Vexa.ai, ShotGrid, LLM backend routing  
- **[Usage Guide](docs/USAGE.md)** - Step-by-step application usage
- **[Development](docs/DEVELOPMENT.md)** - Development setup and contributing
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## License

See the main repository for licensing information.

## Support

For issues and questions, please use the GitHub issues tracker in the main repository.
