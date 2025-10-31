from fastapi import UploadFile, File, APIRouter
import csv

router = APIRouter()

@router.post("/upload-playlist")
async def upload_playlist(file: UploadFile = File(...)):
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
            try:
                transcription_idx = header.index('transcription')
            except ValueError:
                transcription_idx = None
            try:
                notes_idx = header.index('notes')
            except ValueError:
                notes_idx = None
            continue
        first = str(row[0]).strip() if len(row) > 0 and row[0] is not None else ''
        transcription = ''
        notes = ''
        if transcription_idx is not None and len(row) > transcription_idx:
            val = row[transcription_idx]
            transcription = str(val).strip() if val is not None else ''
        if notes_idx is not None and len(row) > notes_idx:
            val = row[notes_idx]
            notes = str(val).strip() if val is not None else ''
        if first:
            items.append({
                'name': str(first),
                'transcription': str(transcription),
                'notes': str(notes)
            })
    return {"status": "success", "items": items}
