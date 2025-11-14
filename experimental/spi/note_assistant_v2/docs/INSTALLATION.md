# Installation Guide

Complete setup instructions for the Dailies Note Assistant v2 application.

## Prerequisites

- Python 3.9 or higher
- Node.js 18 or higher
- Google Cloud Project with Gmail API enabled (optional)
- ShotGrid access with API credentials (optional)
- API keys for desired LLM providers (optional)
- Vexa.ai account or self-hosted instance for Google Meet transcription bot management

## Backend Setup

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Create Virtual Environment

```bash
python -m venv .venv
source .venv/bin/activate  # On macOS/Linux
# or
.venv\Scripts\activate  # On Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Environment Configuration

Create a `.env` file in the backend directory:

```bash
# Basic Configuration
EMAIL_SENDER=your-email@gmail.com
DISABLE_LLM=false

# LLM API Keys (optional - set DISABLE_LLM=true to use mock responses)
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

### 5. Email Service Setup

Choose Gmail API or SMTP for email functionality:

#### Option A: Gmail API (Recommended for Google Accounts)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Download the credentials and save as `client_secret.json` in the backend directory
6. Generate `token.json` for authentication:
   ```bash
   python email_service.py
   ```
   - First run will launch browser for Google authentication
   - After authorization, `token.json` will be created automatically

#### Option B: SMTP Server

Set the following environment variables in your `.env` file:

```bash
EMAIL_PROVIDER=smtp
EMAIL_SENDER=your@email.com
SMTP_HOST=smtp.yourserver.com   # or 'localhost' for local testing
SMTP_PORT=587                   # or your server's port
SMTP_USER=your_smtp_username    # optional if server doesn't require auth
SMTP_PASSWORD=your_smtp_password # optional if server doesn't require auth
SMTP_TLS=true                   # set to 'true' if server requires TLS
```

Test SMTP configuration:
```bash
python email_service.py
```

## Frontend Setup

### 1. Navigate to Frontend Directory

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration (Optional)

Create a `.env.local` file for development settings:

```bash
# Enable mock mode for testing without authentication
VITE_MOCK_MODE=false
VITE_VEXA_API_URL=http://localhost:18056 # point to where VEXA server is located
VITE_VEXA_API_KEY=your_vexa_client_api_key_here
```

## Running the Application

### Start Backend Server

```bash
cd backend
python -m uvicorn main:main --reload --port 8000
```

The API will be available at `http://localhost:8000`

### Start Frontend Development Server

```bash
cd frontend
npm run dev
```

The web interface will be available at `http://localhost:5173`

## Production Build

To build the frontend for production:

```bash
cd frontend
npm run build
```

## First-Time Authentication Setup

After completing the installation, you'll need to set up authentication for various services:

### 1. Gmail API Authentication (if using Gmail for email)

**Required for email functionality using Gmail API:**

1. **Run the authentication script**:
   ```bash
   cd backend
   python email_service.py
   ```

2. **Complete OAuth flow**:
   - A browser window will open automatically
   - Sign in to your Google account
   - Grant permissions to the application
   - The `token.json` file will be created automatically

3. **Verify setup**:
   - The script will send a test email if successful
   - Check that `token.json` exists in the backend directory

### 2. Vexa.ai API Configuration

**Required for Google Meet transcription functionality:**

1. **Obtain API credentials** from [Vexa.ai dashboard](https://vexa.ai/get-started)

2. **Configure frontend environment**:
   ```bash
   # In frontend/.env.local
   VITE_VEXA_API_URL=https://api.vexa.ai  # or your self-hosted URL
   VITE_VEXA_API_KEY=your_vexa_api_key_here
   ```

3. **Test connection**:
   - Start the application and try joining a test meeting
   - Check browser console for connection errors

### 3. LLM Provider Setup (optional)

**Required for AI summary generation:**

1. **Obtain API keys** from your chosen providers:
   - OpenAI: [platform.openai.com](https://platform.openai.com/api-keys)
   - Anthropic: [console.anthropic.com](https://console.anthropic.com/)
   - Google AI: [ai.google.dev](https://ai.google.dev/)

2. **Add to backend `.env` file**:
   ```bash
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_claude_key
   GEMINI_API_KEY=your_gemini_key
   ```

3. **Test providers**:
   - Visit `http://localhost:8000/available-models` to see active providers
   - Try generating a test summary in the application

### 4. ShotGrid Integration (optional)

**Required for ShotGrid project/playlist import:**

1. **Verify credentials** in backend `.env`:
   ```bash
   SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
   SHOTGRID_SCRIPT_NAME=your-script-name
   SHOTGRID_API_KEY=your-api-key
   ```

2. **Test connection**:
   - Visit `http://localhost:8000/shotgrid/active-projects`
   - Should return list of projects (or empty array if none match filters)

### Authentication Troubleshooting

**Gmail API Issues:**
- Ensure Gmail API is enabled in Google Cloud Console
- Check that `client_secret.json` contains valid OAuth credentials
- Delete `token.json` and re-run `python email_service.py` if authentication fails

**Vexa.ai Connection Issues:**
- Verify API key is correct and has proper permissions
- Check that Vexa.ai service is accessible from your network
- Try direct API test: `curl -H "Authorization: Bearer YOUR_KEY" https://api.vexa.ai/status`

**LLM Provider Issues:**
- Verify API keys are valid and have available quota/credits
- Check rate limits and usage restrictions
- Use `DISABLE_LLM=true` to test application without LLM functionality

**ShotGrid Issues:**
- Ensure script user has read permissions for projects and playlists
- Verify field names match your ShotGrid schema
- Check network connectivity to ShotGrid instance

## Verification

1. **Backend Health Check**: Visit `http://localhost:8000/config` to verify configuration
2. **Frontend Access**: Open `http://localhost:5173` in your browser
3. **Email Test**: Run `python email_service.py` in the backend directory
4. **LLM Test**: Use the `/available-models` endpoint to check configured LLM providers

## Next Steps

- See [Configuration Guide](CONFIGURATION.md) for advanced configuration options
- See [Integrations Guide](INTEGRATIONS.md) for Vexa.ai and ShotGrid setup
- See [Usage Guide](USAGE.md) for step-by-step application usage