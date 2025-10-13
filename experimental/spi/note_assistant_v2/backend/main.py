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

class EmailNotesRequest(BaseModel):
    email: EmailStr
    notes: list

# --- Gmail API for email delivery ---
import base64
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

SCOPES = ['https://www.googleapis.com/auth/gmail.send']
CREDENTIALS_FILE = 'client_secret.json'  # Place this in your backend dir
TOKEN_FILE = 'token.json'
GMAIL_SENDER = os.getenv('GMAIL_SENDER') or 'loorthu@imageworks.com'

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def create_gmail_message(sender, to, subject, html_content):
    message = MIMEText(html_content, 'html')
    message['to'] = to
    message['from'] = sender
    message['subject'] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}

def send_gmail_email(to, subject, html_content):
    service = get_gmail_service()
    message = create_gmail_message(GMAIL_SENDER, to, subject, html_content)
    sent = service.users().messages().send(userId="me", body=message).execute()
    return sent

@app.post("/email-notes")
async def email_notes(data: EmailNotesRequest, background_tasks: BackgroundTasks):
    """
    Send the notes as an HTML table to the given email address using Gmail API.
    """
    # Build HTML table
    html = """
    <h2>Dailies Shot Notes</h2>
    <table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;font-family:sans-serif;'>
      <thead>
        <tr style='background:#f1f5f9;'>
          <th>Shot/Version</th>
          <th>Notes</th>
          <th>Transcription</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>
    """
    for row in data.notes:
        html += f"<tr>"
        html += f"<td>{row.get('shot','')}</td>"
        html += f"<td>{row.get('notes','').replace(chr(10),'<br>')}</td>"
        html += f"<td>{row.get('transcription','').replace(chr(10),'<br>')}</td>"
        html += f"<td>{row.get('summary','').replace(chr(10),'<br>')}</td>"
        html += "</tr>"
    html += "</tbody></table>"
    subject = "Dailies Shot Notes"
    def send_task():
        send_gmail_email(data.email, subject, html)
    background_tasks.add_task(send_task)
    return {"status": "success", "message": f"Notes sent to {data.email}"}

# Register playlist router
app.include_router(playlist_router)
