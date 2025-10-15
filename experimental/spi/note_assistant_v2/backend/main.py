from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Dict, Any, Optional
import os
import json
import asyncio
from datetime import datetime
from playlist import router as playlist_router
import random
from email_service import router as email_router
from note_service import router as note_router
from shotgrid_service import router as shotgrid_router

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, environment variables should be set manually
    pass

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register playlist, email, note, and shotgrid routers
app.include_router(playlist_router)
app.include_router(email_router)
app.include_router(note_router)
app.include_router(shotgrid_router)
