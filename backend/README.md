# DNA Backend

The DNA backend is a FastAPI application that provides the core functionality for the DNA application. It is responsible for:

- Handling the API requests from the frontend
- Interacting with the database
- Interacting with the LLM providers
- Interacting with the transcription providers
- Interacting with the production Tracking APIs (ShotGrid, etc.)

## Stack

- FastAPI
- Python
- Pydantic
- Docker/Docker-compose


## Providers

Providers are the services that populate abstractions or interfaces with other services.

### Production Tracking

Production Tracking providers are the services that provide data to the backend from the production tracking systems and allow for updates to the production tracking systems.

**ShotGrid** is the primary production tracking integration. To run without a ShotGrid seat, set **`PRODTRACK_PROVIDER=mock`**; the mock provider is read-only and backed by a SQLite database under `src/dna/prodtrack_providers/mock_data/`. See [Mock production tracking](#mock-production-tracking) below.

### LLM

LLM providers are the services that provide the LLM functionality to the backend.

Configure the backend LLM with the `LLM_PROVIDER` environment variable. The backend currently supports these providers:

| Value | Provider | Required environment variables | Optional environment variables |
|-------|----------|--------------------------------|--------------------------------|
| `openai` | OpenAI (default) | `OPENAI_API_KEY` | `OPENAI_MODEL` (default: `gpt-4o-mini`), `OPENAI_TIMEOUT` (default: `30.0`) |
| `gemini` | Google Gemini via the OpenAI-compatible endpoint | `GEMINI_API_KEY` | `GEMINI_MODEL` (default: `gemini-2.5-flash`), `GEMINI_TIMEOUT` (default: `30.0`), `GEMINI_URL` (default: `https://generativelanguage.googleapis.com/v1beta/openai/`) |

- **Local development:** If you do not set `LLM_PROVIDER`, the backend uses `openai`.
- **Switching providers:** Set `LLM_PROVIDER` and only the matching provider variables for the provider you want to use.
- **Missing credentials:** The backend will raise an error at startup/use time if the selected provider's `*_API_KEY` variable is not set.

### Transcription

Transcription providers are the services that provide the transcription functionality to the backend and connect the transcript with versions being reviewed.

### Authentication

Authentication is handled by pluggable auth providers, configured via the `AUTH_PROVIDER` environment variable:

| Value   | Provider        | Use case                                      |
|--------|------------------|-----------------------------------------------|
| `none` | Noop (default)   | Local development and testing; no validation  |
| `google` | Google OAuth   | Production; validates Google ID/access tokens  |

- **Local development:** Use the noop provider so you can sign in with any email and the backend accepts the token without validation. Set `AUTH_PROVIDER=none` in your override (the example local compose file does this).
- **Production:** Set `AUTH_PROVIDER=google` and configure `GOOGLE_CLIENT_ID` (and optionally Google verification) as required.

The frontend must match: set `VITE_AUTH_PROVIDER=none` for local dev (email-based sign-in) or `VITE_AUTH_PROVIDER=google` when using Google OAuth.

## Setup

To setup the backend, you need to have the following:

- A production tracking system (ShotGrid, etc.)
- An LLM provider (OpenAI, Anthropic, Google, etc.)
- A transcription provider (Vexa, etc.)

### ShotGrid and local overrides

To configure ShotGrid and other local settings, create a local docker-compose override file:

1. Copy the example file:
   ```bash
   cp example.docker-compose.local.yml docker-compose.local.yml
   ```

2. Edit `docker-compose.local.yml` and set at least:
   - **ShotGrid:** To use ShotGrid, set `PRODTRACK_PROVIDER=shotgrid` (or leave unset) and set `SHOTGRID_URL`, `SHOTGRID_API_KEY`, and `SHOTGRID_SCRIPT_NAME`. To run without ShotGrid, set `PRODTRACK_PROVIDER=mock`; see [Mock production tracking](#mock-production-tracking).
   - **Auth (local dev):** Keep `AUTH_PROVIDER=none` so the noop provider is used and you can sign in with any email. Change to `AUTH_PROVIDER=google` only if you need to test Google OAuth locally.
   - **LLM:** Choose an LLM provider and matching credentials. Examples:

     ```yaml
     services:
       api:
         environment:
           - LLM_PROVIDER=openai
           - OPENAI_API_KEY=your-openai-api-key
           - OPENAI_MODEL=gpt-4o-mini
     ```

     ```yaml
     services:
       api:
         environment:
           - LLM_PROVIDER=gemini
           - GEMINI_API_KEY=your-gemini-api-key
           - GEMINI_MODEL=gemini-2.5-flash
           # Optional if you need to override the default OpenAI-compatible Gemini endpoint
           - GEMINI_URL=https://generativelanguage.googleapis.com/v1beta/openai/
     ```

3. The `docker-compose.local.yml` file is gitignored, so your credentials will not be committed to the repository.

### Mock production tracking

When **`PRODTRACK_PROVIDER=mock`** is set, the backend uses a read-only mock provider backed by `src/dna/prodtrack_providers/mock_data/mock.db`. The mock must be explicitly selected; there is no automatic fallback when ShotGrid credentials are missing. This allows the full stack to run without ShotGrid access.

- **Data:** The repo includes a pre-built mock DB. To refresh or customize it from a real ShotGrid project, run the seed script with a project ID and credentials (e.g. from the backend directory: `SHOTGRID_API_KEY='your-key' make seed-mock-db`, or see the Makefile for the full command). This overwrites `mock_data/mock.db` with entities from that project.
- **Thumbnails:** The seed script can download version thumbnails into `mock_data/thumbnails/` so they keep working after ShotGrid signed URLs expire. They are served at `GET /api/mock-thumbnails/{version_id}`. Use `--skip-thumbnails` when running the seed script to skip downloads.
- **Read-only:** The mock provider does not support writes (e.g. publishing notes to ShotGrid); those operations raise an error when the mock is active.

### Running the Backend

To run the backend, you need to have the following:

- Docker/Docker-compose

#### Quick Start

1. Build and start the application:
   ```bash
   docker-compose up --build
   ```

2. The API will be available at `http://localhost:8000`

3. To run in detached mode:
   ```bash
   docker-compose up -d
   ```

4. To stop the application:
   ```bash
   docker-compose down
   ```

5. To view logs:
   ```bash
   docker-compose logs -f
   ```

## Code Formatting

The backend uses [Black](https://black.readthedocs.io/) for code formatting and [isort](https://pycqa.github.io/isort/) for import sorting. These tools are automatically checked in CI on pull requests.

### Formatting Your Code

To format your code locally, use the make command:

```bash
make format-python
```

This command will:
1. Automatically set up a virtual environment (`.venv-lint`) if it doesn't exist
2. Format all Python files in `src/` and `tests/` with Black
3. Sort imports in all Python files with isort

### Setting Up the Formatting Environment

If you want to set up the formatting environment manually (or if you need to recreate it):

```bash
make venv-lint
```

This creates a virtual environment at `.venv-lint` and installs Black and isort.

### Style Guidelines

- **Black**: Code is automatically formatted according to Black's style guide
- **isort**: Imports are automatically sorted and organized
- **pytest/pytest-cov**: Used for testing

## Testing

- pytest/pytest-cov for testing

## Documentation

- pydoc for documentation
