"""CORS configuration for FastAPI / Starlette CORSMiddleware."""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def get_cors_middleware_kwargs() -> dict[str, Any]:
    """Build kwargs for :class:`starlette.middleware.cors.CORSMiddleware`.

    Do not set ``allow_origins=[\"*\"]``. Starlette then sends
    ``Access-Control-Allow-Origin: *``, which browsers reject for cross-origin
    requests that include the ``Authorization`` header; the origin must be
    echoed. Use ``allow_origin_regex`` (e.g. ``.*``) so allowed origins are
    mirrored instead of using a wildcard response header.

    See Starlette ``CORSMiddleware.simple_response`` (cookie / non-wildcard paths).

    ShotGrid auth (``AUTH_PROVIDER=shotgrid``) keeps its refresh token in an
    httpOnly cookie, which browsers only send and store on cross-origin requests
    when ``allow_credentials`` is on. Credentials are enabled for that provider
    only, and only with an explicit origin list: combined with a wildcard they
    would let any website make logged-in requests on a user's behalf.
    """
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
    cloud_run = bool(os.getenv("K_SERVICE") or os.getenv("K_REVISION"))

    allow_origin_regex: str | None = None

    if raw == "*":
        allow_origins: list[str] = []
        allow_credentials = False
        allow_origin_regex = r".*"
    elif raw:
        allow_origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
        allow_credentials = _uses_cookie_auth()
    elif cloud_run:
        allow_origins = []
        allow_credentials = False
        allow_origin_regex = r".*"
    else:
        allow_origins = ["http://localhost:5173", "http://localhost:3000"]
        allow_credentials = True

    if _uses_cookie_auth() and not allow_origins:
        logger.error(
            "AUTH_PROVIDER=shotgrid needs CORS_ALLOWED_ORIGINS set to an explicit "
            "list of frontend origins. With a wildcard or no list, credentials stay "
            "disabled, the refresh cookie is never sent, and users are signed out "
            "when their access token expires."
        )

    return {
        "allow_origins": allow_origins,
        "allow_credentials": allow_credentials,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "allow_origin_regex": allow_origin_regex,
    }


def _uses_cookie_auth() -> bool:
    """True when the configured auth provider relies on a credentialed cookie."""
    return os.getenv("AUTH_PROVIDER", "none").strip().lower() == "shotgrid"
