from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from vexa_client import VexaClient
import os
import httpx
from starlette.websockets import WebSocketState
from urllib.parse import urlencode
import websockets

router = APIRouter(prefix="/vexa", tags=["vexa"])

API_KEY = os.getenv("VEXA_API_KEY")
ADMIN_KEY = os.getenv("VEXA_ADMIN_KEY")
BASE_URL = os.getenv("VEXA_BASE_URL", "http://localhost:18056")
client = VexaClient(base_url=BASE_URL, api_key=API_KEY, admin_key=ADMIN_KEY)

@router.get("/bots/status")
async def get_bots_status():
    try:
        bots = client.get_running_bots_status()
        return bots
    except Exception as e:
        print(f"DEBUG: Exception in get_bots_status: {e}")
        print(f"DEBUG: BASE_URL: {BASE_URL}")
        print(f"DEBUG: API_KEY configured: {bool(API_KEY)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bots")
async def post_bot(request: Request):
    data = await request.json()
    try:
        bot = client.request_bot(
            platform=data.get("platform"),
            native_meeting_id=data.get("native_meeting_id"),
            bot_name=data.get("bot_name"),
            language=data.get("language"),
            task=data.get("task")
        )
        return bot
    except Exception as e:
        print(f"DEBUG: Exception in post_bot: {e}")
        print(f"DEBUG: Request data: {data}")
        print(f"DEBUG: BASE_URL: {BASE_URL}")
        print(f"DEBUG: API_KEY configured: {bool(API_KEY)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/bots/{platform}/{native_meeting_id}")
async def delete_bot_route(platform: str, native_meeting_id: str):
    try:
        result = client.stop_bot(platform, native_meeting_id)
        return result
    except Exception as e:
        print(f"DEBUG: Exception in delete_bot_route: {e}")
        print(f"DEBUG: Platform: {platform}, Meeting ID: {native_meeting_id}")
        print(f"DEBUG: BASE_URL: {BASE_URL}")
        print(f"DEBUG: API_KEY configured: {bool(API_KEY)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws")
async def vexa_ws_proxy(websocket: WebSocket):
    await websocket.accept()
    query_params = dict(websocket._query_params)
    vexa_ws_url = f"{BASE_URL.replace('http', 'ws')}/ws?{urlencode(query_params)}"

    try:
        vexa_ws = await websockets.connect(vexa_ws_url)
        try:
            async def from_frontend():
                while websocket.application_state == WebSocketState.CONNECTED:
                    try:
                        data = await websocket.receive_text()
                        await vexa_ws.send(data)
                    except Exception as e:
                        print(f"DEBUG: Exception in websocket from_frontend: {e}")
                        break
            async def from_vexa():
                try:
                    async for msg in vexa_ws:
                        await websocket.send_text(msg)
                except Exception as e:
                    print(f"DEBUG: Exception in websocket from_vexa: {e}")
                    pass
            import asyncio
            tasks = [asyncio.create_task(from_frontend()), asyncio.create_task(from_vexa())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
        finally:
            await vexa_ws.close()
    except WebSocketDisconnect:
        print("DEBUG: Frontend disconnected")
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.close()
    except Exception as e:
        print(f"DEBUG: WebSocket error: {e}")
        print(f"DEBUG: BASE_URL: {BASE_URL}")
        print(f"DEBUG: vexa_ws_url: {vexa_ws_url}")
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011, reason=str(e))
