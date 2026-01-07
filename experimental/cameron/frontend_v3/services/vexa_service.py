"""
Vexa Transcription Service
Handles communication with Vexa API for meeting transcription
"""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests


@dataclass
class TranscriptionSegment:
    """Single transcription segment"""

    id: str
    text: str
    timestamp: str
    speaker: Optional[str] = None
    language: Optional[str] = None


@dataclass
class TranscriptionData:
    """Full transcription data for a meeting"""

    meeting_id: str
    language: str
    segments: List[Dict[str, Any]]
    status: str  # active, completed, stopped, error
    last_updated: str


class VexaService:
    """Service for Vexa API communication"""

    def __init__(self, api_key: str, api_url: str = "https://api.cloud.vexa.ai"):
        self.api_key = api_key
        self.api_url = api_url

    def _get_headers(self) -> Dict[str, str]:
        """Get headers with API key"""
        return {"Content-Type": "application/json", "X-API-Key": self.api_key}

    def _parse_meeting_url(self, meeting_url: str) -> tuple:
        """Parse meeting URL to extract platform and ID"""
        meeting_url = meeting_url.strip()

        if "google.com/meet" in meeting_url or "meet.google.com" in meeting_url:
            # Extract meeting ID from Google Meet URL
            # Format: https://meet.google.com/abc-defg-hij
            meeting_id = meeting_url.split("/")[-1].split("?")[0]
            return "google_meet", meeting_id
        elif "teams.microsoft.com" in meeting_url:
            return "teams", meeting_url
        elif "zoom.us" in meeting_url:
            # Extract meeting ID from Zoom URL
            meeting_id = meeting_url.split("/")[-1].split("?")[0]
            return "zoom", meeting_id
        else:
            # Assume it's already a meeting ID
            return "google_meet", meeting_url

    def start_transcription(
        self, meeting_url: str, language: str = "auto", bot_name: str = "Dailies Notes Assistant"
    ) -> Dict[str, Any]:
        """Start bot for meeting"""
        try:
            platform, native_meeting_id = self._parse_meeting_url(meeting_url)

            payload = {
                "platform": platform,
                "native_meeting_id": native_meeting_id,
                "bot_name": bot_name,
                "language": None if language == "auto" else language,
            }

            print(
                f"Starting Vexa bot for {platform} meeting: {native_meeting_id[:20]}..."
            )

            response = requests.post(
                f"{self.api_url}/bots", json=payload, headers=self._get_headers()
            )

            if response.status_code in [200, 201, 202]:
                print(f"✓ Bot started successfully")

                # Try to get internal meeting ID
                try:
                    meetings_response = self.get_meetings()
                    for meeting in meetings_response.get("meetings", []):
                        if (
                            meeting.get("platform") == platform
                            and meeting.get("native_meeting_id") == native_meeting_id
                        ):
                            meeting_id = (
                                f"{platform}/{native_meeting_id}/{meeting.get('id')}"
                            )
                            print(f"  Meeting ID: {meeting_id}")
                            return {"success": True, "meeting_id": meeting_id}
                except Exception as e:
                    print(f"  Could not get internal meeting ID: {e}")

                meeting_id = f"{platform}/{native_meeting_id}"
                return {"success": True, "meeting_id": meeting_id}
            else:
                error_msg = f"Failed to start transcription: {response.status_code}"
                if response.text:
                    error_msg += f" - {response.text}"
                raise Exception(error_msg)

        except Exception as e:
            print(f"ERROR: Failed to start transcription: {e}")
            raise

    def stop_transcription(self, meeting_id: str) -> Dict[str, Any]:
        """Stop bot for meeting"""
        try:
            parts = meeting_id.split("/")
            platform = parts[0]
            native_meeting_id = parts[1]

            print(
                f"Stopping Vexa bot for {platform} meeting: {native_meeting_id[:20]}..."
            )

            response = requests.delete(
                f"{self.api_url}/bots/{platform}/{native_meeting_id}",
                headers=self._get_headers(),
            )

            if response.status_code in [200, 202, 204]:
                print(f"✓ Bot stopped successfully")
                return {"success": True}
            else:
                error_msg = f"Failed to stop transcription: {response.status_code}"
                if response.text:
                    error_msg += f" - {response.text}"
                raise Exception(error_msg)

        except Exception as e:
            print(f"ERROR: Failed to stop transcription: {e}")
            raise

    def get_transcription(self, meeting_id: str) -> TranscriptionData:
        """Get current transcription for meeting"""
        try:
            parts = meeting_id.split("/")
            platform = parts[0]
            native_meeting_id = parts[1]
            internal_id = parts[2] if len(parts) > 2 else None

            url = f"{self.api_url}/transcripts/{platform}/{native_meeting_id}"
            if internal_id:
                url += f"?meeting_id={internal_id}"

            response = requests.get(url, headers=self._get_headers())

            if response.status_code == 200:
                data = response.json()

                # Extract segments from various possible response formats
                segments_api = (
                    data.get("segments")
                    or (
                        data.get("transcript", {}).get("segments")
                        if data.get("transcript")
                        else []
                    )
                    or []
                )

                segments = []
                for seg in segments_api:
                    segment = {
                        "id": seg.get("absolute_start_time")
                        or seg.get("timestamp", ""),
                        "text": seg.get("text", ""),
                        "timestamp": seg.get("absolute_start_time")
                        or seg.get("timestamp", ""),
                        "speaker": seg.get("speaker", "Unknown"),
                        "language": seg.get("language"),
                    }
                    segments.append(segment)

                return TranscriptionData(
                    meeting_id=meeting_id,
                    language=data.get("language", "auto"),
                    segments=segments,
                    status=data.get("status", "active"),
                    last_updated=datetime.now().isoformat(),
                )
            else:
                error_msg = f"Failed to get transcription: {response.status_code}"
                if response.text:
                    error_msg += f" - {response.text}"
                raise Exception(error_msg)

        except Exception as e:
            print(f"ERROR: Failed to get transcription: {e}")
            raise

    def get_meetings(self) -> Dict[str, Any]:
        """Get list of all meetings"""
        try:
            response = requests.get(
                f"{self.api_url}/meetings", headers=self._get_headers()
            )

            if response.status_code == 200:
                return response.json()
            else:
                error_msg = f"Failed to get meetings: {response.status_code}"
                if response.text:
                    error_msg += f" - {response.text}"
                raise Exception(error_msg)

        except Exception as e:
            print(f"ERROR: Failed to get meetings: {e}")
            raise

    def update_language(self, meeting_id: str, language: str) -> Dict[str, Any]:
        """Update transcription language for a meeting"""
        try:
            parts = meeting_id.split("/")
            platform = parts[0]
            native_meeting_id = parts[1]

            payload = {"language": None if language == "auto" else language}

            response = requests.patch(
                f"{self.api_url}/bots/{platform}/{native_meeting_id}",
                json=payload,
                headers=self._get_headers(),
            )

            if response.status_code == 200:
                print(f"✓ Language updated to: {language}")
                return {"success": True}
            else:
                error_msg = f"Failed to update language: {response.status_code}"
                if response.text:
                    error_msg += f" - {response.text}"
                raise Exception(error_msg)

        except Exception as e:
            print(f"ERROR: Failed to update language: {e}")
            raise
