"""FastAPI application entry point."""

import os
from functools import lru_cache
from typing import Annotated, Optional, cast

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from dna.events import EventPublisher, EventType, get_event_publisher
from dna.llm_providers.default_prompt import DEFAULT_PROMPT
from dna.llm_providers.llm_provider_base import LLMProviderBase, get_llm_provider
from dna.models import (
    Asset,
    BotSession,
    BotStatus,
    CreateNoteRequest,
    DispatchBotRequest,
    DraftNote,
    DraftNoteUpdate,
    FindRequest,
    GenerateNoteRequest,
    GenerateNoteResponse,
    Note,
    Platform,
    Playlist,
    PlaylistMetadata,
    PlaylistMetadataUpdate,
    Project,
    PublishNotesRequest,
    PublishNotesResponse,
    SearchRequest,
    SearchResult,
    Shot,
    StoredSegment,
    Task,
    Transcript,
    User,
    UserSettings,
    UserSettingsUpdate,
    Version,
)
from dna.models.entity import ENTITY_MODELS, EntityBase
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    get_prodtrack_provider,
)
from dna.storage_providers.storage_provider_base import (
    StorageProviderBase,
    get_storage_provider,
)
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
    get_transcription_provider,
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
    {
        "name": "Draft Notes",
        "description": "Operations for managing draft notes",
    },
    {
        "name": "Playlist Metadata",
        "description": "Operations for managing playlist metadata (in-review version and meeting ID)",
    },
    {
        "name": "User Settings",
        "description": "Operations for managing user settings and preferences",
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


@lru_cache
def get_storage_provider_cached() -> StorageProviderBase:
    """Get or create the storage provider singleton."""
    return get_storage_provider()


@lru_cache
def get_transcription_provider_cached() -> TranscriptionProviderBase:
    """Get or create the transcription provider singleton."""
    return get_transcription_provider()


@lru_cache
def get_llm_provider_cached() -> LLMProviderBase:
    """Get or create the LLM provider singleton."""
    return get_llm_provider()


ProdtrackProviderDep = Annotated[
    ProdtrackProviderBase, Depends(get_prodtrack_provider_cached)
]

StorageProviderDep = Annotated[
    StorageProviderBase, Depends(get_storage_provider_cached)
]

TranscriptionProviderDep = Annotated[
    TranscriptionProviderBase, Depends(get_transcription_provider_cached)
]

LLMProviderDep = Annotated[LLMProviderBase, Depends(get_llm_provider_cached)]


@lru_cache
def get_event_publisher_cached() -> EventPublisher:
    """Get or create the event publisher singleton."""
    return get_event_publisher()


EventPublisherDep = Annotated[EventPublisher, Depends(get_event_publisher_cached)]


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


@app.post(
    "/search",
    tags=["Entities"],
    summary="Search entities across multiple types",
    description="Unified search endpoint for @mentions and entity linking.",
    response_model=dict[str, list[SearchResult]],
)
async def search_entities(
    request: SearchRequest, provider: ProdtrackProviderDep
) -> dict[str, list[SearchResult]]:
    """Search for entities across multiple entity types."""
    # Validate entity types
    for entity_type in request.entity_types:
        if entity_type.lower() not in ENTITY_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported entity type: '{entity_type}'. "
                f"Supported types: {list(ENTITY_MODELS.keys())}",
            )

    try:
        results = provider.search(
            query=request.query,
            entity_types=[et.lower() for et in request.entity_types],
            project_id=request.project_id,
            limit=request.limit,
        )
        return {"results": results}
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


@app.post(
    "/playlists/{playlist_id}/publish-notes",
    tags=["Playlists"],
    summary="Publish draft notes",
    description="Publish draft notes to the production tracking system.",
    response_model=PublishNotesResponse,
)
async def publish_notes(
    playlist_id: int,
    request: PublishNotesRequest,
    storage: StorageProviderDep,
    prodtrack: ProdtrackProviderDep,
) -> PublishNotesResponse:
    """Publish draft notes to the production tracking system."""
    # 1. Get all draft notes for this playlist
    all_draft_notes = await storage.get_draft_notes_for_playlist(playlist_id)

    # 2. Filter notes
    notes_to_publish = []
    for note in all_draft_notes:
        if note.published:
            continue

        # specific user check
        if not request.include_others and note.user_email != request.user_email:
            continue

        notes_to_publish.append(note)

    # 3. Publish each note
    published_count = 0
    failed_count = 0
    skipped_count = 0

    from datetime import datetime, timezone

    for note in notes_to_publish:
        try:
            # Get links
            links = []
            if note.links:
                for link in note.links:
                    model_class = ENTITY_MODELS.get(link.entity_type)
                    if model_class:
                        links.append(model_class(id=link.entity_id))

            # Ensure playlist is included in links
            playlist_link_exists = any(
                isinstance(l, Playlist) and l.id == playlist_id for l in links
            )
            if not playlist_link_exists:
                links.append(_create_stub_entity("Playlist", playlist_id))

            note_id = prodtrack.publish_note(
                version_id=note.version_id,
                content=note.content,
                subject=note.subject,
                to_users=[],  # TODO: Parse to/cc
                cc_users=[],
                links=links,
                author_email=note.user_email,
            )

            # Update draft note as published
            update_data = DraftNoteUpdate(
                published=True,
                published_at=datetime.now(timezone.utc),
                published_note_id=note_id,
            )

            await storage.upsert_draft_note(
                user_email=note.user_email,
                playlist_id=note.playlist_id,
                version_id=note.version_id,
                data=update_data,
            )

            published_count += 1

        except Exception as e:
            print(f"Failed to publish note {note.id}: {e}")
            failed_count += 1

    return PublishNotesResponse(
        published_count=published_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
        total=len(notes_to_publish),
    )


# -----------------------------------------------------------------------------
# Draft Notes endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/playlists/{playlist_id}/draft-notes",
    tags=["Draft Notes"],
    summary="Get all draft notes for a playlist",
    description="Retrieve all users' draft notes for the specified playlist.",
    response_model=list[DraftNote],
)
async def get_playlist_draft_notes(
    playlist_id: int,
    provider: StorageProviderDep,
) -> list[DraftNote]:
    """Get all draft notes for a playlist."""
    return await provider.get_draft_notes_for_playlist(playlist_id)


@app.get(
    "/playlists/{playlist_id}/versions/{version_id}/draft-notes",
    tags=["Draft Notes"],
    summary="Get all draft notes for a version",
    description="Retrieve all users' draft notes for the specified playlist/version.",
    response_model=list[DraftNote],
)
async def get_all_draft_notes(
    playlist_id: int,
    version_id: int,
    provider: StorageProviderDep,
) -> list[DraftNote]:
    """Get all users' draft notes for this playlist/version."""
    return await provider.get_draft_notes_for_version(playlist_id, version_id)


@app.get(
    "/playlists/{playlist_id}/versions/{version_id}/draft-notes/{user_email}",
    tags=["Draft Notes"],
    summary="Get draft note for a user",
    description="Retrieve a specific user's draft note for the playlist/version.",
    response_model=Optional[DraftNote],
)
async def get_draft_note(
    playlist_id: int,
    version_id: int,
    user_email: str,
    provider: StorageProviderDep,
) -> Optional[DraftNote]:
    """Get a specific user's draft note."""
    return await provider.get_draft_note(user_email, playlist_id, version_id)


@app.put(
    "/playlists/{playlist_id}/versions/{version_id}/draft-notes/{user_email}",
    tags=["Draft Notes"],
    summary="Create or update a draft note",
    description="Create or update a user's draft note for the playlist/version.",
    response_model=DraftNote,
)
async def upsert_draft_note(
    playlist_id: int,
    version_id: int,
    user_email: str,
    data: DraftNoteUpdate,
    provider: StorageProviderDep,
) -> DraftNote:
    """Create or update a user's draft note."""
    return await provider.upsert_draft_note(user_email, playlist_id, version_id, data)


@app.delete(
    "/playlists/{playlist_id}/versions/{version_id}/draft-notes/{user_email}",
    tags=["Draft Notes"],
    summary="Delete a draft note",
    description="Delete a user's draft note for the playlist/version.",
    response_model=bool,
)
async def delete_draft_note(
    playlist_id: int,
    version_id: int,
    user_email: str,
    provider: StorageProviderDep,
) -> bool:
    """Delete a user's draft note."""
    deleted = await provider.delete_draft_note(user_email, playlist_id, version_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Draft note not found")
    return True


# -----------------------------------------------------------------------------
# Playlist Metadata endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/playlists/{playlist_id}/metadata",
    tags=["Playlist Metadata"],
    summary="Get playlist metadata",
    description="Retrieve metadata for a playlist including in-review version and meeting ID.",
    response_model=Optional[PlaylistMetadata],
)
async def get_playlist_metadata(
    playlist_id: int,
    provider: StorageProviderDep,
) -> Optional[PlaylistMetadata]:
    """Get playlist metadata."""
    return await provider.get_playlist_metadata(playlist_id)


@app.put(
    "/playlists/{playlist_id}/metadata",
    tags=["Playlist Metadata"],
    summary="Create or update playlist metadata",
    description="Create or update metadata for a playlist (in-review version and meeting ID).",
    response_model=PlaylistMetadata,
)
async def upsert_playlist_metadata(
    playlist_id: int,
    data: PlaylistMetadataUpdate,
    provider: StorageProviderDep,
) -> PlaylistMetadata:
    """Create or update playlist metadata."""
    return await provider.upsert_playlist_metadata(playlist_id, data)


@app.delete(
    "/playlists/{playlist_id}/metadata",
    tags=["Playlist Metadata"],
    summary="Delete playlist metadata",
    description="Delete metadata for a playlist.",
    response_model=bool,
)
async def delete_playlist_metadata(
    playlist_id: int,
    provider: StorageProviderDep,
) -> bool:
    """Delete playlist metadata."""
    deleted = await provider.delete_playlist_metadata(playlist_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Playlist metadata not found")
    return True


# -----------------------------------------------------------------------------
# User Settings endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/users/{user_email}/settings",
    tags=["User Settings"],
    summary="Get user settings",
    description="Retrieve settings for a user by their email address.",
    response_model=Optional[UserSettings],
)
async def get_user_settings(
    user_email: str,
    provider: StorageProviderDep,
) -> Optional[UserSettings]:
    """Get user settings."""
    return await provider.get_user_settings(user_email)


@app.put(
    "/users/{user_email}/settings",
    tags=["User Settings"],
    summary="Create or update user settings",
    description="Create or update settings for a user.",
    response_model=UserSettings,
)
async def upsert_user_settings(
    user_email: str,
    data: UserSettingsUpdate,
    provider: StorageProviderDep,
) -> UserSettings:
    """Create or update user settings."""
    return await provider.upsert_user_settings(user_email, data)


@app.delete(
    "/users/{user_email}/settings",
    tags=["User Settings"],
    summary="Delete user settings",
    description="Delete settings for a user.",
    response_model=bool,
)
async def delete_user_settings(
    user_email: str,
    provider: StorageProviderDep,
) -> bool:
    """Delete user settings."""
    deleted = await provider.delete_user_settings(user_email)
    if not deleted:
        raise HTTPException(status_code=404, detail="User settings not found")
    return True


# -----------------------------------------------------------------------------
# Transcription endpoints
# -----------------------------------------------------------------------------


@app.post(
    "/transcription/bot",
    tags=["Transcription"],
    summary="Dispatch a bot to a meeting",
    description="Start a transcription bot that joins the specified meeting.",
    response_model=BotSession,
    status_code=201,
)
async def dispatch_bot(
    request: DispatchBotRequest,
    transcription_provider: TranscriptionProviderDep,
    storage_provider: StorageProviderDep,
    event_publisher: EventPublisherDep,
) -> BotSession:
    """Dispatch a transcription bot to a meeting."""
    try:
        session = await transcription_provider.dispatch_bot(
            platform=request.platform,
            meeting_id=request.meeting_id,
            playlist_id=request.playlist_id,
            passcode=request.passcode,
            bot_name=request.bot_name,
            language=request.language,
        )

        await storage_provider.upsert_playlist_metadata(
            request.playlist_id,
            PlaylistMetadataUpdate(
                meeting_id=request.meeting_id,
                platform=request.platform.value,
                vexa_meeting_id=session.vexa_meeting_id,
            ),
        )

        await event_publisher.publish(
            EventType.TRANSCRIPTION_SUBSCRIBE,
            {
                "playlist_id": request.playlist_id,
                "meeting_id": request.meeting_id,
                "platform": request.platform.value,
            },
        )

        return session
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete(
    "/transcription/bot/{platform}/{meeting_id}",
    tags=["Transcription"],
    summary="Stop a transcription bot",
    description="Stop a transcription bot that is currently in a meeting.",
    response_model=bool,
)
async def stop_bot(
    platform: Platform,
    meeting_id: str,
    transcription_provider: TranscriptionProviderDep,
) -> bool:
    """Stop a transcription bot."""
    try:
        return await transcription_provider.stop_bot(platform, meeting_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get(
    "/transcription/bot/{platform}/{meeting_id}/status",
    tags=["Transcription"],
    summary="Get bot status",
    description="Get the current status of a transcription bot.",
    response_model=BotStatus,
)
async def get_bot_status(
    platform: Platform,
    meeting_id: str,
    transcription_provider: TranscriptionProviderDep,
) -> BotStatus:
    """Get the status of a transcription bot."""
    try:
        return await transcription_provider.get_bot_status(platform, meeting_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get(
    "/transcription/transcript/{platform}/{meeting_id}",
    tags=["Transcription"],
    summary="Get transcript",
    description="Get the full transcript for a meeting.",
    response_model=Transcript,
)
async def get_transcript(
    platform: Platform,
    meeting_id: str,
    transcription_provider: TranscriptionProviderDep,
) -> Transcript:
    """Get the transcript for a meeting."""
    try:
        return await transcription_provider.get_transcript(platform, meeting_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get(
    "/transcription/segments/{playlist_id}/{version_id}",
    tags=["Transcription"],
    summary="Get segments for a version",
    description="Get all stored transcript segments for a specific playlist version.",
    response_model=list[StoredSegment],
)
async def get_segments_for_version(
    playlist_id: int,
    version_id: int,
    storage_provider: StorageProviderDep,
) -> list[StoredSegment]:
    """Get all transcript segments for a version."""
    try:
        return await storage_provider.get_segments_for_version(playlist_id, version_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -----------------------------------------------------------------------------
# LLM endpoints
# -----------------------------------------------------------------------------


def _build_version_context(version: Version) -> str:
    """Build a context string from version metadata."""
    parts = []
    if version.name:
        parts.append(f"Version: {version.name}")
    if version.entity:
        entity_type = version.entity.__class__.__name__
        parts.append(f"{entity_type}: {version.entity.name}")
    if version.task:
        if version.task.name:
            parts.append(f"Task: {version.task.name}")
        if version.task.pipeline_step and version.task.pipeline_step.get("name"):
            parts.append(f"Department: {version.task.pipeline_step['name']}")
    if version.status:
        parts.append(f"Status: {version.status}")
    if version.description:
        parts.append(f"Description: {version.description}")
    return "\n".join(parts) if parts else "No version context available."


def _build_transcript_text(segments: list[StoredSegment]) -> str:
    """Build a transcript string from segments."""
    if not segments:
        return "No transcript available."
    lines = []
    for segment in segments:
        speaker = segment.speaker or "Unknown"
        lines.append(f"{speaker}: {segment.text}")
    return "\n".join(lines)


def _build_full_prompt(
    prompt: str,
    transcript: str,
    context: str,
    existing_notes: str,
    additional_instructions: str | None = None,
) -> str:
    """Build the full prompt with template values substituted."""
    result = prompt
    result = result.replace("{{ transcript }}", transcript)
    result = result.replace("{{transcript}}", transcript)
    result = result.replace("{{ context }}", context)
    result = result.replace("{{context}}", context)
    result = result.replace("{{ notes }}", existing_notes)
    result = result.replace("{{notes}}", existing_notes)
    if additional_instructions:
        result += f"\n\nAdditional Instructions: {additional_instructions}"
    return result


@app.post(
    "/generate-note",
    tags=["LLM"],
    summary="Generate an AI note suggestion",
    description="Generate a note suggestion using AI based on transcript and version context.",
    response_model=GenerateNoteResponse,
)
async def generate_note(
    request: GenerateNoteRequest,
    storage_provider: StorageProviderDep,
    prodtrack_provider: ProdtrackProviderDep,
    llm_provider: LLMProviderDep,
) -> GenerateNoteResponse:
    """Generate an AI-powered note suggestion."""
    try:
        user_settings = await storage_provider.get_user_settings(request.user_email)
        prompt = (
            user_settings.note_prompt
            if user_settings and user_settings.note_prompt
            else DEFAULT_PROMPT
        )

        segments = await storage_provider.get_segments_for_version(
            request.playlist_id, request.version_id
        )
        transcript = _build_transcript_text(segments)

        version = cast(
            Version,
            prodtrack_provider.get_entity(
                "version", request.version_id, resolve_links=False
            ),
        )
        context = _build_version_context(version)

        draft_note = await storage_provider.get_draft_note(
            request.user_email, request.playlist_id, request.version_id
        )
        existing_notes = draft_note.content if draft_note else ""

        full_prompt = _build_full_prompt(
            prompt, transcript, context, existing_notes, request.additional_instructions
        )

        suggestion = await llm_provider.generate_note(
            prompt=prompt,
            transcript=transcript,
            context=context,
            existing_notes=existing_notes,
            additional_instructions=request.additional_instructions,
        )

        return GenerateNoteResponse(
            suggestion=suggestion,
            prompt=full_prompt,
            context=context,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
