"""RV in-review sync service.

Keeps one RV network connection per playlist. RV pushes a dna-view-changed
event whenever the source under the playhead changes; the service extracts
the SG Version ID from the source's tracking metadata and writes it to the
playlist's in_review, then fans status out over the app WebSocket.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Optional

from dna.events import EventPublisher, EventType, get_event_publisher
from dna.models.playlist_metadata import PlaylistMetadataUpdate
from dna.rv_sync.client import RVNetworkClient, scan_for_rv
from dna.rv_sync.rv_code import DNA_EVENT_NAME, STATE_DEFS, parse_tracking_info
from dna.storage_providers.storage_provider_base import StorageProviderBase

logger = logging.getLogger(__name__)


def _rv_host() -> str:
    # Backend runs in Docker in local dev; host.docker.internal reaches the
    # Mac that RV is running on. Override for native runs.
    return os.getenv("RV_SYNC_HOST", "host.docker.internal")


def _rv_ports() -> range:
    start = int(os.getenv("RV_SYNC_PORT_START", "45124"))
    count = int(os.getenv("RV_SYNC_PORT_COUNT", "11"))
    return range(start, start + count)


@dataclass
class RVSession:
    playlist_id: int
    port: int
    client: RVNetworkClient
    status: str = "connecting"  # connecting|connected|disconnected|error
    version_id: Optional[int] = None
    version_name: Optional[str] = None
    detail: Optional[str] = None

    def snapshot(self) -> dict[str, Any]:
        return {
            "playlist_id": self.playlist_id,
            "port": self.port,
            "status": self.status,
            "version_id": self.version_id,
            "version_name": self.version_name,
            "detail": self.detail,
        }


class RVSyncService:
    def __init__(
        self,
        storage_provider: StorageProviderBase | None = None,
        event_publisher: EventPublisher | None = None,
    ):
        self.storage_provider = storage_provider
        self.event_publisher = event_publisher
        self._sessions: dict[int, RVSession] = {}

    def _publisher(self) -> EventPublisher:
        if self.event_publisher is None:
            self.event_publisher = get_event_publisher()
        return self.event_publisher

    async def scan(self) -> list[dict]:
        return await scan_for_rv(_rv_host(), _rv_ports())

    async def build_launch_url(self, version_ids: list[int]) -> dict[str, Any]:
        """Baked rvlink URL that opens a new RV with networking on and the
        playlist's versions loaded.

        The -eval payload must contain sessionFromVersionIDs: rvlink -eval is
        allowlisted to the ShotGrid entry points (RvApplication::parseURL),
        which also bootstrap the tk engine so the load actually runs.
        """
        taken = {s["port"] for s in await self.scan()}
        port = next((p for p in _rv_ports() if p not in taken), _rv_ports().start)
        ids = ",".join(str(v) for v in version_ids)
        cmd = (
            f" -reuse 0 -network -networkPort {port}"
            f" -eval 'shotgrid.sessionFromVersionIDs(int[] {{{ids}}});'"
        )
        return {
            "url": "rvlink://baked/" + cmd.encode("utf-8").hex(),
            "port": port,
        }

    def status(self, playlist_id: int) -> dict[str, Any] | None:
        session = self._sessions.get(playlist_id)
        return session.snapshot() if session else None

    async def connect(self, playlist_id: int, port: int) -> dict[str, Any]:
        await self.disconnect(playlist_id)

        client = RVNetworkClient(_rv_host(), port)
        session = RVSession(playlist_id=playlist_id, port=port, client=client)
        self._sessions[playlist_id] = session

        try:
            greeting = await client.connect()
            client.on_event = lambda name, contents: self._on_rv_event(
                session, name, contents
            )
            client.on_disconnect = lambda: self._on_rv_disconnect(session)
            await client.pyeval(STATE_DEFS)
            install = await client.pyeval("dna_install_bindings()")
            initial = await client.pyeval("dna_state()")
        except Exception as e:
            session.status = "error"
            session.detail = str(e)
            await client.close()
            await self._broadcast(session)
            return session.snapshot()

        session.status = "connected"
        session.detail = f"RV contact: {greeting} ({install})"
        logger.info(
            "rv_sync connected playlist=%s port=%s greeting=%s install=%s",
            playlist_id, port, greeting, install,
        )
        await self._apply_state(session, initial)
        await self._broadcast(session)
        return session.snapshot()

    async def disconnect(self, playlist_id: int) -> bool:
        session = self._sessions.pop(playlist_id, None)
        if session is None:
            return False
        await session.client.close()
        session.status = "disconnected"
        await self._broadcast(session)
        return True

    async def close(self) -> None:
        for playlist_id in list(self._sessions):
            await self.disconnect(playlist_id)

    # ------------------------------------------------------------ internals

    async def _on_rv_event(
        self, session: RVSession, name: str, contents: str
    ) -> None:
        if name != DNA_EVENT_NAME:
            return
        await self._apply_state(session, contents)

    async def _on_rv_disconnect(self, session: RVSession) -> None:
        if self._sessions.get(session.playlist_id) is session:
            del self._sessions[session.playlist_id]
        session.status = "disconnected"
        session.detail = "RV closed the connection"
        await self._broadcast(session)

    async def _apply_state(self, session: RVSession, state_json: str) -> None:
        """Parse a dna_state() payload and sync in_review if it changed."""
        try:
            state = json.loads(state_json)
        except (ValueError, TypeError):
            logger.warning("rv_sync: unparseable state payload: %.120s",
                           state_json)
            return

        version_id: Optional[int] = None
        version_name: Optional[str] = None
        detail: Optional[str] = None
        sources = state.get("sources") or []
        if not sources:
            detail = "no media at playhead"
        else:
            src = sources[0]
            if src.get("infoStatus") != "good":
                detail = "current media has no SG version metadata"
            else:
                info = parse_tracking_info(src.get("trackingInfo") or [])
                try:
                    version_id = int(info["id"])
                except (KeyError, ValueError):
                    detail = "SG metadata missing version id"
                version_name = info.get("name")

        changed = version_id != session.version_id
        session.version_id = version_id
        session.version_name = version_name
        session.detail = detail

        if changed and version_id is not None and self.storage_provider:
            await self.storage_provider.upsert_playlist_metadata(
                session.playlist_id,
                PlaylistMetadataUpdate(in_review=version_id),
            )
            logger.info(
                "rv_sync: playlist %s in_review -> version %s (%s)",
                session.playlist_id, version_id, version_name,
            )
        await self._broadcast(session)

    async def _broadcast(self, session: RVSession) -> None:
        await self._publisher().publish(
            EventType.RV_SYNC_STATUS_CHANGED, session.snapshot()
        )


_service: RVSyncService | None = None


def get_rv_sync_service() -> RVSyncService:
    global _service
    if _service is None:
        _service = RVSyncService()
    return _service
