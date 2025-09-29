from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Dict, Any, Optional
import os
import json
import asyncio
from collections import deque
from datetime import datetime
from playlist import router as playlist_router
from vexa_client import VexaClient, VexaClientError
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

DISABLE_VEXA = True
DISABLE_LLM = True

# Global webhook event storage
webhook_events = deque(maxlen=100)  # Store last 100 events
webhook_subscribers = []  # List of active SSE connections

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize VexaClient with API key from environment variable
vexa_client = VexaClient(api_key=os.getenv('VEXA_API_KEY'))

class MeetID(BaseModel):
    meet_id: str

@app.post("/submit-meet-id")
async def submit_meet_id(data: MeetID, request: Request):
    if DISABLE_VEXA:
        # Return a mock response for testing
        return {
            "status": "success",
            "meet_id": data.meet_id,
            "message": "(TEST MODE) Bot has been requested to join the meeting",
            "bot_result": {"test": True},
            "webhook_configured": True
        }
    try:
        print(f"Received Google Meet ID: {data.meet_id}")
        

        
        # Request bot to join the Google Meet
        result = vexa_client.request_bot(
            platform="google_meet",
            native_meeting_id=data.meet_id
        )        
        print(f"Bot request successful: {result}")

        # Configure webhook URL to point to our backend
        # webhook_url = "http://localhost:8000/webhook"
        webhook_url = "https://5e6c6dca6403.ngrok-free.app/webhook"  # Use ngrok URL for testing
        try:
            vexa_client.set_webhook_url(webhook_url)
            print(f"✅ Webhook URL configured: {webhook_url}")
            webhook_configured = True
        except Exception as webhook_error:
            print(f"⚠️ Warning: Failed to set webhook URL: {webhook_error}")
            # Continue anyway, webhooks are optional
            webhook_configured = False

        return {
            "status": "success", 
            "meet_id": data.meet_id,
            "message": "Bot has been requested to join the meeting",
            "bot_result": result,
            "webhook_configured": webhook_configured
        }
        
    except VexaClientError as e:
        print(f"Error requesting bot: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to request bot: {str(e)}")
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/transcripts/{platform}/{meeting_id}")
async def get_transcripts(platform: str, meeting_id: str, last_segment_index: Optional[int] = None):
    """
    Proxy endpoint to fetch transcripts from Vexa API.
    This keeps the API key secure on the backend.
    Returns an array of transcript segments with 'speaker', 'start', and 'text'.
    """
    if DISABLE_VEXA:
        # For testing, return a random segment
        random_texts = [
            {"speaker": "KJ", "start": 0.0, "text": "The lighting on this shot looks great, but I think the shadows could be softer."},
            {"speaker": "BH", "start": 5.2, "text": "Agreed, maybe the artist can try a different falloff on the key light?"},
            {"speaker": "CR", "start": 10.1, "text": "I'll make a note to ask for a softer shadow pass."},
            {"speaker": "KJ", "start": 15.0, "text": "The character's expression is much improved from the last version."},
            {"speaker": "BH", "start": 20.3, "text": "Yes, but the hand movement still feels a bit stiff."},
            {"speaker": "CR", "start": 25.7, "text": "Should we suggest a reference for more natural hand motion?"},
            {"speaker": "KJ", "start": 30.0, "text": "Let's approve the background, but request tweaks on the character animation."},
            {"speaker": "BH", "start": 35.2, "text": "I'll mark the background as finalled in ShotGrid."},
            {"speaker": "CR", "start": 40.1, "text": "I'll send the artist a note about the animation feedback."},
            {"speaker": "KJ", "start": 45.0, "text": "The color grade is close, but the highlights are a bit too hot."},
            {"speaker": "BH", "start": 50.3, "text": "Maybe ask the artist to bring down the highlight gain by 10%."},
            {"speaker": "CR", "start": 55.7, "text": "Noted, I'll include that in the feedback summary."},
            {"speaker": "KJ", "start": 60.0, "text": "Great progress overall, just a few minor notes for the next version."},
            {"speaker": "BH", "start": 65.2, "text": "Let's target final for the next review if these are addressed."},
            {"speaker": "CR", "start": 70.1, "text": "I'll communicate the action items and next steps to the artist."}
        ]
        return [random.choice(random_texts)]
    try:
        transcript_data = vexa_client.get_transcript(platform, meeting_id)
        segments = transcript_data.get('segments', [])
        # Ignore the last segment, it may be incomplete or re-processed by Vexa
        if len(segments) > 1:
            segments = segments[:-1]
        elif len(segments) == 1:
            segments = []
        # If last_segment_index is provided, filter to return only new segments
        if last_segment_index is not None and segments:
            segments = [segment for i, segment in enumerate(segments) if i > last_segment_index]
        # Return only the array of dicts with 'speaker', 'start', 'text'
        transcript_segments = [
            {"speaker": segment.get("speaker", ""), "start": segment.get("start", 0.0), "text": segment.get("text", "")}
            for segment in segments if 'text' in segment and 'speaker' in segment
        ]
        return transcript_segments
    except VexaClientError as e:
        print(f"Error fetching transcript: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch transcript: {str(e)}")
    except Exception as e:
        print(f"Unexpected error fetching transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/webhook")
async def receive_webhook(request: Request):
    """
    Endpoint to receive webhook notifications from Vexa API.
    Stores events and broadcasts them to SSE subscribers.
    """
    try:
        webhook_data = await request.json()
        
        # Add timestamp to webhook data
        webhook_event = {
            **webhook_data,
            "received_at": datetime.now().isoformat(),
            "event_id": len(webhook_events)  # Simple ID based on count
        }
        
        # Store the event
        webhook_events.append(webhook_event)
        
        # Broadcast to all SSE subscribers
        dead_subscribers = []
        for subscriber_queue in webhook_subscribers:
            try:
                await subscriber_queue.put(webhook_event)
            except:
                # Mark dead subscribers for removal
                dead_subscribers.append(subscriber_queue)
        
        # Clean up dead subscribers
        for dead_sub in dead_subscribers:
            webhook_subscribers.remove(dead_sub)
        
        print(f"📡 Webhook received and broadcast to {len(webhook_subscribers)} subscribers")
        print(f"   Event: {webhook_data.get('event_type', 'unknown')}")
        print(f"   Meeting: {webhook_data.get('native_meeting_id', 'N/A')}")
        print(f"   Status: {webhook_data.get('status', 'N/A')}")
        
        return {"status": "success", "message": "Webhook received and broadcast"}
        
    except Exception as e:
        print(f"Error processing webhook: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process webhook: {str(e)}")

@app.get("/webhook-events")
async def webhook_events_stream():
    """
    Server-Sent Events endpoint for real-time webhook notifications.
    """
    async def event_generator():
        # Create a queue for this subscriber
        subscriber_queue = asyncio.Queue()
        webhook_subscribers.append(subscriber_queue)
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'event_type': 'connection', 'message': 'Connected to webhook stream'})}\n\n"
            
            # Send recent events (last 5)
            recent_events = list(webhook_events)[-5:] if webhook_events else []
            for event in recent_events:
                yield f"data: {json.dumps(event)}\n\n"
            
            # Stream new events
            while True:
                try:
                    # Wait for new events with timeout
                    event = await asyncio.wait_for(subscriber_queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive message
                    yield f"data: {json.dumps({'event_type': 'keepalive', 'timestamp': datetime.now().isoformat()})}\n\n"
                    
        except Exception as e:
            print(f"SSE client disconnected: {e}")
        finally:
            # Clean up when client disconnects
            if subscriber_queue in webhook_subscribers:
                webhook_subscribers.remove(subscriber_queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        }
    )

@app.get("/bot-status/{platform}/{meeting_id}")
async def get_bot_status(platform: str, meeting_id: str):
    """
    Returns the current status of the bot for a given meeting.
    """
    if DISABLE_VEXA:
        # Return a mock status for testing
        return {"status": "test-mode-running"}
    try:
        meeting = vexa_client.get_meeting_by_id(platform, meeting_id)
        if meeting is None:
            return {"status": "unknown"}
        return {"status": meeting.get("status", "unknown")}
    except Exception as e:
        print(f"Error fetching bot status: {e}")
        return {"status": "error", "detail": str(e)}

@app.post("/stop-bot/{platform}/{meeting_id}")
async def stop_bot(platform: str, meeting_id: str):
    """
    Stops the bot for a given meeting.
    
    Args:
        platform: Meeting platform (e.g., 'google_meet')
        meeting_id: Platform-specific meeting ID
    """
    if DISABLE_VEXA:
        # Return a mock stop result for testing
        return {"status": "success", "result": "(TEST MODE) Bot stopped."}
    try:
        result = vexa_client.stop_bot(platform, meeting_id)
        return {"status": "success", "result": result}
    except Exception as e:
        print(f"Error stopping bot: {e}")
        return {"status": "error", "detail": str(e)}

# Register playlist router
app.include_router(playlist_router)

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
