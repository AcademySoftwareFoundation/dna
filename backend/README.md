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

**ftrack** is also supported: set `PRODTRACK_PROVIDER=ftrack` with `FTRACK_SERVER`, `FTRACK_API_KEY` and `FTRACK_API_USER`. See [ftrack production tracking](#ftrack-production-tracking) below.

### LLM

LLM providers are the services that provide the LLM functionality to the backend.

Configure the backend LLM with the `LLM_PROVIDER` environment variable. The backend currently supports these providers:

| Value | Provider | Required environment variables | Optional environment variables |
|-------|----------|--------------------------------|--------------------------------|
| `openai` | OpenAI (default) | `OPENAI_API_KEY` | `OPENAI_MODEL` (default: `gpt-4o-mini`), `OPENAI_TIMEOUT` (default: `30.0`) |
| `gemini` | Google Gemini via the OpenAI-compatible endpoint | `GEMINI_API_KEY` | `GEMINI_MODEL` (default: `gemini-2.5-flash`), `GEMINI_TIMEOUT` (default: `30.0`), `GEMINI_URL` (default: `https://generativelanguage.googleapis.com/v1beta/openai/`) |
| `custom` | Custom OpenAI Compatible LLM Provider | `CUSTOM_LLM_URL` (if not using ollama), `CUSTOM_LLM_MODEL` (default: `llama3.2:latest`) | `CUSTOM_LLM_API_KEY` |

- **Local development:** If you do not set `LLM_PROVIDER`, the backend uses `openai`.
- **Switching providers:** Set `LLM_PROVIDER` and only the matching provider variables for the provider you want to use.

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

link to [page](../QUICKSTART.md)

### ShotGrid and local overrides

To configure ShotGrid and other local settings, create a local docker-compose override file:

1. Copy the example file:
   ```bash
   cp example.docker-compose.local.yml docker-compose.local.yml
   ```

2. Edit `docker-compose.local.yml` and set at least:
   - **ShotGrid:** To use ShotGrid, set `PRODTRACK_PROVIDER=shotgrid` (or leave unset) and set `SHOTGRID_URL`, `SHOTGRID_API_KEY`, and `SHOTGRID_SCRIPT_NAME`. To run without ShotGrid, set `PRODTRACK_PROVIDER=mock`; see [Mock production tracking](#mock-production-tracking).
   - **ftrack:** To use ftrack instead, set `PRODTRACK_PROVIDER=ftrack` and `FTRACK_SERVER`, `FTRACK_API_KEY`, `FTRACK_API_USER`; see [ftrack production tracking](#ftrack-production-tracking).
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

     ```yaml
     services:
       api:
         environment:
           - LLM_PROVIDER=custom
           - CUSTOM_LLM_URL=http://host.docker.internal:11434/v1
           - CUSTOM_LLM_MODEL=llama3.2:latest

         # Unnecessary on Docker Desktop (macOS/Windows)
         extra_hosts:
           - "host.docker.internal:host-gateway"
     ```
   - **Note regarding local LLM provider hostname:** <a id="local-llm-host"></a>If running DNA in a docker container and your LLM provider on your local host (e.g. ollama), using `localhost` in the URL won't work. Adding the `host.docker.internal` mapping to `extra_hosts:` provides an address to connect to your docker host from within the container. Note, that on Docker Desktop (on macOS or Windows), the mapping is created automatically, and this `extra_hosts:` entry is not necessary. Alternatively, you could use the hostname visible to your local network, or run your LLM provider in its own docker container, and refer to the container's name as the hostname.

3. The `docker-compose.local.yml` file is gitignored, so your credentials will not be committed to the repository.

### ftrack production tracking

Set **`PRODTRACK_PROVIDER=ftrack`** together with `FTRACK_SERVER`, `FTRACK_API_KEY` and `FTRACK_API_USER`.

- **Playlists:** ftrack has two entities a studio might treat as a playlist. `FTRACK_PLAYLIST_ENTITY` picks which one: `AssetVersionList` (ftrack Lists, the default) or `ReviewSession` (ftrack Client Reviews). Both the schema names and the UI names (`Lists`, `ClientReviews`) are accepted. The setting is re-read on every playlist operation, so it can change without a restart — this is the seam a per-user preference will plug into.
- **Entity ids:** ftrack keys entities by UUID while DNA ids are ints, so the provider assigns a stable int per UUID and persists the pairing. `FTRACK_ID_MAP` selects where: `mongodb` (default, shared by every backend instance), `sqlite` (single host, path from `FTRACK_ID_MAP_PATH`) or `memory` (tests). **The map must outlive the process** — draft notes, transcripts and stored segments all reference these ids, and losing the map orphans them.
- **Flat queries, fetched in layers:** projections never use a dotted path like `asset.parent.object_type.name`. A deep projection makes the ftrack server build the joins and is reliably slower than asking for each layer on its own, so `_hydrate_versions` walks them — versions, then their assets, then those assets' parents, then the parents' object types, plus statuses, users, tasks and projects alongside — and stitches the nested shape the converters expect. Each layer is one `id in (...)` query for the whole batch, so a playlist costs about ten queries whatever its size. Filters use flat foreign keys (`project_id`) for the same reason; the only join left is a version's `entity`, which has to reach through its asset. Two tests hold this line: one rejects a dotted path in any projection constant, another rejects one in any query a playlist load issues.
- **Batching elsewhere:** id pairings for a batch are warmed in one store read rather than one per reference, and cached in process (safe — a pairing never changes). Component paths go through `pick_locations`/`get_filesystem_paths`: one availability request plus one per location, not two per version. Note recipients resolve in a single query. Project and version-status lookups are cached for `FTRACK_CACHE_SECONDS` (default 300, `0` disables) because one publish round asks for them repeatedly; the TTL exists because the provider is a process-lifetime singleton and a schema edit should not need a redeploy. Adding a new read path is worth the same treatment: fetch ids, hydrate in layers, `_warm_ids(...)`, then convert.
- **Notes:** ftrack notes attach to exactly one parent and have no subject or cc field. DNA's subject is kept in the note's metadata, cc recipients are merged into the recipient list, and links beyond the primary one are dropped.
- **Thumbnails:** ftrack's own thumbnail URL carries the API key in its query string, so thumbnails are proxied through `GET /api/ftrack-thumbnails/{version_id}` instead of being handed to the browser.
- **Media paths:** `movie_path` and `frame_path` are empty unless you opt in, because neither kind of ftrack component yields a path DNA can use. The reviewable encodings (`ftrackreview-mp4`, `ftrackreview-webm`) live in the ftrack.server location, which has no filesystem path at all; `movie` and `main` live on studio disk locations that a containerised DNA almost certainly cannot read. Resolving also costs a location round trip per component, per version in a playlist. If DNA runs inside the studio network with the storage mounted, set `FTRACK_MOVIE_COMPONENTS` (e.g. `movie,main`) and `FTRACK_FRAME_COMPONENTS` — comma-separated, most preferred first, since ftrack often carries several encodings of the same version.
- **Transcripts:** ftrack has no equivalent of ShotGrid's spare custom-entity slots, so a published transcript is a note on the version, tagged through note metadata.

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
