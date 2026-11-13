"""HTTP auth dependencies and `/auth/*` routes."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from dna.auth.email import emails_match
from dna.auth_providers.auth_provider_base import (
    AuthPrincipal,
    AuthProviderBase,
    AuthSession,
    AuthUpstreamError,
    IdentityMismatchError,
    get_auth_provider,
)
from dna.models import (
    AuthLoginRequest,
    AuthPrincipalResponse,
    AuthRefreshRequest,
    AuthSessionResponse,
)
from dna.openapi_schema import error_responses

security = HTTPBearer(auto_error=False)

router = APIRouter(tags=["Health"])


@lru_cache
def get_auth_provider_cached() -> AuthProviderBase:
    """Get or create the auth provider singleton."""
    return get_auth_provider()


AuthProviderDep = Annotated[AuthProviderBase, Depends(get_auth_provider_cached)]


def _principal_response(principal: AuthPrincipal) -> AuthPrincipalResponse:
    return AuthPrincipalResponse(
        email=principal.email,
        login=principal.login,
        provider=principal.provider,
        name=principal.name,
    )


def _session_response(session: AuthSession) -> AuthSessionResponse:
    return AuthSessionResponse(
        token=session.token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        principal=_principal_response(session.principal),
    )


async def get_current_user(
    request: Request,
    auth_provider: AuthProviderDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AuthPrincipal:
    """Validate the auth token and identity header; return the principal.

    When AUTH_PROVIDER=none and no bearer token is present, returns an
    anonymous principal for local development. When a bearer token is present
    under none, identity is enforced only if X-User-Id is also present.
    """
    auth_provider_type = os.getenv("AUTH_PROVIDER", "none").lower()
    x_user_id = request.headers.get("x-user-id")

    if auth_provider_type == "none" and (
        credentials is None or not credentials.credentials
    ):
        return AuthPrincipal(
            email="anonymous@localhost",
            login="anonymous",
            provider="none",
        )

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        principal = auth_provider.validate_token(credentials.credentials)
    except AuthUpstreamError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(
            status_code=401,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    if not principal.email:
        raise HTTPException(
            status_code=401,
            detail="Missing email claim in authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    enforce_identity = auth_provider_type != "none" or bool(x_user_id)
    if enforce_identity:
        try:
            auth_provider.assert_identity(principal, x_user_id)
        except IdentityMismatchError as e:
            raise HTTPException(status_code=403, detail=str(e)) from e

    return principal


CurrentUserDep = Annotated[AuthPrincipal, Depends(get_current_user)]


async def require_self_user(
    user_email: str,
    current_user: CurrentUserDep,
) -> AuthPrincipal:
    """Require that the path ``user_email`` matches the authenticated caller."""
    if not emails_match(user_email, current_user.email):
        raise HTTPException(status_code=403, detail="Forbidden")
    return current_user


SelfUserDep = Annotated[AuthPrincipal, Depends(require_self_user)]


def authenticate_ws_token(token: Optional[str]) -> Optional[str]:
    """Validate a token for a WebSocket connection and return the user email.

    Mirrors ``get_current_user`` but for WebSockets, which cannot use the
    HTTPBearer/Depends flow or identity headers. Returns ``None`` when
    authentication fails.
    """
    auth_provider = get_auth_provider_cached()
    auth_provider_type = os.getenv("AUTH_PROVIDER", "none").lower()

    if auth_provider_type == "none":
        if token:
            return auth_provider.get_user_email(token)
        return "anonymous@localhost"

    if not token:
        return None

    try:
        principal = auth_provider.validate_token(token)
    except (AuthUpstreamError, ValueError):
        return None

    if isinstance(principal, AuthPrincipal):
        return principal.email or None
    if isinstance(principal, dict):
        return principal.get("email")
    email = getattr(principal, "get", lambda *_: None)("email")
    return email if isinstance(email, str) else None


@router.post(
    "/auth/login",
    summary="Authenticate with the configured auth provider",
    description=(
        "Exchange username and password for an access token. Used by password "
        "providers such as ShotGrid. Nothing is stored server-side."
    ),
    response_model=AuthSessionResponse,
    responses=error_responses(401, 501, 503),
)
async def auth_login(
    body: AuthLoginRequest,
    auth_provider: AuthProviderDep,
) -> AuthSessionResponse:
    """Login via the configured auth provider."""
    try:
        session = auth_provider.authenticate(
            body.username, body.password, body.auth_token
        )
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except AuthUpstreamError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    return _session_response(session)


@router.post(
    "/auth/refresh",
    summary="Refresh an access token",
    description=(
        "Exchange a refresh token for a new access token. Used by providers "
        "such as ShotGrid that issue short-lived access tokens."
    ),
    response_model=AuthSessionResponse,
    responses=error_responses(401, 501, 503),
)
async def auth_refresh(
    body: AuthRefreshRequest,
    auth_provider: AuthProviderDep,
) -> AuthSessionResponse:
    """Refresh via the configured auth provider."""
    try:
        session = auth_provider.refresh(body.refresh_token)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except AuthUpstreamError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    return _session_response(session)


@router.get(
    "/auth/me",
    summary="Return the authenticated principal",
    response_model=AuthPrincipalResponse,
    responses=error_responses(401, 403, 503),
)
async def auth_me(current_user: CurrentUserDep) -> AuthPrincipalResponse:
    """Return the principal derived from the bearer token and identity header."""
    return _principal_response(current_user)
