from fastapi import UploadFile, File, APIRouter
import csv
import os

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, environment variables should be set manually
    pass

router = APIRouter()

# Configuration for CSV field names
SG_CSV_VERSION_FIELD = os.environ.get("SG_CSV_VERSION_FIELD", "version")
SG_CSV_SHOT_FIELD = os.environ.get("SG_CSV_SHOT_FIELD", "shot")

@router.post("/upload-playlist")
async def upload_playlist(file: UploadFile = File(...)):
    # Get the current values from environment
    csv_version_field = os.environ.get("SG_CSV_VERSION_FIELD", "version")
    csv_shot_field = os.environ.get("SG_CSV_SHOT_FIELD", "shot")
    
    content = await file.read()
    decoded = content.decode("utf-8", errors="ignore").splitlines()
    reader = csv.reader(decoded)
    items = []
    header = None
    for idx, row in enumerate(reader):
        if not row:
            continue
        if idx == 0:
            header = [h.strip().lower() for h in row]
            
            # Find column indices for the configured field names
            try:
                shot_idx = header.index(csv_shot_field.lower())
            except ValueError:
                shot_idx = None
            try:
                version_idx = header.index(csv_version_field.lower())
            except ValueError:
                version_idx = None
            try:
                transcription_idx = header.index('transcription')
            except ValueError:
                transcription_idx = None
            try:
                notes_idx = header.index('notes')
            except ValueError:
                notes_idx = None
            continue
        
        # Extract shot and version values using configured field names
        shot_name = ''
        version_name = ''
        if shot_idx is not None and len(row) > shot_idx:
            val = row[shot_idx]
            shot_name = str(val).strip() if val is not None else ''
        if version_idx is not None and len(row) > version_idx:
            val = row[version_idx]
            version_name = str(val).strip() if val is not None else ''
        
        # Combine shot and version into the name field
        if shot_name and version_name:
            item_name = f"{shot_name}/{version_name}"
        elif shot_name:
            item_name = shot_name
        elif version_name:
            item_name = version_name
        else:
            # Fallback to first column if configured fields not found
            item_name = str(row[0]).strip() if len(row) > 0 and row[0] is not None else ''
        
        transcription = ''
        notes = ''
        if transcription_idx is not None and len(row) > transcription_idx:
            val = row[transcription_idx]
            transcription = str(val).strip() if val is not None else ''
        if notes_idx is not None and len(row) > notes_idx:
            val = row[notes_idx]
            notes = str(val).strip() if val is not None else ''
        
        if item_name:
            items.append({
                'name': item_name,
                'transcription': transcription,
                'notes': notes
            })
    return {"status": "success", "items": items}
