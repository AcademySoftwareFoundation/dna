"""FastAPI application entry point."""

from functools import lru_cache
from typing import Annotated, cast

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from dna.models import (
    Asset,
    CreateNoteRequest,
    FindRequest,
    Note,
    Playlist,
    Project,
    Shot,
    Task,
    User,
    Version,
)
from dna.models.entity import ENTITY_MODELS, EntityBase
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    get_prodtrack_provider,
)

# API metadata for Swagger documentation
API_TITLE = "DNA Backend"
API_DESCRIPTION = """
## DNA Backend API

Backend API for the DNA (Dailies Notes Assistant) application.

### Features
- 🎬 Production tracking integration (ShotGrid)
- 🎤 Transcription services
- 🤖 LLM-powered note generation
- 📋 Playlist and version management

### Documentation
- **Swagger UI**: Available at `/docs`
- **ReDoc**: Available at `/redoc`
- **OpenAPI JSON**: Available at `/openapi.json`
"""

API_VERSION = "0.1.0"

# Define API tags for organizing endpoints
tags_metadata = [
    {
        "name": "Health",
        "description": "Health check and status endpoints",
    },
    {
        "name": "Entities",
        "description": "Operations for managing production entities",
    },
    {
        "name": "Playlists",
        "description": "Operations for managing playlists",
    },
    {
        "name": "Versions",
        "description": "Operations for managing versions",
    },
    {
        "name": "Shots",
        "description": "Operations for managing shots",
    },
    {
        "name": "Assets",
        "description": "Operations for managing assets",
    },
    {
        "name": "Tasks",
        "description": "Operations for managing tasks",
    },
    {
        "name": "Notes",
        "description": "Operations for managing notes",
    },
    {
        "name": "Projects",
        "description": "Operations for managing projects",
    },
    {
        "name": "Users",
        "description": "Operations for managing users",
    },
    {
        "name": "Transcription",
        "description": "Audio transcription services",
    },
    {
        "name": "LLM",
        "description": "LLM-powered note generation",
    },
]

app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    openapi_tags=tags_metadata,
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc",  # ReDoc
    openapi_url="/openapi.json",  # OpenAPI schema
    contact={
        "name": "DNA Project",
        "url": "https://github.com/AcademySoftwareFoundation/dna",
    },
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# Dependencies
# -----------------------------------------------------------------------------


@lru_cache
def get_prodtrack_provider_cached() -> ProdtrackProviderBase:
    """Get or create the production tracking provider singleton."""
    return get_prodtrack_provider()


ProdtrackProviderDep = Annotated[
    ProdtrackProviderBase, Depends(get_prodtrack_provider_cached)
]


# -----------------------------------------------------------------------------
# Health endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/",
    tags=["Health"],
    summary="Root endpoint",
    description="Returns basic API information and version.",
    response_description="API information with name and version",
)
async def root():
    """Root endpoint returning API information."""
    return {"message": "DNA Backend API", "version": API_VERSION}


@app.get(
    "/health",
    tags=["Health"],
    summary="Health check",
    description="Check if the API is running and healthy.",
    response_description="Health status of the API",
)
async def health():
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "healthy"}


# -----------------------------------------------------------------------------
# Entity endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/version/{version_id}",
    tags=["Versions"],
    summary="Get a version by ID",
    description="Retrieve version information from the production tracking system.",
    response_model=Version,
)
async def get_version(version_id: int, provider: ProdtrackProviderDep) -> Version:
    """Get a version entity by its ID."""
    try:
        return cast(Version, provider.get_entity("version", version_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/playlist/{playlist_id}",
    tags=["Playlists"],
    summary="Get a playlist by ID",
    description="Retrieve playlist information including linked versions.",
    response_model=Playlist,
)
async def get_playlist(playlist_id: int, provider: ProdtrackProviderDep) -> Playlist:
    """Get a playlist entity by its ID."""
    try:
        return cast(Playlist, provider.get_entity("playlist", playlist_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/shot/{shot_id}",
    tags=["Shots"],
    summary="Get a shot by ID",
    description="Retrieve shot information from the production tracking system.",
    response_model=Shot,
)
async def get_shot(shot_id: int, provider: ProdtrackProviderDep) -> Shot:
    """Get a shot entity by its ID."""
    try:
        return cast(Shot, provider.get_entity("shot", shot_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/asset/{asset_id}",
    tags=["Assets"],
    summary="Get an asset by ID",
    description="Retrieve asset information from the production tracking system.",
    response_model=Asset,
)
async def get_asset(asset_id: int, provider: ProdtrackProviderDep) -> Asset:
    """Get an asset entity by its ID."""
    try:
        return cast(Asset, provider.get_entity("asset", asset_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/task/{task_id}",
    tags=["Tasks"],
    summary="Get a task by ID",
    description="Retrieve task information from the production tracking system.",
    response_model=Task,
)
async def get_task(task_id: int, provider: ProdtrackProviderDep) -> Task:
    """Get a task entity by its ID."""
    try:
        return cast(Task, provider.get_entity("task", task_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/note/{note_id}",
    tags=["Notes"],
    summary="Get a note by ID",
    description="Retrieve note information from the production tracking system.",
    response_model=Note,
)
async def get_note(note_id: int, provider: ProdtrackProviderDep) -> Note:
    """Get a note entity by its ID."""
    try:
        return cast(Note, provider.get_entity("note", note_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# -----------------------------------------------------------------------------
# Entity creation endpoints (POST)
# -----------------------------------------------------------------------------


def _create_stub_entity(entity_type: str, entity_id: int) -> EntityBase:
    """Create a minimal entity stub for linking purposes."""
    entity_map = {
        "Version": Version,
        "Playlist": Playlist,
        "Shot": Shot,
        "Asset": Asset,
        "Task": Task,
        "Note": Note,
    }
    model_class = entity_map.get(entity_type)
    if model_class is None:
        raise ValueError(f"Unknown entity type: {entity_type}")

    if entity_type == "Playlist":
        return model_class(id=entity_id, code="stub")
    return model_class(id=entity_id, name="stub")


@app.post(
    "/note",
    tags=["Notes"],
    summary="Create a new note",
    description="Create a new note in the production tracking system.",
    response_model=Note,
    status_code=201,
)
async def create_note(
    request: CreateNoteRequest, provider: ProdtrackProviderDep
) -> Note:
    """Create a new note entity."""
    try:
        note_links = []
        if request.note_links:
            for link in request.note_links:
                note_links.append(_create_stub_entity(link.type, link.id))

        note = Note(
            id=0,
            subject=request.subject,
            content=request.content,
            project=request.project,
            note_links=note_links,
        )
        return cast(Note, provider.add_entity("note", note))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -----------------------------------------------------------------------------
# Find endpoint
# -----------------------------------------------------------------------------


@app.post(
    "/find",
    tags=["Entities"],
    summary="Find entities",
    description="Search for entities matching the given filters.",
    response_model=list[EntityBase],
)
async def find_entities(
    request: FindRequest, provider: ProdtrackProviderDep
) -> list[EntityBase]:
    """Find entities matching the given filters."""
    entity_type = request.entity_type.lower()

    if entity_type not in ENTITY_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported entity type: '{request.entity_type}'. "
            f"Supported types: {list(ENTITY_MODELS.keys())}",
        )

    try:
        filters = [f.model_dump() for f in request.filters]
        return provider.find(entity_type, filters)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# -----------------------------------------------------------------------------
# User endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/users/{user_email}",
    tags=["Users"],
    summary="Get user by email",
    description="Retrieve user information by their email address.",
    response_model=User,
)
async def get_user_by_email(user_email: str, provider: ProdtrackProviderDep) -> User:
    """Get a user by their email address."""
    try:
        return provider.get_user_by_email(user_email)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# -----------------------------------------------------------------------------
# Project endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/projects/user/{user_email}",
    tags=["Projects"],
    summary="Get projects for a user",
    description="Retrieve all projects accessible by the specified user email.",
    response_model=list[Project],
)
async def get_projects_for_user(
    user_email: str, provider: ProdtrackProviderDep
) -> list[Project]:
    """Get projects for a user by their email address."""
    try:
        return provider.get_projects_for_user(user_email)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/projects/{project_id}/playlists",
    tags=["Playlists"],
    summary="Get playlists for a project",
    description="Retrieve all playlists for the specified project.",
    response_model=list[Playlist],
)
async def get_playlists_for_project(
    project_id: int, provider: ProdtrackProviderDep
) -> list[Playlist]:
    """Get playlists for a project."""
    try:
        return provider.get_playlists_for_project(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/playlists/{playlist_id}/versions",
    tags=["Versions"],
    summary="Get versions for a playlist",
    description="Retrieve all versions in the specified playlist.",
    response_model=list[Version],
)
async def get_versions_for_playlist(
    playlist_id: int, provider: ProdtrackProviderDep
) -> list[Version]:
    """Get versions for a playlist."""
    try:
        return provider.get_versions_for_playlist(playlist_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
