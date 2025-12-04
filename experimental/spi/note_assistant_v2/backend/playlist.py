from fastapi import UploadFile, File, APIRouter
from pydantic import BaseModel
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
SG_CSV_NOTES_FIELD = os.environ.get("SG_CSV_NOTES_FIELD", "notes")

def parse_field_names(field_config):
    """Parse comma-separated field names, handling spaces and quotes"""
    if not field_config:
        return []
    
    # Split by comma and strip whitespace from each field
    fields = [field.strip().strip('"').strip("'") for field in field_config.split(',')]
    # Remove empty fields
    return [field for field in fields if field]

def find_column_index(header, field_names):
    """Find the first matching column index from a list of possible field names"""
    if not field_names:
        return None
    
    # Header should already be lowercase and stripped, but ensure consistency
    header_processed = [h.strip().lower() for h in header]
    for field_name in field_names:
        try:
            return header_processed.index(field_name.strip().lower())
        except ValueError:
            continue
    return None

class NotesExportRequest(BaseModel):
    notes: list
    export_format: str = "csv"  # csv or txt
    original_filename: str = None  # Optional original source filename

@router.post("/export-notes")
async def export_notes(request: NotesExportRequest):
    """Export notes in CSV format using configurable field names"""
    # Get the current values from environment and parse field names
    csv_version_fields = parse_field_names(os.environ.get("SG_CSV_VERSION_FIELD", "version"))
    csv_shot_fields = parse_field_names(os.environ.get("SG_CSV_SHOT_FIELD", "shot"))
    csv_notes_fields = parse_field_names(os.environ.get("SG_CSV_NOTES_FIELD", "notes"))
    
    # Use the first field name for export headers
    csv_version_field = csv_version_fields[0] if csv_version_fields else "version"
    csv_shot_field = csv_shot_fields[0] if csv_shot_fields else "shot"
    csv_notes_field = csv_notes_fields[0] if csv_notes_fields else "notes"
    
    # Build CSV content
    lines = []
    
    # Create header with configurable field names
    header = [csv_shot_field, csv_version_field, csv_notes_field, 'transcription', 'summary']
    lines.append(','.join(f'"{h}"' for h in header))
    
    # Process each note
    for note in request.notes:
        shot_name = str(note.get('shot', '')).strip()
        
        # Split shot/version using "/" delimiter
        shot_value = ''
        version_value = ''
        
        if shot_name and '/' in shot_name:
            parts = shot_name.split('/', 1)  # Split only on first occurrence
            shot_value = parts[0]
            version_value = parts[1]
        else:
            # If no "/" delimiter found, put everything in shot field
            shot_value = shot_name
        
        # Escape CSV values
        def escape_csv(val):
            return '"' + str(val).replace('"', '""') + '"'
        
        row = [
            escape_csv(shot_value),
            escape_csv(version_value),
            escape_csv(note.get('notes', '')),
            escape_csv(note.get('transcription', '')),
            escape_csv(note.get('summary', ''))
        ]
        lines.append(','.join(row))
    
    csv_content = '\n'.join(lines)
    
    # Generate filename based on original source
    if request.original_filename:
        # Remove extension and add _dna.csv suffix
        base_name = os.path.splitext(request.original_filename)[0]
        filename = f"{base_name}_dna.csv"
    else:
        # Default filename
        filename = "shot_notes_dna.csv"
    
    return {
        "status": "success",
        "content": csv_content,
        "filename": filename,
        "content_type": "text/csv"
    }



@router.post("/upload-playlist")
async def upload_playlist(file: UploadFile = File(...)):
    # Get the current values from environment and parse field names
    csv_version_fields = parse_field_names(os.environ.get("SG_CSV_VERSION_FIELD", "version"))
    csv_shot_fields = parse_field_names(os.environ.get("SG_CSV_SHOT_FIELD", "shot"))
    csv_notes_fields = parse_field_names(os.environ.get("SG_CSV_NOTES_FIELD", "notes"))
    
    content = await file.read()
    decoded = content.decode("utf-8", errors="ignore")
    # Use StringIO to create a file-like object for csv.reader to handle multi-line fields properly
    from io import StringIO
    reader = csv.reader(StringIO(decoded))
    items = []
    header = None
    for idx, row in enumerate(reader):
        if not row:
            continue
        if idx == 0:
            header = [h.strip().lower() for h in row]
            
            # Find column indices for the configured field names
            shot_idx = find_column_index(header, csv_shot_fields)
            version_idx = find_column_index(header, csv_version_fields)
            notes_idx = find_column_index(header, csv_notes_fields)
            
            try:
                transcription_idx = header.index('transcription')
            except ValueError:
                transcription_idx = None
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
            # Don't strip() to preserve leading/trailing whitespace including newlines
            transcription = str(val) if val is not None else ''
        if notes_idx is not None and len(row) > notes_idx:
            val = row[notes_idx]
            # Don't strip() to preserve leading/trailing whitespace including newlines  
            notes = str(val) if val is not None else ''
        
        if item_name:
            items.append({
                'name': item_name,
                'transcription': transcription,
                'notes': notes
            })
    return {"status": "success", "items": items, "original_filename": file.filename}
