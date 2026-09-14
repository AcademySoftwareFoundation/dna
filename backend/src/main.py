"""FastAPI application entry point."""

import asyncio
import contextlib
import logging
import os
import shutil
import uuid
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Optional, cast

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from dna.auth.email import emails_match
from dna.auth.session_store import UserSession
from dna.auth_providers.auth_provider_base import AuthProviderBase, get_auth_provider
from dna.cors_settings import get_cors_middleware_kwargs
from dna.events import EventType, get_event_publisher
from dna.glossary_config import (
    get_default_glossary_global,
    inject_glossaries,
)
from dna.llm_providers.llm_provider_base import LLMProviderBase, get_llm_provider
from dna.models import (
    AddVersionToPlaylistRequest,
    Asset,
    BotSession,
    BotStatus,
    CreateNoteRequest,
    CreatePlaylistRequest,
    DispatchBotRequest,
    DraftNote,
    DraftNoteUpdate,
    FindRequest,
    GenerateNoteRequest,
    GenerateNoteResponse,
    Note,
    NoteQCCheck,
    NoteQCCheckCreate,
    NoteQCCheckUpdate,
    Platform,
    Playlist,
    PlaylistMetadata,
    PlaylistMetadataUpdate,
    Project,
    ProjectGlossary,
    ProjectGlossaryUpdate,
    PublishedTranscriptUpdate,
    PublishNotesRequest,
    PublishNotesResponse,
    PublishTranscriptRequest,
    PublishTranscriptResponse,
    RunQCChecksRequest,
    RunQCChecksResponse,
    SearchRequest,
    SearchResult,
    Shot,
    StatusOption,
    StoredSegment,
    Task,
    Transcript,
    UpdateVersionStatusRequest,
    UpdateVersionStatusResponse,
    User,
    UserSettings,
    UserSettingsResponse,
    UserSettingsUpdate,
    Version,
)
from dna.models.entity import ENTITY_MODELS, EntityBase
from dna.note_prompt_config import get_default_note_prompt
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackAuthError,
    ProdtrackPermissionError,
    ProdtrackProviderBase,
    ProdtrackUnavailableError,
    get_prodtrack_provider,
)
from dna.prodtrack_providers.shotgrid import SGFault, classify_sg_fault
from dna.qc.qc_runner import run_qc_checks_for_draft
from dna.storage_providers.storage_provider_base import (
    StorageProviderBase,
    get_storage_provider,
)
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
    get_transcription_provider,
)
from dna.transcription_service import TranscriptionService, get_transcription_service

# uvicorn configures handlers on its own loggers only, so without this the
# application's own log records have nowhere to go and are silently dropped —
# including the CRITICAL emitted when ShotGrid credentials fail verification.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

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
    {
        "name": "Note QC",
        "description": "User-defined LLM quality checks for draft notes at publish time",
    },
]

DISABLE_DOCS = os.getenv("DISABLE_DOCS", "false").lower() == "true"

# -----------------------------------------------------------------------------
# Lifecycle
# -----------------------------------------------------------------------------

# Populated during startup; surfaced by GET /health so an orchestrator's
# readiness probe can keep traffic away from a misconfigured instance.
_startup_checks: dict[str, bool] = {}


def _verify_shotgrid_script_credentials() -> bool:
    """Confirm the ShotGrid script account can authenticate.

    Every authenticated request impersonates a user through this account via
    ``sudo_as_login``, so a revoked or mistyped key breaks the entire API.
    Verifying at boot turns that into one clear log line instead of a confusing
    failure on the first user login.

    Returns False rather than raising: a ShotGrid blip during a deploy should
    not put the service into a crash loop.  The result is reported by
    ``GET /health``, which returns 503 so the instance stays out of rotation
    until ShotGrid recovers.
    """
    if os.getenv("PRODTRACK_PROVIDER", "shotgrid") != "shotgrid":
        return True
    try:
        from dna.prodtrack_providers.shotgrid import ShotgridProvider

        ShotgridProvider().sg.find_one("HumanUser", [], ["id"])
    except Exception as exc:
        logger.critical(
            "ShotGrid script credentials failed verification: %s. "
            "Authenticated requests impersonate users through this account, so "
            "they will fail. Check SHOTGRID_URL, SHOTGRID_SCRIPT_NAME and "
            "SHOTGRID_API_KEY.",
            exc,
        )
        return False
    logger.info("ShotGrid script credentials verified.")
    return True


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start up and shut down application services."""
    # shotgun_api3 is synchronous, so this runs in a worker thread: calling it
    # inline would block the event loop for the duration of the round trip. The
    # timeout bounds how long a slow ShotGrid can delay the whole service —
    # the result only feeds /health, so it is never worth waiting long for.
    try:
        _startup_checks["shotgrid"] = await asyncio.wait_for(
            asyncio.to_thread(_verify_shotgrid_script_credentials),
            timeout=float(os.getenv("SG_STARTUP_CHECK_TIMEOUT", "10")),
        )
    except asyncio.TimeoutError:
        logger.critical(
            "ShotGrid script credential check timed out. Authenticated requests "
            "impersonate users through this account and will fail until it "
            "responds. Check SHOTGRID_URL and network reachability."
        )
        _startup_checks["shotgrid"] = False

    service = get_transcription_service()
    await service.init_providers()
    storage = service.storage_provider
    ensure_indexes = getattr(storage, "ensure_indexes", None)
    if callable(ensure_indexes):
        await ensure_indexes()
    await service.resubscribe_to_active_meetings()

    yield

    await service.close()


app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    lifespan=lifespan,
    openapi_tags=tags_metadata,
    docs_url=None if DISABLE_DOCS else "/docs",
    redoc_url=None if DISABLE_DOCS else "/redoc",
    openapi_url=None if DISABLE_DOCS else "/openapi.json",
    contact={
        "name": "DNA Project",
        "url": "https://github.com/AcademySoftwareFoundation/dna",
    },
)

app.add_middleware(CORSMiddleware, **get_cors_middleware_kwargs())


# -----------------------------------------------------------------------------
# Production-tracker error translation
# -----------------------------------------------------------------------------
#
# ShotGrid reports permission denials, revoked accounts and outages as the same
# generic Fault. Unhandled, all three become HTTP 500. These handlers classify
# the Fault once and give each the status code Issue #55 calls for, so a denied
# query returns 403 rather than "internal server error".


@app.exception_handler(SGFault)
async def _handle_shotgrid_fault(request: Request, exc: SGFault):
    """Classify a raw ShotGrid Fault and delegate to the matching handler."""
    classified = classify_sg_fault(exc)
    if isinstance(classified, ProdtrackPermissionError):
        return await _handle_prodtrack_permission_error(request, classified)
    if isinstance(classified, ProdtrackAuthError):
        return await _handle_prodtrack_auth_error(request, classified)
    return await _handle_prodtrack_unavailable(request, classified)


@app.exception_handler(ProdtrackPermissionError)
async def _handle_prodtrack_permission_error(
    _request: Request, exc: ProdtrackPermissionError
):
    """Production tracker denied access to the resource → 403."""
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(ProdtrackAuthError)
async def _handle_prodtrack_auth_error(_request: Request, exc: ProdtrackAuthError):
    """Impersonated identity rejected (deactivated / revoked) → 401."""
    return JSONResponse(
        status_code=401,
        content={"detail": str(exc)},
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(ProdtrackUnavailableError)
async def _handle_prodtrack_unavailable(
    _request: Request, exc: ProdtrackUnavailableError
):
    """Production tracker errored or is unreachable → 503."""
    logger.warning("Production tracker unavailable: %s", exc)
    return JSONResponse(status_code=503, content={"detail": str(exc)})


# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # In production the app sits behind a TLS-terminating proxy, so the request
    # arrives over plain HTTP and request.url.scheme is "http".  Trust
    # X-Forwarded-Proto as well, otherwise HSTS would be emitted only in local
    # development and never where it actually matters.
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    if request.url.scheme == "https" or forwarded_proto == "https":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


class LoginRequest(BaseModel):
    """Credentials for standalone ShotGrid login (fallback path).

    Cloud ShotGrid: username = SG username, password = Legacy Login password.
    Both username AND a Personal Access Token (PAT) bound to the account
    are required on cloud sites. PATs cannot be admin-provisioned; each user
    must generate one at profile.autodesk.com.

    On-prem Docker (SG_SITE_TYPE=onprem): PAT not required.
    Use actual ShotGrid or LDAP/AD password.
    """

    username: str
    password: str


# -----------------------------------------------------------------------------
# Dependencies
# -----------------------------------------------------------------------------


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


StorageProviderDep = Annotated[
    StorageProviderBase, Depends(get_storage_provider_cached)
]

TranscriptionProviderDep = Annotated[
    TranscriptionProviderBase, Depends(get_transcription_provider_cached)
]

LLMProviderDep = Annotated[LLMProviderBase, Depends(get_llm_provider_cached)]


@lru_cache
def get_transcription_service_cached() -> TranscriptionService:
    """Get or create the transcription service singleton."""
    return get_transcription_service()


TranscriptionServiceDep = Annotated[
    TranscriptionService, Depends(get_transcription_service_cached)
]


# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------

security = HTTPBearer(auto_error=False)


@lru_cache
def get_auth_provider_cached() -> Optional[AuthProviderBase]:
    """Get or create the auth provider singleton."""
    return get_auth_provider()


AuthProviderDep = Annotated[
    Optional[AuthProviderBase], Depends(get_auth_provider_cached)
]


@dataclass
class AuthContext:
    """The caller's identity, resolved once per request."""

    email: str
    # The server-side session, for ShotGrid logins only. None for the noop and
    # Google providers, which have no DNA session.
    session: Optional[UserSession] = None


def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    auth_provider: AuthProviderDep = None,
) -> AuthContext:
    """Authenticate the request.

    Declared as a plain ``def`` on purpose. Validating a ShotGrid token reads
    the session from MongoDB with a blocking driver; FastAPI runs synchronous
    dependencies in its threadpool, keeping that I/O off the event loop. FastAPI
    also caches a dependency's result for the duration of a request, so every
    consumer — the current user, the ShotGrid provider, ``/auth/me`` — shares
    this single lookup.

    Raises HTTPException 401 if the token is missing or invalid, or its session
    has ended. When AUTH_PROVIDER=none, authentication is skipped and a
    placeholder email is returned (development and tests only).
    """
    auth_provider_type = os.getenv("AUTH_PROVIDER", "none")
    if auth_provider_type == "none":
        if credentials and credentials.credentials and auth_provider is not None:
            return AuthContext(
                email=auth_provider.get_user_email(credentials.credentials)
            )
        return AuthContext(email="anonymous@localhost")

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if auth_provider is None:
        # AUTH_PROVIDER names a provider but it failed to construct — most often
        # a missing JWT_SECRET_KEY. Without this guard the attribute access
        # below raises AttributeError and every request 500s.
        logger.error(
            "AUTH_PROVIDER=%s but no auth provider could be constructed; "
            "rejecting request. Check the provider's required settings.",
            auth_provider_type,
        )
        raise HTTPException(
            status_code=401,
            detail="Authentication is unavailable. Please contact your administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        session: Optional[UserSession] = None
        shotgrid = _shotgrid_provider(auth_provider)
        if shotgrid is not None:
            claims, session = shotgrid.authenticate(credentials.credentials)
        else:
            claims = auth_provider.validate_token(credentials.credentials)
    except ValueError as e:
        raise HTTPException(
            status_code=401,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Safely access the email claim to avoid KeyError and return 401 on missing email
    email = claims.get("email") if isinstance(claims, dict) else None
    if not email:
        raise HTTPException(
            status_code=401,
            detail="Missing email claim in authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthContext(email=email, session=session)


AuthContextDep = Annotated[AuthContext, Depends(get_auth_context)]


def get_current_user(auth: AuthContextDep) -> str:
    """Return the authenticated user's email."""
    return auth.email


CurrentUserDep = Annotated[str, Depends(get_current_user)]


# -----------------------------------------------------------------------------
# Production Tracking — per-request, user-scoped provider
# Must be defined AFTER CurrentUserDep
# -----------------------------------------------------------------------------


def get_user_scoped_prodtrack_provider(
    auth: AuthContextDep,
    auth_provider: AuthProviderDep = None,
) -> ProdtrackProviderBase:
    """Return a ShotgridProvider that impersonates the authenticated user.

    Every authenticated request runs as the ShotGrid script account with
    ``sudo_as_login=<the user's ShotGrid login>``, so ShotGrid applies that
    user's own permission group to every query. A plain ``def``, so building
    the ShotGrid connection happens in FastAPI's threadpool.

    Fails closed.  If an authenticated session cannot supply a ShotGrid login
    name, the request is rejected with 401.  It must never degrade to the bare
    script account, which would answer the query with full site permissions —
    see Issue #55: "Never use service account for user-facing queries".
    """
    sudo_login: Optional[str] = None
    session_id: Optional[str] = None

    if _shotgrid_provider(auth_provider) is not None:
        session = auth.session
        sudo_login = session.sg_username if session else None
        session_id = session.session_id if session else None
        if not sudo_login:
            # No session, or one carrying no ShotGrid login name: it predates
            # the sudo_as_login design, or a failed refresh blanked it. Reject
            # rather than fall through to script-account access.
            logger.warning(
                "Authenticated request has no ShotGrid login name; rejecting "
                "instead of falling back to script credentials."
            )
            raise HTTPException(
                status_code=401,
                detail=(
                    "Session is missing the ShotGrid login name. "
                    "Please log in again."
                ),
                headers={"WWW-Authenticate": "Bearer"},
            )

    try:
        return get_prodtrack_provider(sudo_login=sudo_login, session_id=session_id)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


ProdtrackProviderDep = Annotated[
    ProdtrackProviderBase, Depends(get_user_scoped_prodtrack_provider)
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
    description="Check if the API is running and its dependencies are reachable.",
    response_description="Health status of the API and its dependencies",
)
async def health(response: Response):
    """Readiness probe for monitoring and load balancers.

    Reports the dependencies this instance actually needs, so an orchestrator
    can route traffic away from a process that is running but cannot serve:

    ``mongo``     live ping — only when auth is enabled, since that is the only
                  mode that reads sessions from MongoDB on every request.
    ``shotgrid``  the cached result of the startup credential check.  It is not
                  re-probed here: health endpoints are polled frequently and
                  hitting ShotGrid on every probe would burn rate limit for no
                  new information.

    Returns 503 when any reported check is failing.
    """
    checks: dict[str, bool] = {}

    if os.getenv("AUTH_PROVIDER", "none") != "none":
        try:
            from dna.auth.session_store import get_session_store

            checks["mongo"] = get_session_store().ping()
        except Exception as exc:
            logger.warning("Health check: MongoDB unreachable: %s", exc)
            checks["mongo"] = False

    if "shotgrid" in _startup_checks:
        checks["shotgrid"] = _startup_checks["shotgrid"]

    healthy = all(checks.values())
    if not healthy:
        response.status_code = 503
    return {"status": "healthy" if healthy else "degraded", **checks}


@app.post(
    "/test/broadcast-transcript",
    tags=["Testing"],
    summary="Broadcast a synthetic transcript (dev-only).",
    include_in_schema=False,
)
async def test_broadcast_transcript(payload: dict) -> dict:
    """Dev-only endpoint for tests-vm/. Gated by DNA_TESTING_ENABLED=true.

    Forwards the JSON body verbatim to every WebSocket client — lets us
    assert the broadcast shape end-to-end without needing a real meeting.
    """
    if os.getenv("DNA_TESTING_ENABLED", "false").lower() not in ("1", "true", "yes"):
        raise HTTPException(status_code=404, detail="Not found")
    publisher = get_event_publisher()
    await publisher.ws_manager.broadcast(payload)
    return {"broadcasted": True, "clients": publisher.ws_manager.connection_count}


# -----------------------------------------------------------------------------
# Auth endpoints
#
# Login, refresh and logout call ShotGrid and MongoDB with blocking clients, so
# they are plain ``def``: FastAPI runs them in its threadpool and a slow
# ShotGrid never stalls other requests or WebSocket traffic.
# -----------------------------------------------------------------------------


@app.get("/auth/login", tags=["Auth"], summary="Get login mode — pat or sso")
async def auth_get_login_info(auth_provider: AuthProviderDep = None):
    """Return the configured auth mode so the frontend can render the correct login UI.

    Returns:
        {"mode": "pat"} for username+password login, or
        {"mode": "sso", "redirect_url": "..."} for ShotGrid login page redirect.
        {"mode": "none"} when AUTH_PROVIDER=none (development).
    """
    if auth_provider is None:
        return {"mode": "none"}
    try:
        from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider

        if isinstance(auth_provider, ShotGridSSOProvider):
            return auth_provider.get_login_info()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"mode": "none"}


def _shotgrid_provider(auth_provider: Optional[AuthProviderBase]):
    """Return ``auth_provider`` if it is the ShotGrid provider, else None."""
    from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider

    return auth_provider if isinstance(auth_provider, ShotGridSSOProvider) else None


def _auth_response(body: dict, refresh_cookie: Optional[str] = None) -> JSONResponse:
    """JSON response that sets the refresh cookie when a new one was issued."""
    from dna.auth_providers.shotgrid_sso import (
        REFRESH_COOKIE_NAME,
        refresh_cookie_settings,
    )

    response = JSONResponse(body)
    if refresh_cookie is not None:
        response.set_cookie(
            REFRESH_COOKIE_NAME, refresh_cookie, **refresh_cookie_settings()
        )
    return response


def _clear_refresh_cookie(response: Response) -> Response:
    from dna.auth_providers.shotgrid_sso import (
        REFRESH_COOKIE_NAME,
        refresh_cookie_settings,
    )

    response.delete_cookie(REFRESH_COOKIE_NAME, **refresh_cookie_settings())
    return response


def _clear_refresh_cookie_headers() -> dict[str, str]:
    """``Set-Cookie`` header that deletes the refresh cookie, for error responses."""
    return {"set-cookie": _clear_refresh_cookie(Response()).headers["set-cookie"]}


def _has_csrf_header(request: Request) -> bool:
    """Cookie-authenticated calls must carry the custom CSRF header.

    A page on another site cannot add a custom header to a cross-origin request
    without a CORS preflight, which it will fail. A forged form post therefore
    cannot use the victim's refresh cookie.
    """
    from dna.auth_providers.shotgrid_sso import CSRF_HEADER_NAME

    return request.headers.get(CSRF_HEADER_NAME) == "1"


@app.post(
    "/auth/login",
    tags=["Auth"],
    summary="Standalone login — ShotGrid username + Legacy Password",
)
def auth_login(body: LoginRequest, auth_provider: AuthProviderDep):
    """Log in with ShotGrid username + Legacy Password.

    Returns a short-lived access token in the body and sets the refresh token as
    an httpOnly cookie.
    """
    if auth_provider is None:
        return {"message": "Authentication disabled (AUTH_PROVIDER=none)"}
    provider = _shotgrid_provider(auth_provider)
    if provider is None:
        configured = os.getenv("AUTH_PROVIDER", "none")
        return {"message": f"Provider '{configured}': supply Bearer token directly."}
    from dna.auth.shotgrid_auth_client import ShotGridUnavailable

    try:
        result = provider.login(username=body.username, password=body.password)
    except ShotGridUnavailable as exc:
        # ShotGrid did not answer, so nothing is known about the credentials.
        # The details name internal URLs and errors: log them, never return them
        # to an unauthenticated caller.
        logger.warning("Login could not reach ShotGrid: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="ShotGrid is unavailable right now. Please try again shortly.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return _auth_response(result.body, result.refresh_cookie)


@app.post("/auth/refresh", tags=["Auth"], summary="Refresh access token")
def auth_refresh(request: Request, auth_provider: AuthProviderDep = None):
    """Exchange the httpOnly refresh cookie for a new access token.

    The refresh token is single-use and rotated on every call. Requires the
    ``X-DNA-CSRF: 1`` header. A 401 means the session is over and the user must
    log in again; any other failure is transient and safe to retry.
    """
    from dna.auth_providers.shotgrid_sso import REFRESH_COOKIE_NAME

    provider = _shotgrid_provider(auth_provider)
    if provider is None:
        raise HTTPException(
            status_code=400, detail="Token refresh requires AUTH_PROVIDER=shotgrid."
        )
    if not _has_csrf_header(request):
        raise HTTPException(status_code=403, detail="Missing X-DNA-CSRF header.")

    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_cookie:
        raise HTTPException(
            status_code=401,
            detail="No refresh token. Please log in again.",
            headers=_clear_refresh_cookie_headers(),
        )
    try:
        result = provider.refresh_session(refresh_cookie)
    except ValueError as exc:
        raise HTTPException(
            status_code=401, detail=str(exc), headers=_clear_refresh_cookie_headers()
        )
    return _auth_response(result.body, result.refresh_cookie)


@app.post(
    "/auth/logout", tags=["Auth"], summary="Logout — revoke token and delete session"
)
def auth_logout(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
    auth_provider: AuthProviderDep = None,
):
    """End the current session and clear the refresh cookie.

    Accepts the access token (even if expired) and/or the refresh cookie, so a
    user idle past the access token's lifetime can still log out.

    Fails closed: if the session cannot be revoked server-side, returns 503
    instead of reporting success while the session remains usable. The client
    should discard its local credentials either way.
    """
    from dna.auth_providers.shotgrid_sso import REFRESH_COOKIE_NAME

    provider = _shotgrid_provider(auth_provider)
    if provider is None:
        return {"message": "Logged out successfully.", "action": "delete_token"}

    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_cookie and not _has_csrf_header(request):
        # Never end a session from a cookie alone on a request that could have
        # been forged by another site.
        refresh_cookie = None
    access_token = credentials.credentials if credentials else None

    try:
        provider.logout(access_token, refresh_cookie)
    except Exception as exc:
        logger.error("Logout failed; the session may still be active: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Logout could not be completed on the server, so your session may "
                "still be active. Please try again."
            ),
            headers=_clear_refresh_cookie_headers(),
        )
    return _clear_refresh_cookie(
        JSONResponse({"message": "Logged out successfully.", "action": "delete_token"})
    )


@app.post(
    "/auth/logout-all",
    tags=["Auth"],
    summary="Log out everywhere — end every session for the current user",
)
def auth_logout_all(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
    auth_provider: AuthProviderDep = None,
):
    """End every session belonging to the current user, on every device.

    Use after a lost device, a suspected compromise, or a password change.
    Fails closed with 503 if the sessions cannot be removed.
    """
    provider = _shotgrid_provider(auth_provider)
    if provider is None:
        raise HTTPException(
            status_code=400,
            detail="Logging out everywhere requires AUTH_PROVIDER=shotgrid.",
        )
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        ended = provider.logout_all(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}
        )
    except Exception as exc:
        logger.error("Logout-all failed; sessions may still be active: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not end your sessions on the server, so some may still be "
                "active. Please try again."
            ),
        )
    return _clear_refresh_cookie(
        JSONResponse(
            {
                "message": "Logged out of all sessions.",
                "sessions_ended": ended,
                "action": "delete_token",
            }
        )
    )


@app.get("/auth/me", tags=["Auth"], summary="Get current user info")
async def auth_me(auth: AuthContextDep):
    """Return information about the currently authenticated user.

    A session that has ended is rejected with 401 during authentication, so the
    frontend clears its stale token and shows the login page rather than letting
    the user reach the app and see 401 on every API call.
    """
    response: dict = {"email": auth.email}
    if auth.session is not None:
        response["name"] = auth.session.name
        response["shotgrid_user_id"] = auth.session.sg_user_id
    return response


MOCK_THUMBNAILS_DIR = (
    Path(__file__).parent / "dna" / "prodtrack_providers" / "mock_data" / "thumbnails"
)
THUMBNAIL_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp")
THUMBNAIL_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

ATTACHMENT_STORE_DIR = Path(os.getenv("ATTACHMENT_STORE_DIR", "/tmp/dna_attachments"))
ATTACHMENT_STORE_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/attachments", tags=["Attachments"])
async def upload_attachment(
    _: CurrentUserDep,
    file: UploadFile = File(...),
) -> dict:
    """Save an uploaded file and return its attachment ID."""
    attachment_id = str(uuid.uuid4())
    dest_dir = ATTACHMENT_STORE_DIR / attachment_id
    dest_dir.mkdir(parents=True)
    filename = file.filename or "attachment"
    dest_path = dest_dir / filename
    with dest_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"id": attachment_id, "filename": filename}


@app.get(
    "/api/attachments/{attachment_id}",
    tags=["Attachments"],
    summary="Retrieve a staged attachment",
    response_class=FileResponse,
)
async def get_attachment(attachment_id: str, _: CurrentUserDep) -> FileResponse:
    """Return the image file for a staged attachment by ID."""
    attachment_dir = ATTACHMENT_STORE_DIR / attachment_id
    if not attachment_dir.exists():
        raise HTTPException(status_code=404, detail="Attachment not found")
    files = list(attachment_dir.iterdir())
    if not files:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = files[0]
    suffix = path.suffix.lower()
    media_type = THUMBNAIL_MEDIA_TYPES.get(suffix, "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@app.delete("/api/attachments/{attachment_id}", tags=["Attachments"])
async def delete_attachment(attachment_id: str, _: CurrentUserDep) -> dict:
    """Delete a staged attachment by ID."""
    attachment_dir = ATTACHMENT_STORE_DIR / attachment_id
    if not attachment_dir.exists():
        raise HTTPException(status_code=404, detail="Attachment not found")
    shutil.rmtree(attachment_dir)
    return {"deleted": attachment_id}


@app.get(
    "/api/mock-thumbnails/{version_id}",
    tags=["Versions"],
    summary="Serve mock thumbnail image",
    description="Returns a thumbnail image for a version from the mock dataset (when using mock prodtrack provider).",
    response_class=FileResponse,
)
async def get_mock_thumbnail(version_id: int):
    """Serve a thumbnail image from mock_data/thumbnails/ for the given version ID."""
    for ext in THUMBNAIL_EXTENSIONS:
        path = MOCK_THUMBNAILS_DIR / f"{version_id}{ext}"
        if path.is_file():
            media_type = THUMBNAIL_MEDIA_TYPES.get(ext, "image/jpeg")
            return FileResponse(path, media_type=media_type)
    raise HTTPException(status_code=404, detail="Thumbnail not found")


# -----------------------------------------------------------------------------
# WebSocket endpoint
# -----------------------------------------------------------------------------


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time event streaming.

    Clients connect to this endpoint to receive real-time events such as:
    - transcript: Raw Vexa-shaped transcript ticks (flat envelope with
      `speaker`, `confirmed`, `pending`, `playlist_id`, `version_id`, `ts`).
      Consumed by the frontend `TranscriptManager`.
    - bot.status_changed: Bot status updates
    - transcription.completed / transcription.error: Transcription lifecycle events

    Most events use `{"type": "event.type", "payload": {...}}`. The
    `transcript` event is flat — the whole message IS the payload so it can
    be fed to `TranscriptManager.handleMessage()` without reshaping.
    """
    event_publisher = get_event_publisher()
    ws_manager = event_publisher.ws_manager

    await ws_manager.connect(websocket)
    try:
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        await ws_manager.disconnect(websocket)


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
async def get_version(
    version_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> Version:
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
async def get_playlist(
    playlist_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> Playlist:
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
async def get_shot(
    shot_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> Shot:
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
async def get_asset(
    asset_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> Asset:
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
async def get_task(
    task_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> Task:
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
async def get_note(
    note_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> Note:
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
    request: CreateNoteRequest, provider: ProdtrackProviderDep, _: CurrentUserDep
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
    request: FindRequest, provider: ProdtrackProviderDep, _: CurrentUserDep
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
    request: SearchRequest, provider: ProdtrackProviderDep, _: CurrentUserDep
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


@app.get(
    "/version-statuses",
    tags=["Versions"],
    summary="Get valid version statuses",
    description="Get valid status options for versions from the production tracking system.",
    response_model=list[StatusOption],
)
async def get_version_statuses(
    provider: ProdtrackProviderDep,
    project_id: Optional[int] = None,
) -> list[StatusOption]:
    """Get valid status options for versions."""
    try:
        statuses = provider.get_version_statuses(project_id)
        return [StatusOption(**s) for s in statuses]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch(
    "/versions/{version_id}/status",
    tags=["Versions"],
    summary="Update a version's status",
    description="Set the status of a version in the production tracking system.",
    response_model=UpdateVersionStatusResponse,
)
async def update_version_status(
    version_id: int,
    request: UpdateVersionStatusRequest,
    provider: ProdtrackProviderDep,
    storage: StorageProviderDep,
    _: CurrentUserDep,
) -> UpdateVersionStatusResponse:
    """Update the status of a version without publishing a note."""
    try:
        success = provider.update_version_status(version_id, request.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not success:
        raise HTTPException(status_code=502, detail="Failed to update version status")
    if request.playlist_id is not None:
        # Pending draft status intents for this version are fulfilled or
        # obsolete now; clear them without touching note publish state.
        await storage.clear_draft_version_status(request.playlist_id, version_id)
    return UpdateVersionStatusResponse(success=True)


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
async def get_user_by_email(
    user_email: str, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> User:
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
    user_email: str, provider: ProdtrackProviderDep, current_user: CurrentUserDep
) -> list[Project]:
    """Get projects for a user by their email address."""
    if os.getenv("AUTH_PROVIDER", "none") != "none" and not emails_match(
        current_user, user_email
    ):
        raise HTTPException(status_code=403, detail="Access denied.")
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
    project_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> list[Playlist]:
    """Get playlists for a project."""
    try:
        return provider.get_playlists_for_project(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post(
    "/projects/{project_id}/playlists",
    tags=["Playlists"],
    summary="Create a playlist",
    description="Create a new playlist in the production tracking system.",
    response_model=Playlist,
)
async def create_playlist(
    project_id: int,
    request: CreatePlaylistRequest,
    provider: ProdtrackProviderDep,
    _: CurrentUserDep,
) -> Playlist:
    """Create a new playlist in a project."""
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Playlist name is required")
    try:
        return provider.create_playlist(project_id, name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/projects/{project_id}/glossary",
    tags=["Projects"],
    summary="Get a project's glossary",
    description=(
        "Retrieve the production-specific glossary for a project. Returns an "
        "empty glossary when none has been saved yet."
    ),
    response_model=ProjectGlossary,
)
async def get_project_glossary(
    project_id: int,
    provider: StorageProviderDep,
    _: CurrentUserDep,
) -> ProjectGlossary:
    """Get a project's glossary (empty when not yet configured)."""
    from datetime import datetime, timezone

    stored = await provider.get_project_glossary(project_id)
    if stored is None:
        now = datetime.now(timezone.utc)
        return ProjectGlossary(
            _id="",
            project_id=project_id,
            content="",
            updated_at=now,
            created_at=now,
        )
    return stored


@app.put(
    "/projects/{project_id}/glossary",
    tags=["Projects"],
    summary="Create or update a project's glossary",
    description="Save the production-specific glossary for a project.",
    response_model=ProjectGlossary,
)
async def upsert_project_glossary(
    project_id: int,
    data: ProjectGlossaryUpdate,
    provider: StorageProviderDep,
    _: CurrentUserDep,
) -> ProjectGlossary:
    """Create or update a project's glossary."""
    return await provider.upsert_project_glossary(project_id, data)


@app.get(
    "/playlists/{playlist_id}/versions",
    tags=["Versions"],
    summary="Get versions for a playlist",
    description="Retrieve all versions in the specified playlist.",
    response_model=list[Version],
)
async def get_versions_for_playlist(
    playlist_id: int, provider: ProdtrackProviderDep, _: CurrentUserDep
) -> list[Version]:
    """Get versions for a playlist."""
    try:
        return provider.get_versions_for_playlist(playlist_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post(
    "/playlists/{playlist_id}/versions",
    tags=["Playlists"],
    summary="Add a version to a playlist",
    description="Add an existing version to a playlist.",
    response_model=Version,
)
async def add_version_to_playlist(
    playlist_id: int,
    request: AddVersionToPlaylistRequest,
    provider: ProdtrackProviderDep,
    _: CurrentUserDep,
) -> Version:
    """Add an existing version to a playlist."""
    try:
        version = provider.get_entity("version", request.version_id, resolve_links=True)
        provider.add_version_to_playlist(playlist_id, version.id)
        return version
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
    _: CurrentUserDep,
) -> PublishNotesResponse:
    """Publish draft notes to the production tracking system."""
    # 1. Get all draft notes for this playlist
    all_draft_notes = await storage.get_draft_notes_for_playlist(playlist_id)

    # 2. Filter and deduplicate notes
    # Group by (user, version) and keep only the most recently updated note
    from collections import defaultdict

    notes_by_key = defaultdict(list)
    for note in all_draft_notes:
        key = (note.user_email, note.version_id)
        notes_by_key[key].append(note)

    target_keys = {(t.user_email, t.version_id) for t in request.targets}

    notes_to_publish = []
    for key, notes in notes_by_key.items():
        # Sort by updated_at descending and take the most recent one
        most_recent = max(notes, key=lambda n: n.updated_at)

        if (most_recent.user_email, most_recent.version_id) not in target_keys:
            continue

        notes_to_publish.append(most_recent)

    # 3. Publish each note
    published_count = 0
    republished_count = 0
    failed_count = 0
    skipped_count = 0

    def _status_to_apply(note) -> Optional[str]:
        """Version status to apply for this note, honoring the allowlist."""
        if not note.version_status:
            return None
        if (
            request.status_version_ids is not None
            and note.version_id not in request.status_version_ids
        ):
            return None
        return note.version_status

    from datetime import datetime, timezone

    def _upload_attachments(sg_note_id: int, attachment_ids: list[str]) -> None:
        """Upload staged attachment files to a ShotGrid note and clean up local files."""
        for attachment_id in attachment_ids:
            attachment_dir = ATTACHMENT_STORE_DIR / attachment_id
            if not attachment_dir.exists():
                continue
            files = list(attachment_dir.iterdir())
            if not files:
                continue
            file_path = files[0]
            prodtrack.attach_file_to_note(
                note_id=sg_note_id,
                file_path=str(file_path),
                display_name=file_path.name,
            )
            shutil.rmtree(attachment_dir)

    for note in notes_to_publish:
        try:
            status_to_apply = _status_to_apply(note)

            # Skip notes with no meaningful content to publish
            has_body = (note.content and note.content.strip()) or (
                note.subject and note.subject.strip()
            )
            if not has_body and not note.attachment_ids and not status_to_apply:
                skipped_count += 1
                continue

            # Status-only change with no note body: update version status without
            # creating or publishing a note, and do not mark the draft as published.
            if not has_body and not note.attachment_ids and status_to_apply:
                prodtrack.update_version_status(note.version_id, status_to_apply)
                skipped_count += 1
                continue

            if note.published_note_id:
                if note.published and not note.edited and not note.attachment_ids:
                    # Still apply any pending version status change
                    if status_to_apply:
                        prodtrack.update_version_status(
                            note.version_id, status_to_apply
                        )
                    skipped_count += 1
                    continue

                if not note.published or note.edited:
                    success = prodtrack.update_note(
                        note_id=note.published_note_id,
                        content=note.content,
                        subject=note.subject,
                        version_id=note.version_id,
                        version_status=status_to_apply,
                    )
                    if not success:
                        failed_count += 1
                        continue

                if note.attachment_ids:
                    _upload_attachments(note.published_note_id, note.attachment_ids)

                republished_count += 1
                update_data = DraftNoteUpdate(
                    published=True,
                    edited=False,
                    published_at=datetime.now(timezone.utc),
                    attachment_ids=[],
                )
                await storage.upsert_draft_note(
                    user_email=note.user_email,
                    playlist_id=note.playlist_id,
                    version_id=note.version_id,
                    data=update_data,
                )
                continue

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

            # Ensure version's parent entity (Shot/Asset) is included in links
            version = prodtrack.get_entity(
                "version", note.version_id, resolve_links=False
            )
            if version and version.entity:
                entity_link_exists = any(
                    l.id == version.entity.id and l.type == version.entity.type
                    for l in links
                )
                if not entity_link_exists:
                    links.append(version.entity)

            note_id = prodtrack.publish_note(
                version_id=note.version_id,
                content=note.content,
                subject=note.subject,
                to_users=[],  # TODO: Parse to/cc
                cc_users=[],
                links=links,
                author_email=note.user_email,
                version_status=status_to_apply,
            )

            if note.attachment_ids:
                _upload_attachments(note_id, note.attachment_ids)

            # Update draft note as published (clear attachment_ids after upload)
            update_data = DraftNoteUpdate(
                published=True,
                edited=False,
                published_at=datetime.now(timezone.utc),
                published_note_id=note_id,
                attachment_ids=[],
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
        republished_count=republished_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
        total=len(notes_to_publish),
    )


def _transcript_publish_enabled() -> bool:
    return os.getenv("DNA_ENABLE_TRANSCRIPT_PUBLISH", "false").lower() == "true"


@app.post(
    "/playlists/{playlist_id}/publish-transcript",
    tags=["Playlists", "Transcription"],
    summary="Publish a version's captured transcript",
    description=(
        "Push the stored transcript for a version to the production tracking "
        "system as a single custom-entity row. Idempotent via body_hash."
    ),
    response_model=PublishTranscriptResponse,
)
async def publish_transcript(
    playlist_id: int,
    request: PublishTranscriptRequest,
    storage: StorageProviderDep,
    prodtrack: ProdtrackProviderDep,
    current_user: CurrentUserDep,
) -> PublishTranscriptResponse:
    """Publish one version's transcript; skip when body_hash has not changed."""
    if not _transcript_publish_enabled():
        raise HTTPException(status_code=404, detail="Not Found")

    from dna.transcription_publish import build_transcript_payload

    metadata = await storage.get_playlist_metadata(playlist_id)
    if metadata is None or not metadata.meeting_id:
        raise HTTPException(
            status_code=422,
            detail="Playlist has no meeting associated yet",
        )
    if not metadata.platform:
        # Empty platform would be rejected downstream as an opaque SG schema
        # fault; surface a clean 422 instead.
        raise HTTPException(
            status_code=422,
            detail="Playlist metadata has no platform recorded",
        )

    segments = await storage.get_segments_for_version(playlist_id, request.version_id)
    if not segments:
        raise HTTPException(
            status_code=422,
            detail="No transcript segments stored for this version",
        )

    payload = build_transcript_payload(segments)
    if payload.segments_count == 0:
        # Segments existed but all were whitespace-only; refuse rather than
        # create an empty row.
        raise HTTPException(
            status_code=422,
            detail="All stored segments were empty; nothing to publish",
        )

    existing = await storage.get_published_transcript(
        playlist_id, request.version_id, metadata.meeting_id
    )
    if existing and existing.body_hash == payload.body_hash:
        return PublishTranscriptResponse(
            transcript_entity_id=existing.entity_id,
            outcome="skipped",
            skipped_reason="no_changes_since_last_publish",
            segments_count=payload.segments_count,
        )

    try:
        version = prodtrack.get_entity(
            "version", request.version_id, resolve_links=False
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Version.project is a dict {type, id, name}, not an object — don't try
    # project_ref.id.
    project_ref = getattr(version, "project", None)
    project_id = project_ref.get("id") if isinstance(project_ref, dict) else None
    if project_id is None:
        raise HTTPException(
            status_code=404,
            detail="Version has no project associated",
        )

    try:
        if existing:
            # Take entity_type from bookkeeping, not env — sites can migrate
            # the slot after the row is created, and the update must still
            # target the original entity.
            updated = prodtrack.update_transcript(
                entity_type=existing.entity_type,
                entity_id=existing.entity_id,
                body=payload.body,
                meeting_date=payload.meeting_date,
            )
            if not updated:
                # Raise (and skip the bookkeeping upsert below) so the next
                # call doesn't see a matching body_hash and incorrectly skip.
                raise HTTPException(
                    status_code=502,
                    detail="Failed to update transcript on the tracking system",
                )
            entity_id = existing.entity_id
            outcome = "updated"
        else:
            entity_id = prodtrack.publish_transcript(
                project_id=project_id,
                playlist_id=playlist_id,
                version_id=request.version_id,
                meeting_id=metadata.meeting_id,
                meeting_date=payload.meeting_date,
                platform=metadata.platform,
                body=payload.body,
            )
            outcome = "created"
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    entity_type = os.getenv("SHOTGRID_TRANSCRIPT_ENTITY", "CustomEntity01")
    try:
        await storage.upsert_published_transcript(
            PublishedTranscriptUpdate(
                playlist_id=playlist_id,
                version_id=request.version_id,
                meeting_id=metadata.meeting_id,
                entity_type=entity_type,
                entity_id=entity_id,
                author_email=current_user,
                body_hash=payload.body_hash,
                segments_count=payload.segments_count,
            )
        )
    except Exception as e:
        # SG row exists but local bookkeeping didn't make it. The next call
        # with the same body would see existing=None and create a duplicate
        # SG row. Surface entity_id so an operator can reconcile manually,
        # and signal to the client that blind retry is unsafe.
        logger = logging.getLogger(__name__)
        logger.exception(
            "Transcript %s created on tracking system id=%s but local "
            "bookkeeping failed. Next publish will create a duplicate unless "
            "the SG row is removed or the bookkeeping row is written manually.",
            outcome,
            entity_id,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"Transcript row {entity_id} was {outcome} on the tracking "
                f"system but local bookkeeping failed ({e.__class__.__name__}). "
                f"Do not retry blindly; reconcile the row manually."
            ),
        )

    return PublishTranscriptResponse(
        transcript_entity_id=entity_id,
        outcome=outcome,
        segments_count=payload.segments_count,
    )


# -----------------------------------------------------------------------------
# Draft Notes endpoints
# -----------------------------------------------------------------------------


async def _sync_published_notes(
    playlist_id: int,
    prodtrack: ProdtrackProviderBase,
    storage: StorageProviderBase,
):
    """Sync published notes from ShotGrid to local storage.

    Fetches notes via get_versions_for_playlist (which now populates notes).
    If multiple notes exist for the same version and author, only the most
    recent one is synced.
    """
    try:
        # 1. Get all versions for the playlist (now includes notes)
        versions = prodtrack.get_versions_for_playlist(playlist_id)
        if not versions:
            return

        # 2. Group by (version_id, author_email) and find latest
        # Map: (version_id, author_email) -> Note
        latest_notes: dict[tuple[int, str], Note] = {}

        for version in versions:
            if not version.notes:
                continue

            for note in version.notes:
                if not note.author or not note.author.email:
                    continue

                key = (version.id, note.author.email)
                existing = latest_notes.get(key)

                # If no existing note for this key, or current note is newer
                if not existing or note.id > existing.id:
                    latest_notes[key] = note

        # 3. Upsert selected notes to storage
        from datetime import datetime, timezone

        for (vid, email), note in latest_notes.items():
            update_data = DraftNoteUpdate(
                content=note.content or "",
                subject=note.subject or "",
                published=True,
                edited=False,
                published_at=datetime.now(timezone.utc),
                published_note_id=note.id,
            )

            await storage.upsert_published_note(
                user_email=email,
                playlist_id=playlist_id,
                version_id=vid,
                data=update_data,
            )

    except Exception as e:
        print(f"Error syncing published notes: {e}")


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
    prodtrack: ProdtrackProviderDep,
    _: CurrentUserDep,
) -> list[DraftNote]:
    """Get all draft notes for a playlist."""
    # Sync published notes first
    await _sync_published_notes(playlist_id, prodtrack, provider)
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
) -> bool:
    """Delete playlist metadata."""
    deleted = await provider.delete_playlist_metadata(playlist_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Playlist metadata not found")
    return True


# -----------------------------------------------------------------------------
# User Settings endpoints
# -----------------------------------------------------------------------------


def _user_settings_to_response(settings: UserSettings) -> UserSettingsResponse:
    """Attach configured default note prompt for API clients (e.g. settings UI)."""
    return UserSettingsResponse(
        _id=settings.id,
        user_email=settings.user_email,
        note_prompt=settings.note_prompt,
        preferred_model=settings.preferred_model,
        default_note_prompt=get_default_note_prompt(),
        regenerate_on_version_change=settings.regenerate_on_version_change,
        regenerate_on_transcript_update=settings.regenerate_on_transcript_update,
        sync_prodtrack_tab_on_version_change=(
            settings.sync_prodtrack_tab_on_version_change
        ),
        prodtrack_page_type=settings.prodtrack_page_type,
        updated_at=settings.updated_at,
        created_at=settings.created_at,
    )


def _empty_user_settings_response(user_email: str) -> UserSettingsResponse:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    default = get_default_note_prompt()
    return UserSettingsResponse(
        _id="",
        user_email=user_email,
        note_prompt="",
        preferred_model="",
        default_note_prompt=default,
        regenerate_on_version_change=False,
        regenerate_on_transcript_update=False,
        sync_prodtrack_tab_on_version_change=True,
        updated_at=now,
        created_at=now,
    )


@app.get(
    "/users/{user_email}/settings",
    tags=["User Settings"],
    summary="Get user settings",
    description=(
        "Retrieve settings for a user. When the user has no saved document, "
        "returns default toggles and the configured default note prompt in "
        "`default_note_prompt`; `note_prompt` is empty until the user saves a custom prompt."
    ),
    response_model=UserSettingsResponse,
)
async def get_user_settings(
    user_email: str,
    provider: StorageProviderDep,
    current_user: CurrentUserDep,
) -> UserSettingsResponse:
    """Get user settings."""
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    stored = await provider.get_user_settings(user_email)
    if stored is None:
        return _empty_user_settings_response(user_email)
    return _user_settings_to_response(stored)


@app.put(
    "/users/{user_email}/settings",
    tags=["User Settings"],
    summary="Create or update user settings",
    description="Create or update settings for a user.",
    response_model=UserSettingsResponse,
)
async def upsert_user_settings(
    user_email: str,
    data: UserSettingsUpdate,
    provider: StorageProviderDep,
    current_user: CurrentUserDep,
) -> UserSettingsResponse:
    """Create or update user settings."""
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    updated = await provider.upsert_user_settings(user_email, data)
    return _user_settings_to_response(updated)


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
    current_user: CurrentUserDep,
) -> bool:
    """Delete user settings."""
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    deleted = await provider.delete_user_settings(user_email)
    if not deleted:
        raise HTTPException(status_code=404, detail="User settings not found")
    return True


@app.get(
    "/users/{user_email}/qc-checks",
    tags=["Note QC"],
    summary="List note QC checks",
    response_model=list[NoteQCCheck],
)
async def list_qc_checks(
    user_email: str,
    storage_provider: StorageProviderDep,
    current_user: CurrentUserDep,
) -> list[NoteQCCheck]:
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return await storage_provider.get_qc_checks(user_email)


@app.post(
    "/users/{user_email}/qc-checks",
    tags=["Note QC"],
    summary="Create a note QC check",
    response_model=NoteQCCheck,
    status_code=201,
)
async def create_qc_check(
    user_email: str,
    data: NoteQCCheckCreate,
    storage_provider: StorageProviderDep,
    current_user: CurrentUserDep,
) -> NoteQCCheck:
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return await storage_provider.create_qc_check(user_email, data)


@app.put(
    "/users/{user_email}/qc-checks/{check_id}",
    tags=["Note QC"],
    summary="Update a note QC check",
    response_model=NoteQCCheck,
)
async def update_qc_check(
    user_email: str,
    check_id: str,
    data: NoteQCCheckUpdate,
    storage_provider: StorageProviderDep,
    current_user: CurrentUserDep,
) -> NoteQCCheck:
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    updated = await storage_provider.update_qc_check(user_email, check_id, data)
    if updated is None:
        raise HTTPException(status_code=404, detail="QC check not found")
    return updated


@app.delete(
    "/users/{user_email}/qc-checks/{check_id}",
    tags=["Note QC"],
    summary="Delete a note QC check",
    status_code=204,
)
async def delete_qc_check(
    user_email: str,
    check_id: str,
    storage_provider: StorageProviderDep,
    current_user: CurrentUserDep,
) -> None:
    if not emails_match(user_email, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    deleted = await storage_provider.delete_qc_check(user_email, check_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="QC check not found")


@app.post(
    "/playlists/{playlist_id}/versions/{version_id}/run-qc-checks",
    tags=["Note QC"],
    summary="Run note QC checks for a draft",
    response_model=RunQCChecksResponse,
)
async def run_qc_checks(
    playlist_id: int,
    version_id: int,
    body: RunQCChecksRequest,
    storage_provider: StorageProviderDep,
    prodtrack_provider: ProdtrackProviderDep,
    llm_provider: LLMProviderDep,
    current_user: CurrentUserDep,
) -> RunQCChecksResponse:
    # Authenticated callers may QC any draft in the playlist (same as publish-notes).
    # body.user_email identifies the draft owner, not the caller.
    draft = await storage_provider.get_draft_note(
        body.user_email, playlist_id, version_id
    )
    if draft is None:
        return RunQCChecksResponse(results=[])
    checks = await storage_provider.get_qc_checks(body.user_email)
    segments = await storage_provider.get_segments_for_version(playlist_id, version_id)
    transcript = TranscriptionProviderBase.build_transcript_text(segments)
    version = cast(
        Version,
        prodtrack_provider.get_entity("version", version_id, resolve_links=False),
    )
    results = await run_qc_checks_for_draft(
        checks=checks,
        draft=draft,
        transcript_text=transcript,
        version=version,
        prodtrack_provider=prodtrack_provider,
        llm_provider=llm_provider,
    )
    return RunQCChecksResponse(results=results)


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
    transcription_service: TranscriptionServiceDep,
    _: CurrentUserDep,
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
                transcription_paused=False,
                clear_resumed_at=True,
            ),
        )

        await transcription_service.subscribe_to_meeting(
            platform=request.platform.value,
            meeting_id=request.meeting_id,
            playlist_id=request.playlist_id,
        )

        event_publisher = get_event_publisher()
        await event_publisher.publish(
            EventType.BOT_STATUS_CHANGED,
            {
                "platform": request.platform.value,
                "meeting_id": request.meeting_id,
                "playlist_id": request.playlist_id,
                "status": "joining",
                "vexa_meeting_id": session.vexa_meeting_id,
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
    _: CurrentUserDep,
) -> bool:
    """Stop a transcription bot."""
    try:
        event_publisher = get_event_publisher()
        await event_publisher.publish(
            EventType.BOT_STATUS_CHANGED,
            {
                "platform": platform.value,
                "meeting_id": meeting_id,
                "status": "stopping",
            },
        )

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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
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
    _: CurrentUserDep,
) -> list[StoredSegment]:
    """Get all transcript segments for a version."""
    try:
        return await storage_provider.get_segments_for_version(playlist_id, version_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -----------------------------------------------------------------------------
# LLM endpoints
# -----------------------------------------------------------------------------


@app.get(
    "/models",
    tags=["LLM"],
    summary="Get available LLM models",
    description="Returns the list of models available from the active LLM provider.",
)
async def get_available_models(
    llm_provider: LLMProviderDep,
    _: CurrentUserDep,
) -> dict:
    """Get available models from the active LLM provider."""
    return await llm_provider.get_available_models()


def _build_full_prompt(
    prompt: str,
    transcript: str,
    context: str,
    existing_notes: str,
    additional_instructions: str | None = None,
    glossary_global: str = "",
    glossary_project: str = "",
) -> str:
    """Build the full prompt with template values substituted."""
    result = prompt
    result = result.replace("{{ transcript }}", transcript)
    result = result.replace("{{transcript}}", transcript)
    result = result.replace("{{ context }}", context)
    result = result.replace("{{context}}", context)
    result = result.replace("{{ notes }}", existing_notes)
    result = result.replace("{{notes}}", existing_notes)
    result = inject_glossaries(result, glossary_global, glossary_project)
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
    _: CurrentUserDep,
) -> GenerateNoteResponse:
    """Generate an AI-powered note suggestion."""
    try:
        user_settings = await storage_provider.get_user_settings(request.user_email)
        prompt = (
            user_settings.note_prompt
            if user_settings and user_settings.note_prompt
            else get_default_note_prompt()
        )
        # Global glossary is the shared, repo-sourced file (read-only at runtime).
        glossary_global = get_default_glossary_global()

        segments = await storage_provider.get_segments_for_version(
            request.playlist_id, request.version_id
        )
        transcript = TranscriptionProviderBase.build_transcript_text(segments)

        version = cast(
            Version,
            prodtrack_provider.get_entity(
                "version", request.version_id, resolve_links=False
            ),
        )
        context = ProdtrackProviderBase.build_version_context(version)

        # Project glossary is production-specific: look it up by the version's
        # ShotGrid project id. Version.project is a dict {type, id, name}.
        project_ref = getattr(version, "project", None)
        project_id = project_ref.get("id") if isinstance(project_ref, dict) else None
        project_glossary = (
            await storage_provider.get_project_glossary(project_id)
            if project_id is not None
            else None
        )
        glossary_project = project_glossary.content if project_glossary else ""

        draft_note = await storage_provider.get_draft_note(
            request.user_email, request.playlist_id, request.version_id
        )
        existing_notes = draft_note.content if draft_note else ""

        full_prompt = _build_full_prompt(
            prompt,
            transcript,
            context,
            existing_notes,
            request.additional_instructions,
            glossary_global,
            glossary_project,
        )

        model_override = request.model
        if not model_override and user_settings:
            model_override = user_settings.preferred_model or None

        suggestion = await llm_provider.generate_note(
            prompt=prompt,
            transcript=transcript,
            context=context,
            existing_notes=existing_notes,
            additional_instructions=request.additional_instructions,
            model=model_override,
            glossary_global=glossary_global,
            glossary_project=glossary_project,
        )

        return GenerateNoteResponse(
            suggestion=suggestion,
            prompt=full_prompt,
            context=context,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
