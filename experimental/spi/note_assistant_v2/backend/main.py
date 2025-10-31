from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# Check if ShotGrid is configured
SHOTGRID_URL = os.environ.get("SHOTGRID_URL")
shotgrid_enabled = bool(SHOTGRID_URL and SHOTGRID_URL.strip())

# Check if VEXA is configured
VEXA_BASE_URL = os.environ.get("VEXA_BASE_URL")
vexa_routing_enabled = bool(VEXA_BASE_URL and VEXA_BASE_URL.strip())

# Register core routers
app.include_router(playlist_router)
app.include_router(email_router)
app.include_router(note_router)

# Only register vexa router if VEXA is configured
if vexa_routing_enabled:
    from vexa_service import router as vexa_router
    app.include_router(vexa_router)

# Only register shotgrid router if ShotGrid is configured
if shotgrid_enabled:
    from shotgrid_service import router as shotgrid_router
    app.include_router(shotgrid_router)

@app.get("/config")
def get_config():
    """Return application configuration including feature availability."""
    return JSONResponse(content={
        "shotgrid_enabled": shotgrid_enabled,
        "vexa_routing_enabled": vexa_routing_enabled,
        "openai_enabled": os.environ.get("ENABLE_OPENAI", "false").lower() == "true",
        "anthropic_enabled": os.environ.get("ENABLE_ANTHROPIC", "false").lower() == "true",
        "ollama_enabled": os.environ.get("ENABLE_OLLAMA", "false").lower() == "true",
        "google_enabled": os.environ.get("ENABLE_GOOGLE", "false").lower() == "true"
    })
