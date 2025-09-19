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

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, environment variables should be set manually
    pass

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
    
    Args:
        platform: Meeting platform (e.g., 'google_meet')
        meeting_id: Platform-specific meeting ID
        last_segment_index: Optional index of last received segment. If provided,
                          only returns segments after this index for incremental updates.
    """
    try:
        # Get full transcript data from Vexa API
        transcript_data = vexa_client.get_transcript(platform, meeting_id)
        
        # If last_segment_index is provided, filter to return only new segments
        if last_segment_index is not None and 'segments' in transcript_data:
            original_segments = transcript_data['segments']
            
            # Filter segments to only include those after the last_segment_index
            new_segments = [
                segment for i, segment in enumerate(original_segments) 
                if i > last_segment_index
            ]
            
            # Create response with only new segments
            filtered_response = {
                **transcript_data,  # Keep all other fields (meeting info, etc.)
                'segments': new_segments,
                'total_segments': len(original_segments),  # Total count for reference
                'new_segments_count': len(new_segments),   # Count of new segments
                'last_segment_index': len(original_segments) - 1 if original_segments else -1
            }
            
            print(f"Incremental transcript request: returned {len(new_segments)} new segments "
                  f"(total: {len(original_segments)}, last_index: {last_segment_index})")
            
            return filtered_response
        else:
            # Return full transcript for initial request
            if 'segments' in transcript_data:
                transcript_data['last_segment_index'] = len(transcript_data['segments']) - 1
                transcript_data['total_segments'] = len(transcript_data['segments'])
                transcript_data['new_segments_count'] = len(transcript_data['segments'])
            
            print(f"Full transcript request: returned {transcript_data.get('total_segments', 0)} segments")
            return transcript_data
            
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

# Register playlist router
app.include_router(playlist_router)
