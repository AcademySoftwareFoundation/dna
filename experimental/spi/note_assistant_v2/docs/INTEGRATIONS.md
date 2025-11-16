# Integrations Guide

Third-party service integrations for the Dailies Note Assistant v2.

## Vexa.ai Integration

The application uses [Vexa.ai](https://vexa.ai/) to manage Google Meet transcription bots that capture audio during dailies sessions.

### Vexa Setup Options

#### Option 1: Cloud Subscription (Recommended)

1. Sign up for a Vexa.ai cloud account at [https://vexa.ai/get-started](https://vexa.ai/get-started)
2. Obtain your API key from the Vexa dashboard
3. No additional setup required

#### Option 2: Self-Hosted

1. Follow the self-hosting documentation at [https://vexa.ai/get-started](https://vexa.ai/get-started)
2. Deploy Vexa on your own infrastructure
3. Configure the API endpoint and authentication

### Vexa Configuration

Add your Vexa credentials to the frontend environment:

```bash
# .env.local in frontend directory
VITE_VEXA_API_URL=https://api.vexa.ai  # or your self-hosted URL
VITE_VEXA_API_KEY=your_vexa_api_key_here
```

### Vexa Functionality

The application communicates with Vexa to:
- Join Google Meet sessions with transcription bots
- Stream real-time audio transcriptions via WebSocket
- Manage bot lifecycle (join/leave meetings)

### Vexa API Routing (Optional)

The backend provides optional VEXA API routing to bypass CORS restrictions.

#### Configuration

Set environment variables in your `.env` file:

```bash
# VEXA Configuration
VEXA_BASE_URL=http://localhost:18056
VEXA_API_KEY=your_vexa_api_key
VEXA_ADMIN_KEY=your_vexa_admin_key
```

If `VEXA_BASE_URL` is not configured, VEXA routing endpoints will be disabled.

#### Available Endpoints

**HTTP Endpoints:**
- `GET /vexa/bots/status` - Get running bots status
- `POST /vexa/bots` - Request a new bot
- `DELETE /vexa/bots/{platform}/{native_meeting_id}` - Stop a bot

**WebSocket Proxy:**
- `WS /vexa/ws` - WebSocket proxy to VEXA backend

#### Usage

Update your frontend `.env.local` file to route through backend:

```bash
# Direct VEXA connection
VITE_VEXA_BASE_URL=http://localhost:18056

# Via backend proxy (when CORS is an issue)
VITE_VEXA_BASE_URL=http://localhost:8000/vexa
```

Frontend code works the same for both scenarios:

```javascript
// Direct or proxied connection
const ws = new WebSocket('ws://localhost:8000/vexa/ws?api_key=your_key&platform=zoom&...');
```

## ShotGrid Integration

Optional integration with ShotGrid (formerly Shotgun) for seamless studio pipeline integration.

### ShotGrid Setup

#### 1. Create Script User

1. Go to your ShotGrid site admin panel
2. Navigate to Scripts and create a new script user
3. Note the script name and generate an API key

#### 2. Configure Field Names

Identify field names in your ShotGrid schema:
- Shot fields: `code`, `sg_shot`, etc.
- Version fields: `code`, `sg_version`, etc.

#### 3. Set Project Type Filters

Determine which project types should appear:
- Examples: `Feature`, `Episodic`, `Commercial`

### ShotGrid Configuration

```bash
# In backend/.env
SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
SHOTGRID_SCRIPT_NAME=your-script-name
SHOTGRID_API_KEY=your-api-key
SHOTGRID_SHOT_FIELD=code  # or your shot field name
SHOTGRID_VERSION_FIELD=code  # or your version field name  
SHOTGRID_TYPE_FILTER=Feature,Episodic  # comma-separated project types
```

### ShotGrid Features

The integration provides:
- **Project Selection**: Browse active projects filtered by type
- **Playlist Access**: View recent playlists for selected projects
- **Shot Import**: Import shots/versions directly from ShotGrid playlists
- **Demo Mode**: Anonymize ShotGrid data for demonstrations

### Disabling ShotGrid Integration

To disable ShotGrid and use CSV uploads instead:

1. **Comment out `SHOTGRID_URL`** in your `.env` file:
   ```bash
   # SHOTGRID_URL=https://your-studio.shotgrid.autodesk.com
   ```

2. **ShotGrid UI will be automatically hidden** when no URL is configured

3. **CSV uploads remain available** for shot list management

### When to Use Each Approach

**Use ShotGrid Integration When:**
- You have active ShotGrid projects and playlists
- You want seamless integration with studio pipelines
- You need up-to-date project and shot information
- Multiple users need consistent access to shot lists

**Use CSV Upload When:**
- ShotGrid is not available or accessible
- Working with external vendors or clients
- Prototyping or testing the application
- You prefer manual control over shot lists
- Working in isolated or air-gapped environments

## LLM Backend Routing

Route LLM operations to a separate backend server for distributed deployment.

### Configuration

```bash
# In backend/.env
LLM_BACKEND_BASE_URL=http://llm-server-ip:8000
```

### How It Works

When `LLM_BACKEND_BASE_URL` is configured:

1. **Request Routing**: All LLM calls (`/llm-summary`, `/available-models`) route to specified server
2. **Transparent Operation**: Frontend works exactly the same way
3. **Fallback Support**: Falls back to local LLM if remote unavailable
4. **Error Handling**: 30-second timeout with proper error reporting

### Use Cases

#### Scenario 1: Internet-Isolated Main Server
- Run main backend on secure, internet-isolated system
- Run secondary backend with LLM access on connected machine
- Route LLM operations while keeping core functionality isolated

#### Scenario 2: Resource Distribution
- Run main application on lightweight system
- Route compute-intensive LLM operations to GPU server
- Optimize resource usage across infrastructure

#### Scenario 3: Development and Testing
- Use shared LLM backend for multiple development instances
- Centralize LLM configuration and API key management
- Reduce individual developer setup complexity

### Setup Instructions

1. **Deploy LLM Backend Server**:
   ```bash
   # On your LLM-capable machine
   cd backend
   python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```

2. **Configure Main Backend**:
   ```bash
   # In main backend's .env file
   LLM_BACKEND_BASE_URL=http://llm-server-ip:8000
   DISABLE_LLM=false
   ```

3. **Configure LLM Backend**:
   ```bash
   # In LLM backend's .env file
   # Comment out LLM_BACKEND_BASE_URL to prevent routing loops
   # LLM_BACKEND_BASE_URL=
   
   # Enable LLM providers
   ENABLE_OPENAI=true
   OPENAI_API_KEY=your_openai_key
   ```

### Verification

1. **Check Configuration**: `/config` endpoint shows `"llm_backend_routing_enabled": true`
2. **Monitor Logs**: Main backend logs routing errors if connection issues
3. **Response Metadata**: LLM responses include `"routed": false` field

### Disabling LLM Routing

1. **Comment out configuration**:
   ```bash
   # LLM_BACKEND_BASE_URL=http://localhost:8000
   ```

2. **Enable local LLM providers**:
   ```bash
   ENABLE_OPENAI=true
   OPENAI_API_KEY=your_key
   ```

## CSV Format Requirements

When not using ShotGrid integration, CSV files should follow this format:

```csv
Shot/Version,Notes,Transcription
shot_010/v001,Character animation scene,
shot_020/v002,Lighting pass review,
shot_030/v001,Environment matte painting,
```

**Requirements:**
- First column: Shot/version identifier (required)
- Second column: Notes/description (optional)
- Third column: Transcription (optional, usually empty on import)
- Header row recommended but not required
- Standard CSV formatting (commas, quoted fields if needed)

## Integration Troubleshooting

### Vexa.ai Issues
- Verify API key and endpoint URL
- Check Vexa service status
- Ensure WebSocket connections are allowed
- Review Vexa documentation for API limits

### ShotGrid Issues
- Verify URL, script name, and API key
- Ensure script user has proper permissions
- Check field names match your schema
- Confirm project type filters are valid
- Test ShotGrid API access independently

### LLM Backend Issues
- Verify network connectivity between servers
- Check LLM backend server is running
- Review timeout settings (30 seconds default)
- Monitor logs for routing errors

See [Troubleshooting Guide](TROUBLESHOOTING.md) for additional help.