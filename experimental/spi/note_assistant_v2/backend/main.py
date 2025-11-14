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
from llm_service import router as llm_router

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
SG_URL = os.environ.get("SG_URL")
shotgrid_enabled = bool(SG_URL and SG_URL.strip())

# Check if VEXA is configured
VEXA_BASE_URL = os.environ.get("VEXA_BASE_URL")
vexa_routing_enabled = bool(VEXA_BASE_URL and VEXA_BASE_URL.strip())

# Check if LLM backend routing is configured
LLM_BACKEND_BASE_URL = os.environ.get("LLM_BACKEND_BASE_URL")
llm_backend_routing_enabled = bool(LLM_BACKEND_BASE_URL and LLM_BACKEND_BASE_URL.strip())

# Register core routers
app.include_router(playlist_router)
app.include_router(email_router)
app.include_router(llm_router)

# Only register vexa router if VEXA is configured
if vexa_routing_enabled:
    from vexa_service import router as vexa_router
    app.include_router(vexa_router)

# Only register shotgrid router if ShotGrid is configured
if shotgrid_enabled:
    from shotgrid_service import router as shotgrid_router
    app.include_router(shotgrid_router)

@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "message": "Backend server is running"}

@app.get("/routes")
def list_routes():
    """List all available API routes."""
    routes = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods)
            })
    return {"routes": routes}

@app.get("/config")
def get_config():
    """Return application configuration including feature availability."""
    return JSONResponse(content={
        "shotgrid_enabled": shotgrid_enabled,
        "vexa_routing_enabled": vexa_routing_enabled,
        "llm_backend_routing_enabled": llm_backend_routing_enabled,
        "openai_enabled": os.environ.get("ENABLE_OPENAI", "false").lower() == "true",
        "anthropic_enabled": os.environ.get("ENABLE_ANTHROPIC", "false").lower() == "true",
        "ollama_enabled": os.environ.get("ENABLE_OLLAMA", "false").lower() == "true",
        "google_enabled": os.environ.get("ENABLE_GOOGLE", "false").lower() == "true"
    })
