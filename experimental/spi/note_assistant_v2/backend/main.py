from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import os
import json
import asyncio
from collections import deque
from datetime import datetime
from playlist import router as playlist_router
from vexa_client import VexaClient, VexaClientError
import random

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, environment variables should be set manually
    pass

DISABLE_VEXA = True

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
    Returns only an array of audio transcripts (segment['text']), ignoring the last segment.
    
    Args:
        platform: Meeting platform (e.g., 'google_meet')
        meeting_id: Platform-specific meeting ID
        last_segment_index: Optional index of last received segment. If provided,
                          only returns segments after this index for incremental updates.
    """
    if DISABLE_VEXA:
        # For testing, return a random string
        random_texts = [
            "Speaker1: This is a test transcript.",
            "Speaker2: Another random transcript line.",
            "Speaker3: Yet another transcript entry.",
            "Speaker4: Randomized transcript for testing.",
            "Speaker5: Final test transcript string.",
            "Speaker6: The quick brown fox jumps over the lazy dog.",
            "Speaker7: Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
            "Speaker8: Testing, one, two, three.",
            "Speaker9: This is a longer transcript example for robustness.",
            "Speaker10: Can you hear me now? Yes, I can hear you.",
            "Speaker11: Let's try a different sentence for variety.",
            "Speaker12: Randomized input for frontend testing.",
            "Speaker13: Another example of a transcript line.",
            "Speaker14: This should appear randomly in your app.",
            "Speaker15: End of the random transcript list."
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
        # Return only the array of transcript texts in 'speaker: text' format
        transcript_texts = [f"{segment['speaker']}: {segment['text']}" for segment in segments if 'text' in segment and 'speaker' in segment]
        return transcript_texts
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
