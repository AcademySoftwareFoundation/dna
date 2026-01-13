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

### LLM

LLM providers are the services that provide the LLM functionality to the backend.

### Transcription

Transcription providers are the services that provide the transcription functionality to the backend and connect the transcript with versions being reviewed.

## Setup

To setup the backend, you need to have the following:

- A production tracking system (ShotGrid, etc.)
- An LLM provider (OpenAI, Anthropic, Google, etc.)
- A transcription provider (Vexa, etc.)

### ShotGrid Configuration

To configure ShotGrid credentials, create a local docker-compose override file:

1. Copy the example file:
   ```bash
   cp sg_example.docker-compose.local.yml docker-compose.local.yml
   ```

2. Edit `docker-compose.local.yml` and update the environment variables with your ShotGrid credentials:
   - `SHOTGRID_URL`: Your ShotGrid site URL (e.g., `https://your-studio.shotgrid.autodesk.com`)
   - `SHOTGRID_API_KEY`: Your ShotGrid API key
   - `SHOTGRID_SCRIPT_NAME`: Your ShotGrid script name

3. The `docker-compose.local.yml` file is gitignored, so your credentials will not be committed to the repository.

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
