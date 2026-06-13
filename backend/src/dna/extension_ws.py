import logging
import os

from fastapi import WebSocket, WebSocketDisconnect

from dna.auth_providers.auth_provider_base import get_auth_provider
from dna.models.extension_transcript import ExtensionRegisterMessage
from dna.transcription_providers.browser_extension import (
    BrowserExtensionTranscriptionProvider,
)

logger = logging.getLogger(__name__)


async def authenticate_extension_websocket(websocket: WebSocket) -> str | None:
    """Validate Bearer token from header or query param. Returns user email."""
    auth_provider_type = os.environ.get("AUTH_PROVIDER", "none")
    auth_provider = get_auth_provider()

    token: str | None = websocket.query_params.get("token")
    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()

    if not token:
        return None

    if auth_provider_type == "none":
        return auth_provider.get_user_email(token)

    try:
        claims = auth_provider.validate_token(token)
        email = claims.get("email") if isinstance(claims, dict) else None
        return email
    except ValueError:
        return None


async def handle_extension_websocket(
    websocket: WebSocket,
    transcription_provider: BrowserExtensionTranscriptionProvider,
) -> None:
    """Handle the Chrome extension WebSocket connection lifecycle."""
    await websocket.accept()

    meeting_key: str | None = None

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "register":
                register_msg = ExtensionRegisterMessage.model_validate(data)
                meeting_key = f"{register_msg.platform}:{register_msg.meeting_id}"
                result = await transcription_provider.register_extension(
                    platform=register_msg.platform,
                    meeting_id=register_msg.meeting_id,
                    websocket=websocket,
                )
                if result is None:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "No pending session for this meeting. "
                            "Dispatch a bot from DNA first.",
                        }
                    )
                    continue

                await websocket.send_json(
                    {
                        "type": "registered",
                        "session_id": result["session_id"],
                        "playlist_id": result["playlist_id"],
                    }
                )
                continue

            if meeting_key is None:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "Send register before other messages.",
                    }
                )
                continue

            await transcription_provider.handle_extension_message(meeting_key, data)
    except WebSocketDisconnect:
        logger.info("Extension WebSocket disconnected: %s", meeting_key)
    except Exception:
        logger.exception("Extension WebSocket error for %s", meeting_key)
        try:
            await websocket.send_json(
                {"type": "error", "message": "Internal server error"}
            )
        except Exception:
            pass
