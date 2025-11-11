# Configuration Guide

Comprehensive configuration options for the Dailies Note Assistant v2.

## Environment Variables

### Core Configuration

```bash
# Basic Configuration
EMAIL_SENDER=your-email@gmail.com          # Email address for sending notes
DISABLE_LLM=false                          # Set to true to use mock responses

# Demo Mode
DEMO_MODE=false                            # Anonymize sensitive data for demos
```

### ShotGrid Configuration

The following environment variables configure the ShotGrid integration:

```bash
# ShotGrid Configuration (comment out SG_URL to disable ShotGrid integration)
SG_URL=https://your-studio.shotgrid.autodesk.com
SG_SCRIPT_NAME=your_script_name
SG_API_KEY=your_api_key
SG_PLAYLIST_TYPE_FILTER=Client,SPA         # Comma-separated list of project types to include
```

#### Custom Field Configuration

The following variables allow you to specify custom field names in the ShotGrid Version entity:

```bash
SG_PLAYLIST_SHOT_FIELD=sg_vfo_shot         # Custom field name in the Version entity that references the shot/asset (default: "shot")
SG_PLAYLIST_VERSION_FIELD=sg_jts           # Custom field name in the Version entity that contains the version identifier (default: "version")
```

These fields are used when extracting shot/version information from playlists. Configure them to match your studio's custom ShotGrid schema.

#### CSV Upload Configuration

The following variables allow you to specify custom column names when uploading CSV files. Each field supports comma-separated lists of possible column names, and the system will try them in order until it finds a match:

```bash
SG_CSV_SHOT_FIELD=shot,asset              # Column names for shot/asset code (default: "shot")
SG_CSV_VERSION_FIELD=version,"shot > version"      # Column names for version identifier (default: "version")
SG_CSV_NOTES_FIELD=notes,body             # Column names for notes content (default: "notes")
```

These fields are used when parsing uploaded CSV files to extract shot, version, and notes information. The system will:

1. Try each field name in the comma-separated list (case-insensitive)
2. Use the first matching column found in the CSV header
3. Handle field names with spaces by using quotes (e.g., `"shot > version"`)
4. Combine shot and version values into the format `shot/version`
5. Fall back to the first column for shot if no configured fields are found

**Example CSV configurations:**

For a ShotGrid export with columns like "Shot > Version", "Links", "Body":
```bash
SG_CSV_VERSION_FIELD=version,"shot > version"
SG_CSV_SHOT_FIELD=shot,links
SG_CSV_NOTES_FIELD=notes,body
```

For a standard CSV format:
```bash
SG_CSV_VERSION_FIELD=version,ver,v
SG_CSV_SHOT_FIELD=shot,"shot name",shotname
SG_CSV_NOTES_FIELD=notes,comments,description
```

**Example CSV with ShotGrid export configuration:**
```csv
Id,Shot > Version,Subject,Status,Links,Author,To,Body,Type,Date Updated,Read/Unread,Project
4162072,9754,Weekly Review,opn,[9754] proj-char.hero.ref-ref-44,Jane Doe,,Character design feedback,Review,2024/09/25 12:01:02 PM,unread,project
```

In this example:
- Version data comes from "Shot > Version" column (matches "shot > version" configuration)
- Shot data comes from "Links" column (matches "links" configuration)  
- Notes data comes from "Body" column (matches "body" configuration)

To disable ShotGrid integration, comment out the `SG_URL` environment variable.

### LLM Provider Configuration

```bash
# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Anthropic Claude
ANTHROPIC_API_KEY=your-claude-api-key

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# Ollama (local models)
# Ensure Ollama is running on localhost:11434
```

### Email Service Configuration

#### Gmail API Configuration
```bash
# Gmail API (default)
EMAIL_PROVIDER=gmail                       # Optional, gmail is default
# Requires client_secret.json and token.json files in backend directory
```

#### SMTP Configuration
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.yourserver.com             # SMTP server hostname
SMTP_PORT=587                             # SMTP server port
SMTP_USER=your_smtp_username              # SMTP username (optional)
SMTP_PASSWORD=your_smtp_password          # SMTP password (optional)
SMTP_TLS=true                             # Enable TLS encryption
```

## LLM Configuration System

The application uses a flexible YAML-based configuration system for LLM models and prompts.

### Configuration Files

The system uses factory defaults with optional user overrides:

- `backend/llm_models.factory.yaml` - Factory defaults for LLM models
- `backend/llm_models.yaml` - User overrides (optional)
- `backend/llm_prompts.factory.yaml` - Factory defaults for prompts  
- `backend/llm_prompts.yaml` - User overrides (optional)

### Model Configuration

Create `backend/llm_models.yaml` to customize available models:

```yaml
# Default parameters applied to all models
default:
  temperature: 0.1
  max_tokens: 1024

# List of available models
models:
  - display_name: "ChatGPT"
    model_name: "gpt-4o"
    provider: "openai"
  - display_name: "Claude"
    model_name: "claude-3-sonnet-20240229"
    provider: "anthropic"
  - display_name: "Llama"
    model_name: "llama3.2"
    provider: "ollama"
  - display_name: "Gemini"
    model_name: "gemini-2.5-flash-preview-05-20"
    provider: "google"

# Model-specific overrides (optional)
model_overrides:
  "gpt-4o":
    temperature: 0.15
  "claude-3-sonnet-20240229":
    max_tokens: 2048
    temperature: 0.05
```

#### Configuration Options

- `display_name`: Name shown in the UI
- `model_name`: Actual model identifier for the API
- `provider`: LLM provider (openai, anthropic, ollama, google)
- `temperature`: Controls randomness (0.0 = deterministic, 1.0 = very random)
- `max_tokens`: Maximum response length
- `model_overrides`: Provider-specific parameter adjustments

### Prompt Configuration

Create `backend/llm_prompts.yaml` to customize prompts:

```yaml
short:
  system_prompt: |
    You are a helpful assistant that reviews transcripts of artist review meetings 
    and generates concise, readable summaries of the discussions.
    
    The meetings are focused on reviewing creative work submissions ("shots") for a movie. 
    Each meeting involves artists and reviewers discussing feedback, decisions, and next steps.
    
    Your goal is to create short, clear, and accurate abbreviated conversations that capture:
    - Key feedback points
    - Decisions made (e.g., approved/finalled shots)
    - Any actionable tasks for the artist
    
    Write in a concise, natural tone that's easy for artists to quickly scan.

  user_prompt_template: |
    The following is a transcript of a discussion about a single shot.

    Write concise notes summarizing:
    - Specific creative feedback or decisions made
    - Actionable tasks or next steps
    - Key approvals (e.g., if the shot was marked final)
    - Use speaker initials to indicate who said what when useful

    Keep the output short, direct, and focused only on the essential points.

    Conversation:
    {conversation}

long:
  system_prompt: |
    You are an assistant that reviews transcripts of artist review meetings 
    and creates detailed yet clear summaries of the discussions.

  user_prompt_template: |
    The following is a conversation about a shot.

    Write detailed meeting notes summarizing:
    - Key creative and technical points discussed
    - Reasoning behind feedback or decisions
    - Any notable exchanges between participants
    - Final outcome or next steps for the artist
    - Use speaker initials where appropriate to attribute comments

    Conversation:
    {conversation}
```

#### Adding Custom Prompt Types

```yaml
technical:
  system_prompt: |
    You are a technical supervisor assistant that focuses on technical aspects 
    of VFX shot reviews, emphasizing pipeline, workflow, and technical requirements.
  
  user_prompt_template: |
    Review this shot discussion and create technical notes focusing on:
    - Technical feedback and requirements
    - Pipeline or workflow issues
    - Technical approvals or blockers
    - Software, tools, or technical specifications mentioned
    
    Conversation:
    {conversation}

creative:
  system_prompt: |
    You are a creative director assistant that focuses on the artistic and 
    creative aspects of shot reviews.
  
  user_prompt_template: |
    Review this shot discussion and create creative notes focusing on:
    - Artistic direction and creative feedback
    - Story and character considerations
    - Visual aesthetics and mood
    - Creative approvals and artistic decisions
    
    Conversation:
    {conversation}
```

## Demo Mode Configuration

Demo Mode anonymizes sensitive ShotGrid data for demonstrations and screenshots.

### Enabling Demo Mode

```bash
# In backend/.env
DEMO_MODE=true
```

### How Demo Mode Works

When enabled, the system:

1. Fetches real data from ShotGrid normally
2. Anonymizes text data before returning to frontend
3. Preserves data structure and relationships
4. Maintains consistent anonymization (same input = same output)

### What Gets Anonymized

- **Project codes**: `SPIDERMAN_001` → `PROJ_70B19AF5_001`
- **Project names**: `Spider-Man: No Way Home` → `PROJECT_2B76F2DD`
- **Playlist codes**: `dailies_review_v3` → `PLAYLIST_8A3F9B12`
- **Shot names**: `shot_010/v001` → `A1B2C/12345`

Database IDs, dates, and relationships remain unchanged.

## Configuration Management

### Creating Custom Configurations

1. **Copy factory files** to create user overrides:
   ```bash
   cp backend/llm_models.factory.yaml backend/llm_models.yaml
   cp backend/llm_prompts.factory.yaml backend/llm_prompts.yaml
   ```

2. **Modify as needed** - Edit the copied files with your customizations

3. **Restart backend** to load changes:
   ```bash
   python -m uvicorn main:main --reload --port 8000
   ```

### Best Practices

#### For Prompts
- Keep `system_prompt` focused on role and context
- Always include `{conversation}` in `user_prompt_template`
- Test with different conversation types
- Consider your audience (artists, supervisors, producers)

#### For Models
- Use lower `temperature` (0.0-0.3) for consistent summaries
- Adjust `max_tokens` based on desired length
- Use model-specific overrides for fine-tuning
- Consider cost and speed trade-offs

#### Configuration Management
- Keep factory files as reference
- Version control your user configuration files
- Document studio-specific customizations
- Test changes with representative data

### Mock Mode

For development and testing without LLM API calls:

```bash
DISABLE_LLM=true
```

This enables mock responses that simulate LLM behavior without making actual API calls.

## Troubleshooting Configuration

### Verifying Configuration

1. **Check loaded configuration**: Visit `http://localhost:8000/config`
2. **Test LLM models**: Visit `http://localhost:8000/available-models`
3. **Validate environment**: Check backend logs for configuration errors

### Common Configuration Issues

1. **Invalid YAML syntax**: Use a YAML validator to check syntax
2. **Missing required fields**: Ensure all required fields are present
3. **Invalid model names**: Verify model names match provider APIs
4. **Missing conversation placeholder**: Include `{conversation}` in user prompts

See [Troubleshooting Guide](TROUBLESHOOTING.md) for additional help.