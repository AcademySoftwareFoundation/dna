"""CORS configuration for FastAPI / Starlette CORSMiddleware."""

import os
from typing import Any


def get_cors_middleware_kwargs() -> dict[str, Any]:
    """Build kwargs for :class:`starlette.middleware.cors.CORSMiddleware`.

    Do not set ``allow_origins=[\"*\"]``. Starlette then sends
    ``Access-Control-Allow-Origin: *``, which browsers reject for cross-origin
    requests that include the ``Authorization`` header; the origin must be
    echoed. Use ``allow_origin_regex`` (e.g. ``.*``) so allowed origins are
    mirrored instead of using a wildcard response header.

    See Starlette ``CORSMiddleware.simple_response`` (cookie / non-wildcard paths).
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
        allow_credentials = False
    elif cloud_run:
        allow_origins = []
        allow_credentials = False
        allow_origin_regex = r".*"
    else:
        allow_origins = ["http://localhost:5173", "http://localhost:3000"]
        allow_credentials = True

    return {
        "allow_origins": allow_origins,
        "allow_credentials": allow_credentials,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "allow_origin_regex": allow_origin_regex,
    }
