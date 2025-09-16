from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playlist import router as playlist_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MeetID(BaseModel):
    meet_id: str

@app.post("/submit-meet-id")
async def submit_meet_id(data: MeetID):
    print(f"Received Google Meet ID: {data.meet_id}")
    return {"status": "success", "meet_id": data.meet_id}

# Register playlist router
app.include_router(playlist_router)
