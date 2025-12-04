"""
Version Service - Manages versions and their associated notes
"""

import csv
from io import StringIO
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()


# ===== Data Models =====


class Attachment(BaseModel):
    """An image attachment with its file path"""

    filepath: str
    filename: str


class Version(BaseModel):
    """A version with its associated data"""

    id: str  # Internal unique identifier (auto-generated if not provided)
    name: str  # Display name (from leftmost CSV column)
    shotgrid_version_id: Optional[int] = (
        None  # ShotGrid version ID (unique integer for syncing)
    )
    sg_dna_transcript_id: Optional[int] = (
        None  # ShotGrid DNA Transcript custom entity ID
    )
    user_notes: str = ""
    ai_notes: str = ""
    transcript: str = ""
    status: str = ""  # ShotGrid version status
    attachments: List[Attachment] = []  # Image attachments


class AddNoteRequest(BaseModel):
    """Request to add a note to a version"""

    version_id: str
    note_text: str


class UpdateNotesRequest(BaseModel):
    """Request to update all notes for a version"""

    version_id: str
    user_notes: Optional[str] = None
    ai_notes: Optional[str] = None
    transcript: Optional[str] = None


class GenerateAINotesRequest(BaseModel):
    """Request to generate AI notes from transcript"""

    version_id: str
    transcript: Optional[str] = (
        None  # If not provided, uses version's existing transcript
    )
    prompt: Optional[str] = None  # Custom prompt for LLM
    provider: Optional[str] = None  # LLM provider (openai, claude, gemini)
    api_key: Optional[str] = None  # API key for LLM provider


class AddAttachmentRequest(BaseModel):
    """Request to add an attachment to a version"""

    version_id: str
    filepath: str
    filename: str


class RemoveAttachmentRequest(BaseModel):
    """Request to remove an attachment from a version"""

    version_id: str
    filepath: str


# ===== In-Memory Storage =====
# In production, this would be replaced with a database
_versions: Dict[str, Version] = {}
_version_order: List[str] = []  # To maintain insertion order


# ===== API Endpoints =====


@router.post("/versions/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file to create versions.
    CSV format:
    - First column: Version Name (required, used for display)
    - Optional "ID" column: Version ID (internal identifier)
    - Optional "Version Code" column: ShotGrid version code (for syncing)
    - Header row is skipped

    If no ID column is provided, auto-generates IDs (v_1, v_2, v_3, etc.)
    """
    content = await file.read()
    decoded = content.decode("utf-8", errors="ignore")
    reader = csv.reader(StringIO(decoded))

    # Read header row
    header = next(reader, None)
    if not header:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Version Name is ALWAYS the first column (leftmost)
    version_name_idx = 0

    # Look for optional ID column
    version_id_idx = None

    for idx, col in enumerate(header):
        col_lower = col.lower().strip()
        if col_lower == "id":
            version_id_idx = idx
            break

    # Read data rows (header is already skipped)
    versions_data = []
    auto_id_counter = 1

    for row in reader:
        if row and len(row) > 0 and row[0].strip():  # Skip empty rows
            version_name = row[0].strip()

            # Get ID from ID column if present, otherwise auto-generate
            if (
                version_id_idx is not None
                and len(row) > version_id_idx
                and row[version_id_idx].strip()
            ):
                version_id = row[version_id_idx].strip()
            else:
                version_id = f"v_{auto_id_counter}"
                auto_id_counter += 1

            versions_data.append({"id": version_id, "name": version_name})

    # Clear existing versions and add new ones
    _versions.clear()
    _version_order.clear()

    for version_data in versions_data:
        version = Version(
            id=version_data["id"],
            name=version_data["name"],
            shotgrid_version_id=None,  # CSV workflow doesn't sync to ShotGrid
            user_notes="",
            ai_notes="",
            transcript="",
            status="",
        )
        _versions[version.id] = version
        _version_order.append(version.id)

    has_ids = version_id_idx is not None

    print(
        f"Loaded {len(_versions)} versions from CSV "
        f"(ID column: {'found' if has_ids else 'auto-generated'})"
    )

    return {
        "status": "success",
        "count": len(_versions),
        "versions": [{"id": v.id, "name": v.name} for v in _versions.values()],
    }


@router.post("/versions")
async def create_version(version: Version):
    """Create a new version"""
    # Check if version already exists
    if version.id in _versions:
        print(f"Version '{version.id}' already exists, updating...")
        _versions[version.id] = version
    else:
        print(f"Creating new version: {version.name} (ID: {version.id})")
        _versions[version.id] = version
        _version_order.append(version.id)

    return {"status": "success", "version": version.model_dump()}


@router.get("/versions")
async def get_versions():
    """Get all versions in order (excluding scratch version)"""
    # Filter out the scratch version from the list
    visible_versions = [
        _versions[vid].model_dump() for vid in _version_order if vid != "_scratch"
    ]
    return {
        "status": "success",
        "count": len(visible_versions),
        "versions": visible_versions,
    }


@router.get("/versions/{version_id}")
async def get_version(version_id: str):
    """Get a specific version by ID"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    return {"status": "success", "version": _versions[version_id].model_dump()}


@router.post("/versions/{version_id}/notes")
async def add_note(version_id: str, request: AddNoteRequest):
    """Add a user note to a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    version = _versions[version_id]

    # Format note with "User:" prefix
    formatted_note = f"User: {request.note_text.strip()}"

    # Append to existing notes
    if version.user_notes:
        version.user_notes += "\n\n" + formatted_note
    else:
        version.user_notes = formatted_note

    print(f"Added note to version '{version.name}': {formatted_note}")

    return {"status": "success", "version": version.model_dump()}


@router.put("/versions/{version_id}/notes")
async def update_notes(version_id: str, request: UpdateNotesRequest):
    """Update notes for a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    version = _versions[version_id]

    if request.user_notes is not None:
        version.user_notes = request.user_notes
    if request.ai_notes is not None:
        version.ai_notes = request.ai_notes
    if request.transcript is not None:
        version.transcript = request.transcript

    return {"status": "success", "version": version.model_dump()}


@router.post("/versions/{version_id}/generate-ai-notes")
async def generate_ai_notes(version_id: str, request: GenerateAINotesRequest):
    """Generate AI notes from transcript for a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    version = _versions[version_id]

    # Use provided transcript or version's existing transcript
    transcript = request.transcript if request.transcript else version.transcript

    if not transcript:
        raise HTTPException(
            status_code=400, detail="No transcript available for AI note generation"
        )

    # Import the LLM summary function from note_service
    import httpx
    from note_service import LLMSummaryRequest

    # Call the LLM summary endpoint (internal call)
    # In a real implementation, you might want to import and call the function directly
    async with httpx.AsyncClient() as client:
        llm_request = {"text": transcript}

        # Add custom prompt if provided
        if request.prompt:
            llm_request["prompt"] = request.prompt

        # Add provider if provided
        if request.provider:
            llm_request["provider"] = request.provider

        # Add API key if provided
        if request.api_key:
            llm_request["api_key"] = request.api_key

        response = await client.post(
            "http://localhost:8000/llm-summary", json=llm_request
        )

        if response.status_code != 200:
            error_detail = f"LLM summary failed: {response.text}"
            print(f"ERROR: {error_detail}")
            raise HTTPException(status_code=500, detail=error_detail)

        result = response.json()
        ai_notes = result.get("summary", "")

    # Store AI notes in version
    version.ai_notes = ai_notes

    return {"status": "success", "version": version.model_dump()}


@router.delete("/versions/{version_id}")
async def delete_version(version_id: str):
    """Delete a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    del _versions[version_id]
    _version_order.remove(version_id)

    return {"status": "success", "message": f"Version '{version_id}' deleted"}


@router.post("/versions/{version_id}/attachments")
async def add_attachment(version_id: str, request: AddAttachmentRequest):
    """Add an image attachment to a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    version = _versions[version_id]

    # Check if attachment already exists
    for att in version.attachments:
        if att.filepath == request.filepath:
            return {"status": "success", "message": "Attachment already exists"}

    # Add new attachment
    attachment = Attachment(filepath=request.filepath, filename=request.filename)
    version.attachments.append(attachment)

    print(f"Added attachment '{request.filename}' to version '{version_id}'")
    return {"status": "success", "version": version.model_dump()}


@router.delete("/versions/{version_id}/attachments")
async def remove_attachment(version_id: str, request: RemoveAttachmentRequest):
    """Remove an image attachment from a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    version = _versions[version_id]

    # Find and remove attachment
    for i, att in enumerate(version.attachments):
        if att.filepath == request.filepath:
            version.attachments.pop(i)
            print(f"Removed attachment '{att.filename}' from version '{version_id}'")
            return {"status": "success", "version": version.model_dump()}

    raise HTTPException(status_code=404, detail="Attachment not found")


@router.get("/versions/{version_id}/attachments")
async def get_attachments(version_id: str):
    """Get all attachments for a version"""
    if version_id not in _versions:
        raise HTTPException(status_code=404, detail=f"Version '{version_id}' not found")

    version = _versions[version_id]
    return {
        "status": "success",
        "attachments": [att.model_dump() for att in version.attachments],
    }


@router.delete("/versions")
async def clear_versions():
    """Clear all versions"""
    count = len(_versions)
    _versions.clear()
    _version_order.clear()

    return {"status": "success", "message": f"Cleared {count} versions"}


@router.get("/versions/export/csv")
async def export_csv(include_status: bool = False):
    """Export all versions and their notes to CSV format (excluding scratch version)

    Args:
        include_status: If True, includes a Status column in the CSV export
    """
    from io import StringIO

    from fastapi.responses import StreamingResponse

    output = StringIO()
    writer = csv.writer(output)

    # Write header - include Status and Images columns if requested
    if include_status:
        writer.writerow(["Version", "Note", "Transcript", "Status", "Images"])
    else:
        writer.writerow(["Version", "Note", "Transcript", "Images"])

    # Write each version's notes (skip scratch version)
    for version_id in _version_order:
        # Skip the scratch version
        if version_id == "_scratch":
            continue

        version = _versions[version_id]

        # Get image attachments as semicolon-separated paths
        image_paths = (
            ";".join([att.filepath for att in version.attachments])
            if version.attachments
            else ""
        )

        # Split notes by double newline (each note from a user)
        notes = version.user_notes.split("\n\n") if version.user_notes else []

        if notes:
            # Write each note as a separate row
            for note in notes:
                if note.strip():
                    if include_status:
                        writer.writerow(
                            [
                                version.name,
                                note.strip(),
                                version.transcript,
                                version.status,
                                image_paths,
                            ]
                        )
                    else:
                        writer.writerow(
                            [
                                version.name,
                                note.strip(),
                                version.transcript,
                                image_paths,
                            ]
                        )
        else:
            # Write version even if no notes (with empty note field)
            if include_status:
                writer.writerow(
                    [version.name, "", version.transcript, version.status, image_paths]
                )
            else:
                writer.writerow([version.name, "", version.transcript, image_paths])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=versions_export.csv"},
    )
