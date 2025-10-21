from fastapi import UploadFile, File, APIRouter
import csv

router = APIRouter()

@router.post("/upload-playlist")
async def upload_playlist(file: UploadFile = File(...)):
    content = await file.read()
    decoded = content.decode("utf-8", errors="ignore").splitlines()
    reader = csv.reader(decoded)
    items = []
    print("CSV file contents:")
    for idx, row in enumerate(reader):
        if not row:
            continue
        print(row)
        if idx == 0:  # skip header row
            continue
        first = row[0].strip()
        if first:
            items.append(first)
    return {"status": "success", "items": items}
