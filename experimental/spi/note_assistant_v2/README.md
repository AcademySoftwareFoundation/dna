# Dailies Note Assistant v2 (DNA)

An AI-powered assistant that joins Google Meet sessions to capture audio transcriptions and generate summaries for specific shots during dailies review sessions.

## Overview

The Dailies Note Assistant v2 is a full-stack application designed to streamline the process of taking notes during film/animation dailies review sessions. The application can join Google Meet calls, transcribe conversations in real-time, and generate AI-powered summaries for specific shots using LLM models.

## Architecture

- **Frontend**: React application with Vite build system
- **Backend**: FastAPI server with multiple services
- **AI Integration**: Support for multiple LLM providers (OpenAI, Claude, Gemini, Ollama)
- **Email Service**: Gmail API integration for sending notes
- **Real-time Transcription**: WebSocket-based live transcription

## Features

- 🎯 **Shot-based Organization**: Upload CSV playlists to organize notes by shot/version
- 🎤 **Live Transcription**: Real-time audio transcription from Google Meet sessions
- 🤖 **AI Summaries**: Generate concise summaries using various LLM providers
- 📧 **Email Integration**: Send formatted notes via Gmail
- 📊 **Export Functionality**: Download notes as CSV files
- 🎯 **Pin/Focus System**: Pin specific shots to capture targeted transcriptions

## Prerequisites

- Python 3.9 or higher
- Node.js 18 or higher
- Google Cloud Project with Gmail API enabled
- API keys for desired LLM providers (optional)

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
GMAIL_SENDER=your-email@gmail.com

# LLM API Keys (optional - set DISABLE_LLM=true to use mock responses)
DISABLE_LLM=false
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-claude-api-key
GEMINI_API_KEY=your-gemini-api-key

# For Ollama (if using local models)
# Ensure Ollama is running on localhost:11434
```

5. Set up Gmail API credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create or select a project
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Download the credentials and save as `client_secret.json` in the backend directory

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

1. **Upload Playlist**: 
   - Drag and drop or click to upload a CSV file containing shot/version information
   - The first column should contain shot names or version identifiers

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
   - Use "Download Notes" to export as CSV
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

- `POST /upload-playlist` - Upload CSV playlist
- `POST /llm-summary` - Generate AI summary from text
- `POST /email-notes` - Send notes via email
- WebSocket endpoints for real-time transcription

## Configuration

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
- `email_service.py` - Gmail API integration
- `note_service.py` - LLM summary generation
- `playlist.py` - CSV upload handling

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

1. **Gmail API Authentication**:
   - Ensure `client_secret.json` is properly configured
   - Check that Gmail API is enabled in Google Cloud Console

2. **LLM API Errors**:
   - Verify API keys are correctly set
   - Check API rate limits and quotas
   - Use `DISABLE_LLM=true` for testing without LLM calls

3. **WebSocket Connection Issues**:
   - Ensure backend server is running on port 8000
   - Check firewall settings for WebSocket connections

4. **File Upload Problems**:
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
