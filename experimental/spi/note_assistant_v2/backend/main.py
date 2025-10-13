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
from note_assistant import summarize_gemini, DEFAULT_MODELS, create_llm_client
import google.generativeai as genai
from email_service import router as email_router

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, environment variables should be set manually
    pass

# Set DISABLE_LLM from environment variable (default to True if not set)
DISABLE_LLM = os.getenv('DISABLE_LLM', 'true').lower() in ('1', 'true', 'yes')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LLMSummaryRequest(BaseModel):
    text: str

# --- Gemini LLM client cache ---
gemini_api_key = os.getenv("GEMINI_API_KEY")
gemini_model = DEFAULT_MODELS["gemini"]
gemini_client = None
if gemini_api_key:
    try:
        gemini_client = create_llm_client("gemini", api_key=gemini_api_key, model=gemini_model)
    except Exception as e:
        print(f"Error initializing Gemini client: {e}")

@app.post("/llm-summary")
async def llm_summary(data: LLMSummaryRequest):
    """
    Generate a summary using Gemini LLM for the given text.
    """
    if DISABLE_LLM:
        # Return a random summary for testing
        random_summaries = [
            "The team discussed lighting and animation improvements.",
            "Minor tweaks needed for character animation; background approved.",
            "Action items: soften shadows, adjust highlight gain, improve hand motion.",
            "Most notes addressed; only a few minor issues remain.",
            "Ready for final review after next round of changes.",
            "Feedback: color grade is close, but highlights too hot.",
            "Artist to be notified about animation and lighting feedback.",
            "Overall progress is good; next steps communicated to the team."
        ]
        return {"summary": random.choice(random_summaries)}
    try:
        if not gemini_client:
            raise HTTPException(status_code=500, detail="Gemini client not initialized.")
        summary = summarize_gemini(data.text, gemini_model, gemini_client)
        return {"summary": summary}
    except Exception as e:
        print(f"Error in /llm-summary: {e}")
        raise HTTPException(status_code=500, detail=f"LLM summary error: {str(e)}")

# Register playlist router
app.include_router(playlist_router)
app.include_router(email_router)
