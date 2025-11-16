"""
Vexa WebSocket Service
Real-time transcription streaming using WebSocket connection
"""

import json
import time
from typing import Any, Dict, List, Optional, Set

from PySide6.QtCore import QObject, QTimer, QUrl, Signal
from PySide6.QtWebSockets import QWebSocket


class VexaWebSocketService(QObject):
    """WebSocket service for real-time Vexa transcription streaming"""

    # Signals for WebSocket events
    connected = Signal()
    disconnected = Signal()
    error = Signal(str)

    # Signals for transcript events
    transcriptMutableReceived = Signal(list)  # List of segments (mutable/in-progress)
    transcriptFinalizedReceived = Signal(list)  # List of segments (finalized)
    transcriptInitialReceived = Signal(list)  # Initial transcript dump
    meetingStatusChanged = Signal(str)  # Meeting status (active, completed, etc.)
    transcriptPaused = Signal(float)  # Emitted when paused, with pause timestamp
    transcriptResumed = Signal()  # Emitted when resumed

    # Signal for subscription confirmation
    subscribed = Signal(list)  # List of meeting IDs
    unsubscribed = Signal(list)  # List of meeting IDs

    def __init__(self, api_key: str, api_url: str = "https://api.cloud.vexa.ai"):
        super().__init__()
        self.api_key = api_key
        self.api_url = api_url
        self.ws_url = self._convert_to_ws_url(api_url)

        # WebSocket instance
        self.ws: Optional[QWebSocket] = None

        # Connection state
        self._is_connected = False
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_timer = QTimer()
        self._reconnect_timer.timeout.connect(self._attempt_reconnect)

        # Subscribed meetings tracking
        self._subscribed_meetings: Set[str] = set()  # Format: "platform/native_id"

        # Transcript streaming control
        self._is_paused = False
        self._pause_timestamp = None  # Track when pause was initiated

        # Ping timer to keep connection alive
        self._ping_timer = QTimer()
        self._ping_timer.timeout.connect(self._send_ping)

    def _convert_to_ws_url(self, api_url: str) -> str:
        """Convert HTTP(S) API URL to WebSocket URL"""
        if api_url.startswith("https://"):
            return api_url.replace("https://", "wss://") + "/ws"
        elif api_url.startswith("http://"):
            return api_url.replace("http://", "ws://") + "/ws"
        else:
            # Default to secure WebSocket
            return "wss://api.cloud.vexa.ai/ws"

    def connect_to_server(self):
        """Establish WebSocket connection to Vexa API"""
        if self._is_connected and self.ws:
            print("WebSocket already connected")
            return

        print(f"Connecting to WebSocket: {self.ws_url}")

        # Create new WebSocket instance
        self.ws = QWebSocket()

        # Connect Qt signals
        self.ws.connected.connect(self._on_connected)
        self.ws.disconnected.connect(self._on_disconnected)
        self.ws.textMessageReceived.connect(self._on_message_received)
        self.ws.errorOccurred.connect(self._on_error)

        # Build WebSocket URL with API key
        url = QUrl(f"{self.ws_url}?api_key={self.api_key}")

        # Open connection
        self.ws.open(url)

    def disconnect_from_server(self):
        """Close WebSocket connection"""
        if self.ws:
            print("Disconnecting from WebSocket")
            self._subscribed_meetings.clear()
            self._ping_timer.stop()
            self._reconnect_timer.stop()
            self.ws.close()
            self.ws = None
            self._is_connected = False

    def subscribe_to_meeting(self, platform: str, native_meeting_id: str):
        """
        Subscribe to real-time transcript updates for a meeting

        Args:
            platform: Meeting platform (e.g., 'google_meet', 'zoom', 'teams')
            native_meeting_id: Native meeting ID from the platform
        """
        if not self._is_connected or not self.ws:
            print("ERROR: WebSocket not connected, cannot subscribe")
            return

        meeting_key = f"{platform}/{native_meeting_id}"
        self._subscribed_meetings.add(meeting_key)

        # Build subscription message - use both key formats for compatibility
        message = {
            "action": "subscribe",
            "meetings": [
                {
                    "platform": platform,
                    "native_id": native_meeting_id,
                    "native_meeting_id": native_meeting_id,  # Both keys for compatibility
                }
            ],
        }

        print(f"Subscribing to meeting: {meeting_key}")
        self.ws.sendTextMessage(json.dumps(message))

    def unsubscribe_from_meeting(self, platform: str, native_meeting_id: str):
        """
        Unsubscribe from meeting transcript updates

        Args:
            platform: Meeting platform
            native_meeting_id: Native meeting ID
        """
        if not self._is_connected or not self.ws:
            print("WebSocket not connected")
            return

        meeting_key = f"{platform}/{native_meeting_id}"
        self._subscribed_meetings.discard(meeting_key)

        # Build unsubscription message
        message = {
            "action": "unsubscribe",
            "meetings": [
                {
                    "platform": platform,
                    "native_id": native_meeting_id,
                    "native_meeting_id": native_meeting_id,
                }
            ],
        }

        print(f"Unsubscribing from meeting: {meeting_key}")
        self.ws.sendTextMessage(json.dumps(message))

    def is_connected(self) -> bool:
        """Check if WebSocket is connected"""
        return self._is_connected

    def get_subscribed_meetings(self) -> List[str]:
        """Get list of subscribed meeting keys"""
        return list(self._subscribed_meetings)

    def pause_transcript(self):
        """Pause transcript streaming - messages will be received but not emitted"""
        import time
        self._is_paused = True
        self._pause_timestamp = time.time()
        print(f"Transcript streaming paused at {self._pause_timestamp}")
        self.transcriptPaused.emit(self._pause_timestamp)

    def play_transcript(self):
        """Resume transcript streaming"""
        self._is_paused = False
        self._pause_timestamp = None
        print("Transcript streaming resumed")
        self.transcriptResumed.emit()

    def is_paused(self) -> bool:
        """Check if transcript streaming is paused"""
        return self._is_paused

    # ===== Qt Slot Handlers =====

    def _on_connected(self):
        """Handle WebSocket connection established"""
        print("WebSocket connected successfully")
        self._is_connected = True
        self._reconnect_attempts = 0
        self._reconnect_timer.stop()

        # Start ping timer (every 30 seconds)
        self._ping_timer.start(30000)

        # Emit connected signal
        self.connected.emit()

    def _on_disconnected(self):
        """Handle WebSocket disconnection"""
        print("❌ WebSocket disconnected")
        self._is_connected = False
        self._ping_timer.stop()

        # Emit disconnected signal
        self.disconnected.emit()

        # Attempt to reconnect if we have subscribed meetings
        if (
            self._subscribed_meetings
            and self._reconnect_attempts < self._max_reconnect_attempts
        ):
            self._schedule_reconnect()

    def _on_error(self, error_code):
        """Handle WebSocket error"""
        error_msg = f"WebSocket error: {error_code}"
        if self.ws:
            error_msg += f" - {self.ws.errorString()}"

        print(f"{error_msg}")
        self.error.emit(error_msg)

    def _on_message_received(self, message: str):
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            message_type = data.get("type", "unknown")

            # Check if paused and discard transcript messages immediately
            if self._is_paused and message_type in ["transcript.initial", "transcript.mutable", "transcript.finalized"]:
                # Silently discard - don't even log it
                return

            # Debug logging
            if message_type not in ["pong"]:  # Don't log pong messages
                print(f"WebSocket message: {message_type}")

            # Route message based on type
            if message_type == "transcript.initial":
                self._handle_transcript_initial(data)
            elif message_type == "transcript.mutable":
                self._handle_transcript_mutable(data)
            elif message_type == "transcript.finalized":
                self._handle_transcript_finalized(data)
            elif message_type == "meeting.status":
                self._handle_meeting_status(data)
            elif message_type == "subscribed":
                self._handle_subscribed(data)
            elif message_type == "unsubscribed":
                self._handle_unsubscribed(data)
            elif message_type == "pong":
                # Pong response to keep connection alive
                pass
            elif message_type == "error":
                error_msg = data.get("error", "Unknown error")
                print(f"Server error: {error_msg}")
                self.error.emit(error_msg)
            else:
                print(f"Unknown message type: {message_type}")

        except json.JSONDecodeError as e:
            print(f"Failed to parse WebSocket message: {e}")
        except Exception as e:
            print(f"Error processing WebSocket message: {e}")

    # ===== Message Handlers =====

    def _handle_transcript_initial(self, data: Dict[str, Any]):
        """Handle initial transcript dump (treat same as mutable)"""
        print("🟣 Received transcript.initial")
        segments = self._extract_segments(data)
        if segments:
            converted_segments = [self._convert_segment(seg) for seg in segments]
            self.transcriptInitialReceived.emit(converted_segments)
            # Also emit as mutable for consistent handling
            self.transcriptMutableReceived.emit(converted_segments)

    def _handle_transcript_mutable(self, data: Dict[str, Any]):
        """Handle mutable (in-progress) transcript segments"""
        print("Received transcript.mutable")
        segments = self._extract_segments(data)
        if segments:
            converted_segments = [self._convert_segment(seg) for seg in segments]
            print(f"  Processing {len(converted_segments)} mutable segments")
            self.transcriptMutableReceived.emit(converted_segments)

    def _handle_transcript_finalized(self, data: Dict[str, Any]):
        """Handle finalized (completed) transcript segments"""
        print("Received transcript.finalized")
        segments = self._extract_segments(data)
        if segments:
            converted_segments = [self._convert_segment(seg) for seg in segments]
            print(f"  Processing {len(converted_segments)} finalized segments")
            self.transcriptFinalizedReceived.emit(converted_segments)

    def _handle_meeting_status(self, data: Dict[str, Any]):
        """Handle meeting status change"""
        payload = data.get("payload", {})
        status = payload.get("status", "unknown")
        print(f"Meeting status: {status}")
        self.meetingStatusChanged.emit(status)

    def _handle_subscribed(self, data: Dict[str, Any]):
        """Handle subscription confirmation"""
        meetings = data.get("meetings", [])
        print(f"Subscription confirmed for {len(meetings)} meetings")
        self.subscribed.emit(meetings)

    def _handle_unsubscribed(self, data: Dict[str, Any]):
        """Handle unsubscription confirmation"""
        meetings = data.get("meetings", [])
        print(f"Unsubscription confirmed for {len(meetings)} meetings")
        self.unsubscribed.emit(meetings)

    # ===== Helper Methods =====

    def _extract_segments(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract segments from WebSocket message payload

        Args:
            data: WebSocket message data

        Returns:
            List of segment dictionaries
        """
        payload = data.get("payload", {})

        # Try to find segments in different possible locations
        if "segments" in payload and isinstance(payload["segments"], list):
            return payload["segments"]
        elif "segment" in payload:
            return [payload["segment"]]
        elif isinstance(payload, list):
            return payload
        else:
            return []

    def _convert_segment(self, segment: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert WebSocket segment to standard format

        Args:
            segment: Raw segment from WebSocket

        Returns:
            Converted segment dictionary
        """
        # Extract text from various possible locations
        text = (
            segment.get("text")
            or segment.get("content")
            or segment.get("transcript")
            or segment.get("message")
            or ""
        )

        # Extract timestamps
        timestamp = (
            segment.get("absolute_start_time")
            or segment.get("timestamp")
            or segment.get("updated_at")
        )
        if not timestamp:
            timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.%fZ", time.gmtime())

        # Generate ID
        segment_id = segment.get("id")
        if not segment_id:
            start_time = segment.get("start_time") or segment.get("startTime") or 0
            session_uid = segment.get("session_uid", "")
            if session_uid and start_time:
                segment_id = f"{session_uid}-{start_time}"
            else:
                segment_id = f"ws-{time.time()}-{id(segment)}"

        # Build converted segment
        converted = {
            "id": segment_id,
            "text": text.strip(),
            "timestamp": timestamp,
            "speaker": segment.get("speaker")
            or segment.get("speaker_name")
            or "Unknown",
            "language": segment.get("language") or segment.get("lang") or "en",
        }

        # Preserve absolute time fields for proper merging/sorting
        if segment.get("absolute_start_time"):
            converted["absolute_start_time"] = segment["absolute_start_time"]
        if segment.get("absolute_end_time"):
            converted["absolute_end_time"] = segment["absolute_end_time"]
        if segment.get("updated_at"):
            converted["updated_at"] = segment["updated_at"]

        return converted

    def _send_ping(self):
        """Send ping to keep connection alive"""
        if self._is_connected and self.ws:
            self.ws.sendTextMessage(json.dumps({"action": "ping"}))

    def _schedule_reconnect(self):
        """Schedule reconnection attempt with exponential backoff"""
        self._reconnect_attempts += 1
        delay = min(
            1000 * (2 ** (self._reconnect_attempts - 1)), 30000
        )  # Max 30 seconds
        print(
            f"Scheduling reconnect attempt {self._reconnect_attempts}/{self._max_reconnect_attempts} in {delay}ms"
        )
        self._reconnect_timer.start(delay)

    def _attempt_reconnect(self):
        """Attempt to reconnect to WebSocket"""
        self._reconnect_timer.stop()
        print(
            f"Attempting to reconnect (attempt {self._reconnect_attempts}/{self._max_reconnect_attempts})"
        )
        self.connect_to_server()

        # Re-subscribe to meetings after reconnection
        if self._is_connected:
            for meeting_key in self._subscribed_meetings:
                platform, native_id = meeting_key.split("/", 1)
                self.subscribe_to_meeting(platform, native_id)
