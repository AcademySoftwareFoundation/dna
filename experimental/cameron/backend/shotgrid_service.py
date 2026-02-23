import argparse
import os
import sys
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from shotgun_api3 import Shotgun

load_dotenv()

# --- Configuration ---
# Runtime configuration that can be updated via API
_runtime_config = {
    "SHOTGRID_URL": os.environ.get("SHOTGRID_URL"),
    "SCRIPT_NAME": os.environ.get("SHOTGRID_SCRIPT_NAME"),
    "API_KEY": os.environ.get("SHOTGRID_API_KEY"),
    "SHOTGRID_VERSION_FIELD": os.environ.get("SHOTGRID_VERSION_FIELD", "code"),
    "SHOTGRID_SHOT_FIELD": os.environ.get("SHOTGRID_SHOT_FIELD", "entity"),
}


# Helper functions to get current configuration
def get_shotgrid_url():
    return _runtime_config.get("SHOTGRID_URL")


def get_script_name():
    return _runtime_config.get("SCRIPT_NAME")


def get_api_key():
    return _runtime_config.get("API_KEY")


def get_version_field():
    return _runtime_config.get("SHOTGRID_VERSION_FIELD", "code")


def get_shot_field():
    return _runtime_config.get("SHOTGRID_SHOT_FIELD", "entity")


# For backward compatibility
SHOTGRID_URL = get_shotgrid_url()
SCRIPT_NAME = get_script_name()
API_KEY = get_api_key()
SHOTGRID_VERSION_FIELD = get_version_field()
SHOTGRID_SHOT_FIELD = get_shot_field()


def get_project_by_code(project_code):
    """Fetch a single project from ShotGrid by code."""
    sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())
    filters = [["code", "is", project_code]]
    fields = ["id", "code", "name", "sg_status", "created_at"]
    project = sg.find_one("Project", filters, fields)
    return project


def get_latest_playlists_for_project(project_id, limit=20):
    """Fetch the latest playlists for a given project id."""
    sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())
    filters = [["project", "is", {"type": "Project", "id": project_id}]]
    fields = ["id", "code", "created_at", "updated_at"]
    playlists = sg.find(
        "Playlist",
        filters,
        fields,
        order=[{"field_name": "created_at", "direction": "desc"}],
        limit=limit,
    )
    return playlists


def get_active_projects():
    """Fetch all active projects from ShotGrid (sg_status == 'Active'), sorted by code."""
    sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())

    filters = [["sg_status", "is", "Active"]]
    fields = ["id", "code", "created_at", "sg_type"]
    projects = sg.find(
        "Project", filters, fields, order=[{"field_name": "code", "direction": "asc"}]
    )
    return projects


def extract_shot_name(shot_field):
    """
    Extract shot name from a field that could be a link (dict) or string.
    For link fields (like 'entity'), extract the name or code from the dict.
    """
    if isinstance(shot_field, dict):
        # It's a link field, extract the name or code
        return shot_field.get("name") or shot_field.get("code", "Unknown")
    else:
        # It's a string field
        return shot_field or "Unknown"


def get_playlist_shot_names(playlist_id):
    """Fetch the list of shot/version data from a playlist, including ShotGrid version IDs.

    Returns a list of dicts with:
    - id: ShotGrid version ID (integer)
    - name: Display name (just the version name)
    """
    sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())
    fields = ["versions"]
    playlist = sg.find_one("Playlist", [["id", "is", playlist_id]], fields)
    if not playlist or not playlist.get("versions"):
        return []
    version_ids = [v["id"] for v in playlist["versions"] if v.get("id")]
    if not version_ids:
        return []
    version_fields = ["id", SHOTGRID_VERSION_FIELD, SHOTGRID_SHOT_FIELD]
    versions = sg.find("Version", [["id", "in", version_ids]], version_fields)

    version_data = []
    for v in versions:
        version_name = v.get(SHOTGRID_VERSION_FIELD, "")
        version_id = v.get("id")

        if version_name and version_id:
            version_data.append({"id": version_id, "name": version_name})

    return version_data


def get_version_statuses(project_id=None):
    """
    Fetch available version statuses from ShotGrid with their display names.
    Always returns all statuses available in the schema (regardless of project).
    Returns a dict mapping status codes to display names.
    """
    try:
        sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())

        # Get the schema to get all available statuses for the Version entity
        schema = sg.schema_field_read("Version", "sg_status_list")
        status_display_names = {}

        print(f"DEBUG: Raw schema response keys: {schema.keys() if schema else 'None'}")

        if schema:
            # The response structure is: {'sg_status_list': {'property_name': {'editable': bool, 'value': ...}}}
            # We need to look for 'valid_values' or 'display_values' property
            field_props = schema.get("sg_status_list", {})
            print(
                f"DEBUG: field_props keys: {field_props.keys() if isinstance(field_props, dict) else 'not a dict'}"
            )

            # Try to find valid_values property
            if "properties" in field_props:
                props = field_props["properties"]
                print(
                    f"DEBUG: Properties found: {props.keys() if isinstance(props, dict) else 'not a dict'}"
                )

                if "valid_values" in props:
                    valid_values_prop = props["valid_values"]
                    print(f"DEBUG: valid_values property: {valid_values_prop}")
                    if (
                        isinstance(valid_values_prop, dict)
                        and "value" in valid_values_prop
                    ):
                        status_display_names = valid_values_prop["value"]
                elif "display_values" in props:
                    display_values_prop = props["display_values"]
                    print(f"DEBUG: display_values property: {display_values_prop}")
                    if (
                        isinstance(display_values_prop, dict)
                        and "value" in display_values_prop
                    ):
                        status_display_names = display_values_prop["value"]

            print(f"DEBUG: Final status_display_names: {status_display_names}")

        # Return all available statuses from schema
        return status_display_names
    except Exception as e:
        print(f"ERROR in get_version_statuses: {str(e)}")
        import traceback

        traceback.print_exc()
        raise


def get_playlist_versions_with_statuses(playlist_id):
    """Fetch version details including statuses from a playlist.

    Returns a list of dicts with:
    - id: ShotGrid version ID (integer)
    - name: Display name (just the version name, not shot/version format)
    - status: Version status code
    """
    sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())
    fields = ["versions"]
    playlist = sg.find_one("Playlist", [["id", "is", playlist_id]], fields)
    if not playlist or not playlist.get("versions"):
        return []
    version_ids = [v["id"] for v in playlist["versions"] if v.get("id")]
    if not version_ids:
        return []
    version_fields = [
        "id",
        SHOTGRID_VERSION_FIELD,
        SHOTGRID_SHOT_FIELD,
        "sg_status_list",
    ]
    versions = sg.find("Version", [["id", "in", version_ids]], version_fields)

    version_data = []
    for v in versions:
        version_name = v.get(SHOTGRID_VERSION_FIELD, "")
        version_id = v.get("id")
        status = v.get("sg_status_list", "")

        if version_name and version_id:
            version_info = {"id": version_id, "name": version_name, "status": status}
            version_data.append(version_info)

    return version_data


def validate_shot_version_input(input_value, project_id=None):
    """
    Validate shot/version input and return the proper shot/version format.

    Args:
        input_value (str): User input - could be a version number or shot/asset name
        project_id (int, optional): Project ID to limit search scope

    Returns:
        dict: {
            "success": bool,
            "shot_version": str or None,  # Formatted shot/version string
            "message": str,              # Error message or success info
            "type": str                  # "version" or "shot" indicating what was matched
        }
    """
    if not input_value or not input_value.strip():
        return {
            "success": False,
            "shot_version": None,
            "message": "Input value cannot be empty",
            "type": None,
        }

    input_value = input_value.strip()
    sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())

    # Check if input is a number (version)
    if input_value.isdigit():
        # Search for version by version number using the custom version field
        # Convert to integer since ShotGrid expects integer for this field
        version_number = int(input_value)
        filters = [[SHOTGRID_VERSION_FIELD, "is", version_number]]
        if project_id:
            filters.append(["project", "is", {"type": "Project", "id": project_id}])

        fields = ["id", "code", SHOTGRID_SHOT_FIELD, SHOTGRID_VERSION_FIELD]
        version = sg.find_one("Version", filters, fields)

        if version:
            shot_name = extract_shot_name(version.get(SHOTGRID_SHOT_FIELD))
            version_name = version.get(SHOTGRID_VERSION_FIELD, input_value)
            shot_version = f"{shot_name}/{version_name}"

            return {
                "success": True,
                "shot_version": shot_version,
                "message": f"Found version {input_value}",
                "type": "version",
            }
        else:
            return {
                "success": False,
                "shot_version": None,
                "message": f"Version {input_value} not found",
                "type": "version",
            }

    else:
        # Search for shot/asset by name
        filters = [["code", "is", input_value]]
        if project_id:
            filters.append(["project", "is", {"type": "Project", "id": project_id}])

        fields = ["id", "code"]

        # Try to find as Shot first
        shot = sg.find_one("Shot", filters, fields)
        if shot:
            shot_name = shot.get("code", input_value)

            # Find the latest version for this shot
            version_filters = [
                [SHOTGRID_SHOT_FIELD, "is", shot_name],
            ]
            if project_id:
                version_filters.append(
                    ["project", "is", {"type": "Project", "id": project_id}]
                )

            version_fields = ["id", SHOTGRID_VERSION_FIELD]
            latest_version = sg.find_one(
                "Version",
                version_filters,
                version_fields,
                order=[{"field_name": "created_at", "direction": "desc"}],
            )

            if latest_version:
                version_name = latest_version.get(SHOTGRID_VERSION_FIELD, "001")
                shot_version = f"{shot_name}/{version_name}"
            else:
                shot_version = (
                    f"{shot_name}/001"  # Default version if no versions found
                )

            return {
                "success": True,
                "shot_version": shot_version,
                "message": f"Found shot {input_value}",
                "type": "shot",
            }

        # Try to find as Asset if not found as Shot
        asset = sg.find_one("Asset", filters, fields)
        if asset:
            asset_name = asset.get("code", input_value)

            # Find the latest version for this asset
            version_filters = [
                [
                    SHOTGRID_SHOT_FIELD,
                    "is",
                    asset_name,
                ],  # Assuming assets use the same field
            ]
            if project_id:
                version_filters.append(
                    ["project", "is", {"type": "Project", "id": project_id}]
                )

            version_fields = ["id", SHOTGRID_VERSION_FIELD]
            latest_version = sg.find_one(
                "Version",
                version_filters,
                version_fields,
                order=[{"field_name": "created_at", "direction": "desc"}],
            )

            if latest_version:
                version_name = latest_version.get(SHOTGRID_VERSION_FIELD, "001")
                shot_version = f"{asset_name}/{version_name}"
            else:
                shot_version = (
                    f"{asset_name}/001"  # Default version if no versions found
                )

            return {
                "success": True,
                "shot_version": shot_version,
                "message": f"Found asset {input_value}",
                "type": "asset",
            }

        # Not found as version, shot, or asset
        return {
            "success": False,
            "shot_version": None,
            "message": f"Shot/asset '{input_value}' not found",
            "type": "shot",
        }


router = APIRouter()


class ShotGridConfigRequest(BaseModel):
    shotgrid_url: Optional[str] = None
    script_name: Optional[str] = None
    api_key: Optional[str] = None


class ValidateShotVersionRequest(BaseModel):
    input_value: str
    project_id: Optional[int] = None


@router.post("/shotgrid/config")
def update_shotgrid_config(config: ShotGridConfigRequest):
    """Update ShotGrid configuration at runtime"""
    try:
        if config.shotgrid_url is not None:
            _runtime_config["SHOTGRID_URL"] = config.shotgrid_url
        if config.script_name is not None:
            _runtime_config["SCRIPT_NAME"] = config.script_name
        if config.api_key is not None:
            _runtime_config["API_KEY"] = config.api_key

        return {
            "status": "success",
            "message": "ShotGrid configuration updated",
            "config": {
                "shotgrid_url": get_shotgrid_url(),
                "script_name": get_script_name(),
                "api_key_set": bool(get_api_key()),
            },
        }
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


@router.get("/shotgrid/config")
def get_shotgrid_config():
    """Get current ShotGrid configuration (excluding sensitive data)"""
    return {
        "status": "success",
        "config": {
            "shotgrid_url": get_shotgrid_url(),
            "script_name": get_script_name(),
            "api_key_set": bool(get_api_key()),
        },
    }


@router.get("/shotgrid/active-projects")
def shotgrid_active_projects():
    try:
        projects = get_active_projects()
        return {"status": "success", "projects": projects}
    except Exception as e:
        import traceback

        print(f"ERROR: Failed to get active projects: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


@router.get("/shotgrid/latest-playlists/{project_id}")
def shotgrid_latest_playlists(project_id: int, limit: int = 20):
    try:
        playlists = get_latest_playlists_for_project(project_id, limit=limit)
        return {"status": "success", "playlists": playlists}
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


@router.get("/shotgrid/playlist-items/{playlist_id}")
def shotgrid_playlist_items(playlist_id: int):
    try:
        items = get_playlist_shot_names(playlist_id)
        return {"status": "success", "items": items}
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


@router.get("/shotgrid/version-statuses")
def shotgrid_version_statuses(project_id: int = None):
    """Get available version statuses from ShotGrid with display names. If project_id is provided, only returns statuses used in that project."""
    try:
        status_dict = get_version_statuses(project_id)
        # Return as dict with codes as keys and names as values
        return {"status": "success", "statuses": status_dict}
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


@router.get("/shotgrid/playlist-versions-with-statuses/{playlist_id}")
def shotgrid_playlist_versions_with_statuses(playlist_id: int):
    """Get version details including statuses from a playlist."""
    try:
        versions = get_playlist_versions_with_statuses(playlist_id)
        return {"status": "success", "versions": versions}
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


@router.post("/shotgrid/validate-shot-version")
def shotgrid_validate_shot_version(request: ValidateShotVersionRequest):
    """
    Validate shot/version input and return the proper shot/version format.
    If input is a number, treat as version and find associated shot.
    If input is text, treat as shot/asset name and find latest version.
    """
    try:
        result = validate_shot_version_input(request.input_value, request.project_id)
        return {"status": "success", **result}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "success": False,
                "shot_version": None,
                "message": f"Error validating input: {str(e)}",
                "type": None,
            },
        )


@router.get("/shotgrid/most-recent-playlist-items")
def shotgrid_most_recent_playlist_items():
    try:
        projects = get_active_projects()
        if not projects:
            return {"status": "error", "message": "No active projects found"}
        # Get most recent project
        project = projects[0]
        playlists = get_latest_playlists_for_project(project["id"], limit=1)
        if not playlists:
            return {
                "status": "error",
                "message": "No playlists found for most recent project",
            }
        playlist = playlists[0]
        items = get_playlist_shot_names(playlist["id"])
        return {
            "status": "success",
            "project": project,
            "playlist": playlist,
            "items": items,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(e)}
        )


class SyncNotesRequest(BaseModel):
    """Request model for syncing notes to ShotGrid"""

    version_id: str  # Internal app version ID (can be string)
    shotgrid_version_id: (
        int  # ShotGrid version ID (unique integer from ShotGrid database)
    )
    notes: str
    author_email: Optional[str] = None
    prepend_session_header: bool = False
    playlist_name: Optional[str] = None
    session_date: Optional[str] = None
    update_status: bool = False
    status_code: Optional[str] = None
    attachments: Optional[list] = None


@router.post("/shotgrid/sync-notes")
def sync_notes_to_shotgrid(request: SyncNotesRequest):
    """
    Sync notes to ShotGrid with duplicate prevention.

    Features:
    - Uses ShotGrid version ID for reliable lookups
    - Checks for existing notes to prevent duplicates
    - Looks up author by email
    - Sets recipient to version creator
    - Optionally prepends session header (playlist name + date)
    - Optionally updates version status
    - Optionally uploads attachments
    """
    try:
        import traceback
        from datetime import datetime

        sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())

        # Get version entity from ShotGrid using version ID (always unique)
        version = sg.find_one(
            "Version",
            [["id", "is", request.shotgrid_version_id]],
            ["id", "code", "user", "project", "entity"],  # user is the creator
        )

        if not version:
            return JSONResponse(
                status_code=404,
                content={
                    "status": "error",
                    "message": f"Version ID {request.shotgrid_version_id} not found in ShotGrid",
                },
            )

        # Build note content
        note_content = request.notes

        # Prepend session header if requested
        if request.prepend_session_header and request.playlist_name:
            session_date = request.session_date or datetime.now().strftime("%Y-%m-%d")
            header = f"**{request.playlist_name} - {session_date}**\n\n"
            note_content = header + note_content

        # Look up author by email
        author = None
        if request.author_email:
            author = sg.find_one(
                "HumanUser", [["email", "is", request.author_email]], ["id", "name"]
            )
            if not author:
                print(
                    f"Warning: Author with email '{request.author_email}' not found in ShotGrid"
                )

        # Get version creator as default recipient
        recipients = []
        if version.get("user"):
            recipients = [version["user"]]

        # Check for duplicate notes
        # We'll check if a note with identical content already exists for this version
        existing_notes = sg.find(
            "Note",
            [
                ["note_links", "is", {"type": "Version", "id": version["id"]}],
                ["content", "is", note_content],
            ],
            ["id", "content", "created_at"],
        )

        if existing_notes:
            version_code = version.get("code", f"ID {version['id']}")
            return {
                "status": "skipped",
                "message": f"Note already exists for version '{version_code}' (duplicate prevented)",
                "existing_note_id": existing_notes[0]["id"],
            }

        # Create note data
        version_code = version.get("code", f"ID {version['id']}")
        note_data = {
            "project": version.get("project"),
            "note_links": [version],
            "subject": f"Notes for {version_code}",
            "content": note_content,
            "addressings_to": recipients,
        }

        # Add author if found
        if author:
            note_data["user"] = author

        # Create the note
        created_note = sg.create("Note", note_data)

        print(
            f"✓ Created note for version '{version_code}' (Note ID: {created_note['id']})"
        )

        # Update version status if requested
        status_updated = False
        if request.update_status and request.status_code:
            try:
                sg.update(
                    "Version", version["id"], {"sg_status_list": request.status_code}
                )
                status_updated = True
                print(f"✓ Updated version status to '{request.status_code}'")
            except Exception as status_error:
                print(f"Warning: Failed to update version status: {status_error}")

        # Handle attachments if provided
        attachments_uploaded = []
        if request.attachments:
            for attachment_path in request.attachments:
                try:
                    # Upload attachment to the note
                    sg.upload(
                        "Note",
                        created_note["id"],
                        attachment_path,
                        field_name="attachments",
                    )
                    attachments_uploaded.append(attachment_path)
                    print(f"✓ Uploaded attachment: {attachment_path}")
                except Exception as attach_error:
                    print(
                        f"Warning: Failed to upload attachment '{attachment_path}': {attach_error}"
                    )

        return {
            "status": "success",
            "message": f"Successfully synced notes to ShotGrid for version '{version_code}'",
            "note_id": created_note["id"],
            "shotgrid_version_id": version["id"],
            "version_code": version_code,
            "status_updated": status_updated,
            "attachments_uploaded": len(attachments_uploaded),
            "recipient_count": len(recipients),
        }

    except Exception as e:
        import traceback

        print(f"ERROR: Failed to sync notes to ShotGrid: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Failed to sync notes: {str(e)}"},
        )


class VersionNotesItem(BaseModel):
    """Individual version with notes to sync"""

    version_id: str  # Internal app version ID
    shotgrid_version_id: int  # ShotGrid version ID
    notes: str  # Combined notes for this version
    transcript: Optional[str] = (
        None  # Transcript to sync to DNA Transcript custom entity
    )
    status_code: Optional[str] = None  # Optional status update
    attachments: Optional[List[str]] = None  # List of attachment file paths


class BatchSyncNotesRequest(BaseModel):
    """Request model for batch syncing notes to ShotGrid for entire playlist"""

    versions: List[VersionNotesItem]  # All versions with notes to sync
    author_email: Optional[str] = None
    prepend_session_header: bool = False
    playlist_name: Optional[str] = None
    playlist_id: Optional[int] = (
        None  # ShotGrid playlist ID for linking DNA Transcripts
    )
    session_date: Optional[str] = None
    update_status: bool = False  # Whether to update version statuses
    sync_transcripts: bool = (
        False  # Whether to sync transcripts to DNA Transcript custom entity
    )
    dna_transcript_entity: Optional[str] = (
        None  # Custom entity type name (e.g., "CustomEntity01")
    )
    transcript_field: Optional[str] = "sg_body"  # Field name for transcript text
    version_field: Optional[str] = "sg_version"  # Field name for version link
    playlist_field: Optional[str] = "sg_playlist"  # Field name for playlist link


@router.post("/shotgrid/batch-sync-notes")
def batch_sync_notes_to_shotgrid(request: BatchSyncNotesRequest):
    """
    Batch sync notes for multiple versions to ShotGrid.

    This is the preferred method for syncing an entire playlist/session.
    Syncs all versions with notes in a single operation with comprehensive reporting.
    """
    try:
        import traceback
        from datetime import datetime

        sg = Shotgun(get_shotgrid_url(), get_script_name(), get_api_key())

        # Track results
        results = {
            "synced": [],
            "skipped": [],
            "failed": [],
            "total": len(request.versions),
        }

        # Look up author once if provided
        author = None
        if request.author_email:
            author = sg.find_one(
                "HumanUser", [["email", "is", request.author_email]], ["id", "name"]
            )
            if not author:
                print(
                    f"Warning: Author with email '{request.author_email}' not found in ShotGrid"
                )

        # Process each version
        for version_item in request.versions:
            try:
                # Skip versions with no notes
                if not version_item.notes or not version_item.notes.strip():
                    continue

                # Get version entity from ShotGrid
                version = sg.find_one(
                    "Version",
                    [["id", "is", version_item.shotgrid_version_id]],
                    ["id", "code", "user", "project", "entity"],
                )

                if not version:
                    results["failed"].append(
                        {
                            "version_id": version_item.version_id,
                            "shotgrid_version_id": version_item.shotgrid_version_id,
                            "error": f"Version ID {version_item.shotgrid_version_id} not found in ShotGrid",
                        }
                    )
                    continue

                # Build note content
                note_content = version_item.notes

                # Prepend session header if requested
                if request.prepend_session_header and request.playlist_name:
                    session_date = request.session_date or datetime.now().strftime(
                        "%Y-%m-%d"
                    )
                    header = f"**{request.playlist_name} - {session_date}**\n\n"
                    note_content = header + note_content

                # Get version creator as default recipient
                recipients = []
                if version.get("user"):
                    recipients = [version["user"]]

                # Check for duplicate notes
                existing_notes = sg.find(
                    "Note",
                    [
                        ["note_links", "is", {"type": "Version", "id": version["id"]}],
                        ["content", "is", note_content],
                    ],
                    ["id", "content", "created_at"],
                )

                version_code = version.get("code", f"ID {version['id']}")

                if existing_notes:
                    results["skipped"].append(
                        {
                            "version_id": version_item.version_id,
                            "shotgrid_version_id": version_item.shotgrid_version_id,
                            "version_code": version_code,
                            "existing_note_id": existing_notes[0]["id"],
                        }
                    )
                    print(f"  ⊘ Skipped {version_code} (duplicate)")
                    continue

                # Create note data
                note_data = {
                    "project": version.get("project"),
                    "note_links": [version],
                    "subject": f"Notes for {version_code}",
                    "content": note_content,
                    "addressings_to": recipients,
                }

                # Add author if found
                if author:
                    note_data["user"] = author

                # Create the note
                created_note = sg.create("Note", note_data)

                # Upload attachments if provided
                attachments_uploaded = []
                if version_item.attachments:
                    for attachment_path in version_item.attachments:
                        try:
                            sg.upload(
                                "Note",
                                created_note["id"],
                                attachment_path,
                                field_name="attachments",
                            )
                            attachments_uploaded.append(attachment_path)
                            print(f"    ✓ Uploaded attachment: {attachment_path}")
                        except Exception as attach_error:
                            print(
                                f"    Warning: Failed to upload attachment '{attachment_path}': {attach_error}"
                            )

                # Update version status if requested
                status_updated = False
                if request.update_status and version_item.status_code:
                    try:
                        sg.update(
                            "Version",
                            version["id"],
                            {"sg_status_list": version_item.status_code},
                        )
                        status_updated = True
                    except Exception as status_error:
                        print(f"    Warning: Failed to update status: {status_error}")

                # Create/update DNA Transcript custom entity if requested
                dna_transcript_id = None
                if (
                    request.sync_transcripts
                    and version_item.transcript
                    and request.dna_transcript_entity
                ):
                    try:
                        # Use configurable field names with defaults
                        version_field = request.version_field or "sg_version"
                        transcript_field = request.transcript_field or "sg_body"
                        playlist_field = request.playlist_field or "sg_playlist"

                        # Check if DNA Transcript already exists for this version
                        existing_transcript = sg.find_one(
                            request.dna_transcript_entity,
                            [
                                [
                                    version_field,
                                    "is",
                                    {"type": "Version", "id": version["id"]},
                                ]
                            ],
                            ["id"],
                        )

                        transcript_data = {
                            version_field: {"type": "Version", "id": version["id"]},
                            transcript_field: version_item.transcript,
                            "project": version.get("project"),
                        }

                        # Add playlist link if provided
                        if request.playlist_id:
                            transcript_data[playlist_field] = {
                                "type": "Playlist",
                                "id": request.playlist_id,
                            }

                        if existing_transcript:
                            # Update existing DNA Transcript
                            sg.update(
                                request.dna_transcript_entity,
                                existing_transcript["id"],
                                transcript_data,
                            )
                            dna_transcript_id = existing_transcript["id"]
                            print(
                                f"    ✓ Updated DNA Transcript (ID: {dna_transcript_id})"
                            )
                        else:
                            # Create new DNA Transcript
                            created_transcript = sg.create(
                                request.dna_transcript_entity, transcript_data
                            )
                            dna_transcript_id = created_transcript["id"]
                            print(
                                f"    ✓ Created DNA Transcript (ID: {dna_transcript_id})"
                            )

                    except Exception as transcript_error:
                        print(
                            f"    Warning: Failed to sync transcript: {transcript_error}"
                        )

                results["synced"].append(
                    {
                        "version_id": version_item.version_id,
                        "shotgrid_version_id": version_item.shotgrid_version_id,
                        "version_code": version_code,
                        "note_id": created_note["id"],
                        "status_updated": status_updated,
                        "attachments_uploaded": len(attachments_uploaded),
                        "recipient_count": len(recipients),
                        "dna_transcript_id": dna_transcript_id,
                    }
                )

                attachment_msg = (
                    f" + {len(attachments_uploaded)} attachment(s)"
                    if attachments_uploaded
                    else ""
                )
                print(
                    f"  ✓ Synced {version_code} (Note ID: {created_note['id']}){attachment_msg}"
                )

            except Exception as version_error:
                results["failed"].append(
                    {
                        "version_id": version_item.version_id,
                        "shotgrid_version_id": version_item.shotgrid_version_id,
                        "error": str(version_error),
                    }
                )
                print(
                    f"  ✗ Failed to sync version {version_item.version_id}: {version_error}"
                )

        # Generate summary
        synced_count = len(results["synced"])
        skipped_count = len(results["skipped"])
        failed_count = len(results["failed"])

        print(f"\n✓ Batch sync complete:")
        print(f"  Synced: {synced_count}")
        print(f"  Skipped: {skipped_count}")
        print(f"  Failed: {failed_count}")

        return {
            "status": "success",
            "message": f"Synced {synced_count} of {results['total']} versions",
            "results": results,
        }

    except Exception as e:
        import traceback

        print(f"ERROR: Failed to batch sync notes to ShotGrid: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Failed to batch sync notes: {str(e)}",
            },
        )


if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="ShotGrid Service Test CLI")
    parser.add_argument(
        "--project", "-p", type=str, help="Optional project code to use for testing"
    )
    args = parser.parse_args()

    # Convert project code to project ID if provided
    project_id_from_args = None
    if args.project:
        try:
            project = get_project_by_code(args.project)
            if project:
                project_id_from_args = project["id"]
                print(f"🎯 Using project: {args.project} (ID: {project_id_from_args})")
            else:
                print(
                    f"⚠️  Project code '{args.project}' not found, proceeding without project filter"
                )
        except Exception as e:
            print(f"⚠️  Error looking up project '{args.project}': {str(e)}")
            print("Proceeding without project filter")

    print("ShotGrid Service Test CLI")
    print("1. List all active projects")
    print("2. List latest playlists for a project")
    print("3. List shot/version info for a playlist")
    print("4. Test shot/version validation")
    choice = input("Enter choice (1/2/3/4): ").strip()

    if choice == "1":
        projects = get_active_projects()
        print(f"Active projects ({len(projects)}):")
        for pr in projects:
            print(
                f" - [id: {pr['id']}] code: {pr['code']} name: {pr.get('name', '')} status: {pr.get('sg_status', '')} created: {pr['created_at']}"
            )
    elif choice == "2":
        project_id = project_id_from_args
        if not project_id:
            project_id_input = input("Enter project id: ").strip()
            try:
                project_id = int(project_id_input)
            except Exception:
                print("Invalid project id")
                exit(1)
        playlists = get_latest_playlists_for_project(project_id, limit=5)
        print(f"Playlists for project {project_id} ({len(playlists)}):")
        for pl in playlists:
            print(
                f" - [id: {pl['id']}] code: {pl['code']} created: {pl['created_at']} updated: {pl['updated_at']}"
            )
    elif choice == "3":
        playlist_id = input("Enter playlist id: ").strip()
        try:
            playlist_id = int(playlist_id)
        except Exception:
            print("Invalid playlist id")
            exit(1)
        items = get_playlist_shot_names(playlist_id)
        print(f"Shots/Versions in playlist {playlist_id} ({len(items)}):")
        for item in items:
            print(f" - {item}")
    elif choice == "4":
        print("\n=== Shot/Version Validation Test ===")
        print("This will test the validate_shot_version_input function")
        print("You can enter:")
        print("- A number (e.g., '12345') to test version lookup")
        print("- A shot/asset name (e.g., 'SH010') to test shot lookup")
        print("- Type 'quit' to exit test mode")

        # Use command line project ID if provided, otherwise ask user
        project_id = project_id_from_args
        if not project_id:
            use_project = (
                input("\nDo you want to limit search to a specific project? (y/n): ")
                .strip()
                .lower()
            )
            if use_project == "y":
                project_id_input = input("Enter project ID: ").strip()
                try:
                    project_id = int(project_id_input)
                    print(f"Using project ID: {project_id}")
                except ValueError:
                    print("Invalid project ID, proceeding without project filter")
                    project_id = None

        print(f"\n--- Starting validation tests ---")
        if project_id:
            print(f"Project filter: {project_id}")
        else:
            print("Project filter: None (searching all projects)")
        print("Enter test values or 'quit' to exit:\n")

        while True:
            test_input = input("Test input: ").strip()
            if test_input.lower() == "quit":
                break
            if not test_input:
                continue

            print(f"\n🔍 Testing: '{test_input}'")
            try:
                result = validate_shot_version_input(test_input, project_id)
                print(f"✅ Success: {result['success']}")
                print(f"📝 Message: {result['message']}")
                print(f"🎯 Type: {result['type']}")
                if result["shot_version"]:
                    print(f"📋 Shot/Version: {result['shot_version']}")
                else:
                    print("📋 Shot/Version: None")
                print("-" * 50)
            except Exception as e:
                print(f"❌ Error during validation: {str(e)}")
                print("-" * 50)

        print("Validation test completed.")
    else:
        print("Invalid choice.")
