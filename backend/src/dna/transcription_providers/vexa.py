"""Vexa Transcription Provider.

Implementation of the transcription provider using Vexa API.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

from dna.models.transcription import (
    BotSession,
    BotStatus,
    BotStatusEnum,
    Platform,
    Transcript,
    TranscriptSegment,
)
from dna.transcription_providers.transcription_provider_base import (
    EventCallback,
    TranscriptionProviderBase,
)

logger = logging.getLogger(__name__)


class VexaTranscriptionProvider(TranscriptionProviderBase):
    """Transcription provider implementation using Vexa API."""

    def __init__(self):
        self.base_url = os.getenv("VEXA_API_URL", "https://api.cloud.vexa.ai")
        self.api_key = os.getenv("VEXA_API_KEY", "")
        self._client: Optional[httpx.AsyncClient] = None
        self._ws_connection: Optional[websockets.WebSocketClientProtocol] = None
        self._ws_task: Optional[asyncio.Task[None]] = None
        self._subscribed_meetings: dict[str, EventCallback] = {}
        self._meeting_id_to_key: dict[int, str] = {}
        self._pending_subscriptions: list[str] = []
        self._ws_lock = asyncio.Lock()

    @property
    def ws_url(self) -> str:
        http_url = self.base_url.rstrip("/")
        if http_url.startswith("https://"):
            return http_url.replace("https://", "wss://") + "/ws"
        elif http_url.startswith("http://"):
            return http_url.replace("http://", "ws://") + "/ws"
        return f"wss://{http_url}/ws"

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def dispatch_bot(
        self,
        platform: Platform,
        meeting_id: str,
        playlist_id: int,
        passcode: Optional[str] = None,
        bot_name: Optional[str] = None,
        language: Optional[str] = None,
    ) -> BotSession:
        """Dispatch a bot to join a meeting and start transcription."""
        payload = {
            "platform": platform.value,
            "native_meeting_id": meeting_id,
        }

        if passcode:
            payload["passcode"] = passcode
        if bot_name:
            payload["bot_name"] = bot_name
        if language:
            payload["language"] = language

        response = await self.client.post("/bots", json=payload)
        response.raise_for_status()

        data = response.json()
        vexa_meeting_id = data.get("meeting_id") or data.get("id")

        return BotSession(
            platform=platform,
            meeting_id=meeting_id,
            playlist_id=playlist_id,
            status=BotStatusEnum.JOINING,
            vexa_meeting_id=vexa_meeting_id,
            bot_name=bot_name,
            language=language,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

    async def stop_bot(self, platform: Platform, meeting_id: str) -> bool:
        """Stop a bot that is currently in a meeting."""
        response = await self.client.delete(f"/bots/{platform.value}/{meeting_id}")
        return response.status_code == 200

    async def get_bot_status(self, platform: Platform, meeting_id: str) -> BotStatus:
        """Get the current status of a bot by querying meetings endpoint."""
        try:
            response = await self.client.get("/meetings")
            response.raise_for_status()
            data = response.json()
            meetings = data.get("meetings", [])

            status_map = {
                "requested": BotStatusEnum.JOINING,
                "joining": BotStatusEnum.JOINING,
                "awaiting_admission": BotStatusEnum.WAITING_ROOM,
                "active": BotStatusEnum.IN_CALL,
                "in_call": BotStatusEnum.IN_CALL,
                "transcribing": BotStatusEnum.TRANSCRIBING,
                "recording": BotStatusEnum.TRANSCRIBING,
                "failed": BotStatusEnum.FAILED,
                "stopped": BotStatusEnum.STOPPED,
                "completed": BotStatusEnum.COMPLETED,
                "ended": BotStatusEnum.COMPLETED,
            }

            for meeting in meetings:
                meeting_platform = meeting.get("platform", "")
                native_meeting_id = meeting.get("native_meeting_id", "")
                if (
                    meeting_platform == platform.value
                    and native_meeting_id == meeting_id
                ):
                    meeting_status = meeting.get("status", "").lower()
                    return BotStatus(
                        platform=platform,
                        meeting_id=meeting_id,
                        status=status_map.get(meeting_status, BotStatusEnum.IDLE),
                        message=meeting_status,
                        updated_at=datetime.utcnow(),
                    )

            return BotStatus(
                platform=platform,
                meeting_id=meeting_id,
                status=BotStatusEnum.IDLE,
                message="Meeting not found",
                updated_at=datetime.utcnow(),
            )
        except httpx.HTTPStatusError as e:
            logger.error("Failed to get bot status: %s", e)
            return BotStatus(
                platform=platform,
                meeting_id=meeting_id,
                status=BotStatusEnum.IDLE,
                message="Failed to get status",
                updated_at=datetime.utcnow(),
            )
        except Exception as e:
            logger.exception("Error getting bot status: %s", e)
            return BotStatus(
                platform=platform,
                meeting_id=meeting_id,
                status=BotStatusEnum.IDLE,
                message=str(e),
                updated_at=datetime.utcnow(),
            )

    async def get_transcript(self, platform: Platform, meeting_id: str) -> Transcript:
        """Get the full transcript for a meeting."""
        response = await self.client.get(f"/transcripts/{platform.value}/{meeting_id}")
        response.raise_for_status()
        data = response.json()

        segments = [
            TranscriptSegment(
                text=seg.get("text", ""),
                speaker=seg.get("speaker"),
                start_time=seg.get("start_time"),
                end_time=seg.get("end_time"),
            )
            for seg in data.get("segments", [])
        ]

        return Transcript(
            platform=platform,
            meeting_id=meeting_id,
            segments=segments,
            language=data.get("language"),
            duration=data.get("duration"),
        )

    async def get_active_bots(self) -> list[dict[str, Any]]:
        """Get list of active bots for the current user."""
        try:
            response = await self.client.get("/bots/status")
            response.raise_for_status()
            data = response.json()
            return data.get("running_bots", [])
        except httpx.HTTPStatusError as e:
            logger.error("Failed to get active bots: %s", e)
            return []
        except Exception as e:
            logger.exception("Error getting active bots: %s", e)
            return []

    def register_meeting_id_mapping(
        self, internal_id: int, platform: str, native_meeting_id: str
    ) -> None:
        """Register a mapping from internal meeting ID to platform:native_id."""
        meeting_key = f"{platform}:{native_meeting_id}"
        self._meeting_id_to_key[internal_id] = meeting_key
        logger.info("Registered meeting ID mapping: %s -> %s", internal_id, meeting_key)

    async def _ensure_ws_connection(self) -> None:
        """Ensure WebSocket connection is established."""
        async with self._ws_lock:
            if self._ws_connection is None or self._ws_connection.closed:
                ws_url_with_key = f"{self.ws_url}?api_key={self.api_key}"
                logger.info("Connecting to Vexa WebSocket at %s", self.ws_url)
                self._ws_connection = await websockets.connect(ws_url_with_key)
                self._ws_task = asyncio.create_task(self._ws_listener())
                logger.info("Connected to Vexa WebSocket")

    async def _ws_listener(self) -> None:
        """Listen for WebSocket messages and dispatch to callbacks."""
        if self._ws_connection is None:
            return

        try:
            async for message in self._ws_connection:
                try:
                    data = json.loads(message)
                    await self._handle_ws_message(data)
                except json.JSONDecodeError as e:
                    logger.error("Failed to decode WebSocket message: %s", e)
        except ConnectionClosed as e:
            logger.warning("WebSocket connection closed: %s", e)
        except Exception as e:
            logger.exception("WebSocket listener error: %s", e)

    async def _handle_ws_message(self, data: dict[str, Any]) -> None:
        """Handle incoming WebSocket message."""
        msg_type = data.get("type", "")
        meeting_info = data.get("meeting", {})

        if msg_type == "subscribed":
            meetings_data = data.get("meetings", [])
            logger.info(
                "Received subscribed response: %s, pending: %s",
                meetings_data,
                self._pending_subscriptions,
            )
            if self._pending_subscriptions and meetings_data:
                for i, meeting_item in enumerate(meetings_data):
                    if i < len(self._pending_subscriptions):
                        meeting_key = self._pending_subscriptions[i]
                        if isinstance(meeting_item, dict):
                            internal_id = meeting_item.get("id")
                        else:
                            internal_id = meeting_item
                        if internal_id is not None:
                            self._meeting_id_to_key[internal_id] = meeting_key
                            logger.info(
                                "Mapped internal meeting ID %s to %s",
                                internal_id,
                                meeting_key,
                            )
                self._pending_subscriptions.clear()
            return

        if msg_type == "error":
            logger.error("Vexa WebSocket error: %s", data.get("error", "Unknown error"))
            return

        if msg_type == "pong":
            return

        if msg_type == "transcript.mutable":
            internal_id = meeting_info.get("id")
            meeting_key = self._meeting_id_to_key.get(internal_id)
            if not meeting_key:
                logger.warning(
                    "Received transcript for unknown internal meeting ID: %s",
                    internal_id,
                )
                return

            callback = self._subscribed_meetings.get(meeting_key)
            if callback is None:
                return

            platform, native_id = meeting_key.split(":", 1)
            await callback(
                "transcript.updated",
                {
                    "platform": platform,
                    "meeting_id": native_id,
                    "segments": data.get("payload", {}).get("segments", []),
                    "payload": data.get("payload", {}),
                },
            )
            return

        if msg_type == "meeting.status":
            platform = meeting_info.get("platform", "")
            native_id = meeting_info.get("native_id", "")
            internal_id = meeting_info.get("id")
            meeting_key = f"{platform}:{native_id}"

            if internal_id is not None and meeting_key not in [":", ""]:
                if internal_id not in self._meeting_id_to_key:
                    self._meeting_id_to_key[internal_id] = meeting_key
                    logger.info(
                        "Mapped internal meeting ID %s to %s from status event",
                        internal_id,
                        meeting_key,
                    )

            callback = self._subscribed_meetings.get(meeting_key)
            if callback is None:
                return

            payload = data.get("payload", {})
            await callback(
                "bot.status_changed",
                {
                    "platform": platform,
                    "meeting_id": native_id,
                    "status": payload.get("status", "unknown"),
                    "timestamp": data.get("ts"),
                },
            )
        else:
            logger.debug("Unhandled Vexa message type: %s", msg_type)

    async def subscribe_to_meeting(
        self,
        platform: str,
        meeting_id: str,
        on_event: EventCallback,
    ) -> None:
        """Subscribe to real-time updates for a meeting."""
        await self._ensure_ws_connection()

        meeting_key = f"{platform}:{meeting_id}"
        self._subscribed_meetings[meeting_key] = on_event
        self._pending_subscriptions.append(meeting_key)

        if self._ws_connection:
            subscribe_msg = json.dumps(
                {
                    "action": "subscribe",
                    "meetings": [{"platform": platform, "native_id": meeting_id}],
                }
            )
            await self._ws_connection.send(subscribe_msg)
            logger.info("Subscribed to meeting: %s", meeting_key)

    async def unsubscribe_from_meeting(
        self,
        platform: str,
        meeting_id: str,
    ) -> None:
        """Unsubscribe from a meeting's updates."""
        meeting_key = f"{platform}:{meeting_id}"
        self._subscribed_meetings.pop(meeting_key, None)

        if self._ws_connection and not self._ws_connection.closed:
            unsubscribe_msg = json.dumps(
                {
                    "action": "unsubscribe",
                    "meetings": [{"platform": platform, "native_id": meeting_id}],
                }
            )
            await self._ws_connection.send(unsubscribe_msg)
            logger.info("Unsubscribed from meeting: %s", meeting_key)

    async def close(self):
        """Close the HTTP client and WebSocket connection."""
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass
            self._ws_task = None

        if self._ws_connection:
            await self._ws_connection.close()
            self._ws_connection = None

        if self._client:
            await self._client.aclose()
            self._client = None
