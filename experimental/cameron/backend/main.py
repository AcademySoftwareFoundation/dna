import asyncio
import json
import os
import random
import sys
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from note_service import router as note_router
from playlist import router as playlist_router
from pydantic import BaseModel, EmailStr
from version_service import router as version_router

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

# Register core routers
app.include_router(playlist_router)
app.include_router(note_router)
app.include_router(version_router)

# Always register shotgrid router (config can be set via API)
from shotgrid_service import router as shotgrid_router

app.include_router(shotgrid_router)

# Register settings router
from settings_service import router as settings_router

app.include_router(settings_router)


@app.get("/")
def root():
    """Root endpoint - API information"""
    return {
        "name": "DNA Dailies Notes Assistant API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health_check():
    """
    Health check endpoint for monitoring and client connectivity testing.
    Returns service status and availability of optional features.
    """
    # Check ShotGrid availability
    vexa_configured = bool(os.environ.get("VEXA_API_KEY"))

    # Check LLM availability
    openai_configured = bool(os.environ.get("OPENAI_API_KEY"))
    claude_configured = bool(os.environ.get("CLAUDE_API_KEY"))
    gemini_configured = bool(os.environ.get("GEMINI_API_KEY"))

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "features": {
            "shotgrid": shotgrid_enabled,
            "vexa_transcription": vexa_configured,
            "llm_openai": openai_configured,
            "llm_claude": claude_configured,
            "llm_gemini": gemini_configured,
        },
    }


@app.get("/config")
def get_config():
    """Return application configuration including feature availability."""
    return JSONResponse(content={"shotgrid_enabled": shotgrid_enabled})
