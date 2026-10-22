"""OpenAPI document customizations.

FastAPI builds the OpenAPI document from the routes. This module layers on the
parts that are easier to state once, centrally, than on every route:

- ``x-tagGroups`` so ReDoc and the docs site can show which endpoints proxy
  the production tracking provider and which are DNA's own data.
- Descriptions for the opaque ID path parameters shared by many routes.
- A uniform 401 response on every operation that requires bearer auth.
- Shared ``responses=`` fragments for the error statuses routes raise.

``install_openapi_extras(app)`` wraps ``app.openapi`` to apply these; the
tests in ``backend/tests/test_openapi_spec.py`` keep them honest.
"""

from typing import Any

from fastapi import FastAPI

from dna.models.errors import ErrorResponse

# Which tags proxy the tracking provider vs. live in DNA's own storage. Every
# tag declared in main.tags_metadata must appear in exactly one group.
TAG_GROUPS: list[dict[str, Any]] = [
    {
        "name": "Production Tracking",
        "tags": [
            "Projects",
            "Playlists",
            "Versions",
            "Shots",
            "Assets",
            "Tasks",
            "Notes",
            "Users",
            "Entities",
        ],
    },
    {
        "name": "DNA",
        "tags": [
            "Draft Notes",
            "Publishing",
            "Playlist Metadata",
            "Project Glossary",
            "Transcription",
            "Note QC",
            "User Settings",
            "Attachments",
            "LLM",
            "Health",
        ],
    },
]

_OPAQUE_ID = (
    "{what} ID as issued by the production tracking provider. Opaque string; "
    "DNA passes it through without interpreting it."
)

# Applied to any path/query parameter of this name that has no description.
PARAM_DESCRIPTIONS: dict[str, str] = {
    "project_id": _OPAQUE_ID.format(what="Project"),
    "playlist_id": _OPAQUE_ID.format(what="Playlist"),
    "version_id": _OPAQUE_ID.format(what="Version")
    + " Draft-note routes also accept `-1`, the playlist-level scratch note.",
    "shot_id": _OPAQUE_ID.format(what="Shot"),
    "asset_id": _OPAQUE_ID.format(what="Asset"),
    "task_id": _OPAQUE_ID.format(what="Task"),
    "note_id": _OPAQUE_ID.format(what="Note"),
    "user_email": (
        "Email address of a user as recorded in the production tracking "
        "provider. On `/users/{user_email}/...` routes it must match the "
        "authenticated caller (403 otherwise); elsewhere it names the owner "
        "of the data being read or written."
    ),
    "attachment_id": "Attachment ID (UUID) returned by `POST /api/attachments`.",
    "check_id": "QC check ID returned when the check was created.",
    "platform": "Meeting platform the bot joined.",
    "meeting_id": (
        "Native meeting ID for the platform, e.g. the Google Meet code "
        "`abc-defg-hij` or the Zoom meeting number."
    ),
}

_ERROR_DESCRIPTIONS: dict[int, str] = {
    400: "Rejected by the production tracking or transcription provider",
    401: "Missing or invalid bearer token",
    403: "Authenticated user does not match the user in the path",
    404: "Not found",
    422: "Request is well-formed but cannot be fulfilled in the current state",
    500: "Tracking system was updated but DNA bookkeeping failed; do not retry blindly",
    501: "Configured production tracking provider does not support this operation",
    502: "Production tracking provider rejected the update",
}

_UNAUTHORIZED_RESPONSE: dict[str, Any] = {
    "description": _ERROR_DESCRIPTIONS[401],
    "content": {
        "application/json": {
            "schema": {"$ref": "#/components/schemas/ErrorResponse"},
        }
    },
}


def error_responses(*codes: int) -> dict[int, dict[str, Any]]:
    """``responses=`` fragment documenting the given error statuses.

    FastAPI adds 422 for request validation on its own; pass 422 here only
    when the handler raises it for a state problem, which overrides the
    generic validation wording.
    """
    return {
        code: {"model": ErrorResponse, "description": _ERROR_DESCRIPTIONS[code]}
        for code in codes
    }


def _describe_parameters(schema: dict[str, Any]) -> None:
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            for param in operation.get("parameters", []):
                if "description" not in param:
                    description = PARAM_DESCRIPTIONS.get(param.get("name", ""))
                    if description:
                        param["description"] = description


def _add_unauthorized_responses(schema: dict[str, Any]) -> None:
    schemas = schema.setdefault("components", {}).setdefault("schemas", {})
    schemas.setdefault("ErrorResponse", ErrorResponse.model_json_schema())
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            if isinstance(operation, dict) and operation.get("security"):
                operation.setdefault("responses", {}).setdefault(
                    "401", _UNAUTHORIZED_RESPONSE
                )


def install_openapi_extras(app: FastAPI) -> None:
    """Wrap ``app.openapi`` so the generated document includes the extras."""
    build_schema = app.openapi

    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = build_schema()
        schema["x-tagGroups"] = TAG_GROUPS
        _describe_parameters(schema)
        _add_unauthorized_responses(schema)
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]
