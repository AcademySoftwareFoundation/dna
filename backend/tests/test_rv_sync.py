"""Tests for the RV in-review sync module."""

import asyncio
import json
from unittest import mock

import pytest

from dna.models.playlist_metadata import PlaylistMetadataUpdate
from dna.rv_sync.client import RVNetworkClient, scan_for_rv
from dna.rv_sync.rv_code import parse_tracking_info
from dna.rv_sync.service import RVSyncService


def _state_payload(
    version_id="7190",
    name="TST_010_0010_comp_v001",
    info_status="good",
    sources=True,
):
    if not sources:
        return json.dumps({"viewNode": "defaultSequence", "frame": 1, "sources": []})
    return json.dumps(
        {
            "viewNode": "reviewAppSequenceGroup",
            "frame": 1,
            "sources": [
                {
                    "source": "sourceGroup000001_source",
                    "media": ["https://site/file_serve/version/7190/mp4"],
                    "infoStatus": info_status,
                    "trackingInfo": ["id", version_id, "name", name],
                }
            ],
        }
    )


class TestParseTrackingInfo:
    def test_pairs(self):
        info = parse_tracking_info(["id", "7190", "name", "shot_v001"])
        assert info == {"id": "7190", "name": "shot_v001"}

    def test_empty(self):
        assert parse_tracking_info([]) == {}

    def test_odd_length_drops_tail(self):
        assert parse_tracking_info(["id", "7190", "dangling"]) == {"id": "7190"}


class TestApplyState:
    def _service(self, pinned=False):
        storage = mock.AsyncMock()
        storage.get_playlist_metadata.return_value = (
            mock.Mock(in_review_pinned=True) if pinned else None
        )
        publisher = mock.AsyncMock()
        service = RVSyncService(storage_provider=storage, event_publisher=publisher)
        return service, storage, publisher

    async def _connect_session(self, service):
        from dna.rv_sync.service import RVSession

        session = RVSession(
            playlist_id=42, port=45124, client=mock.AsyncMock(), status="connected"
        )
        service._sessions[42] = session
        return session

    @pytest.mark.asyncio
    async def test_good_metadata_updates_in_review(self):
        service, storage, publisher = self._service()
        session = await self._connect_session(service)

        await service._apply_state(session, _state_payload())

        assert session.version_id == 7190
        assert session.version_name == "TST_010_0010_comp_v001"
        storage.upsert_playlist_metadata.assert_awaited_once()
        playlist_id, update = storage.upsert_playlist_metadata.await_args.args
        assert playlist_id == 42
        assert isinstance(update, PlaylistMetadataUpdate)
        assert update.in_review == 7190
        publisher.publish.assert_awaited()

    @pytest.mark.asyncio
    async def test_same_version_does_not_rewrite(self):
        service, storage, _ = self._service()
        session = await self._connect_session(service)

        await service._apply_state(session, _state_payload())
        await service._apply_state(session, _state_payload())

        assert storage.upsert_playlist_metadata.await_count == 1

    @pytest.mark.asyncio
    async def test_non_sg_media_is_ignored(self):
        service, storage, _ = self._service()
        session = await self._connect_session(service)

        await service._apply_state(session, _state_payload(info_status=""))

        assert session.version_id is None
        assert "no SG version metadata" in session.detail
        storage.upsert_playlist_metadata.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_empty_view_is_ignored(self):
        service, storage, _ = self._service()
        session = await self._connect_session(service)

        await service._apply_state(session, _state_payload(sources=False))

        assert session.version_id is None
        assert session.detail == "no media at playhead"
        storage.upsert_playlist_metadata.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_garbage_payload_is_ignored(self):
        service, storage, _ = self._service()
        session = await self._connect_session(service)

        await service._apply_state(session, "not json")

        storage.upsert_playlist_metadata.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_pinned_in_review_is_not_moved(self):
        service, storage, publisher = self._service(pinned=True)
        session = await self._connect_session(service)

        await service._apply_state(session, _state_payload())

        # RV's playhead is still tracked and broadcast, but in_review stays put.
        assert session.version_id == 7190
        storage.upsert_playlist_metadata.assert_not_awaited()
        publisher.publish.assert_awaited()


class TestResumeSync:
    @pytest.mark.asyncio
    async def test_resume_pushes_current_rv_version(self):
        from dna.rv_sync.service import RVSession

        storage = mock.AsyncMock()
        service = RVSyncService(
            storage_provider=storage, event_publisher=mock.AsyncMock()
        )
        service._sessions[42] = RVSession(
            playlist_id=42,
            port=45124,
            client=mock.AsyncMock(),
            status="connected",
            version_id=7190,
        )

        assert await service.resume_sync(42) == 7190
        playlist_id, update = storage.upsert_playlist_metadata.await_args.args
        assert playlist_id == 42
        assert update.in_review == 7190

    @pytest.mark.asyncio
    async def test_resume_without_session_is_a_noop(self):
        storage = mock.AsyncMock()
        service = RVSyncService(
            storage_provider=storage, event_publisher=mock.AsyncMock()
        )

        assert await service.resume_sync(42) is None
        storage.upsert_playlist_metadata.assert_not_awaited()


class TestBuildLaunchUrl:
    @pytest.mark.asyncio
    async def test_launch_url_bakes_command(self):
        service = RVSyncService()
        service.scan = mock.AsyncMock(return_value=[{"port": 45124, "greeting": "x"}])

        info = await service.build_launch_url([7189, 7188])

        assert info["port"] == 45125  # 45124 is taken
        launch = bytes.fromhex(info["url"][len("rvlink://baked/") :]).decode()
        load = bytes.fromhex(info["load_url"][len("rvlink://baked/") :]).decode()
        assert "-network -networkPort 45125" in launch
        # No eval in the launch URL: a cold RV errors on it and loads nothing.
        assert "-eval" not in launch
        assert "shotgrid.sessionFromVersionIDs(int[] {7189,7188});" in load
        # -reuse 1 on both: -reuse 0 makes a running RV spawn a second window.
        assert "-reuse 1" in launch
        assert "-reuse 1" in load


class FakeRVServer:
    """Speaks just enough of RV's network protocol for client tests."""

    def __init__(self, pyeval_response="evaluated"):
        self.server = None
        self.port = None
        self.received = []
        self._writer = None
        self.pyeval_response = pyeval_response

    async def start(self):
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def stop(self):
        if self._writer is not None:
            self._writer.close()
        self.server.close()
        await self.server.wait_closed()
        await asyncio.sleep(0)

    async def push_event(self, name, contents):
        payload = f"EVENT {name} * {contents}".encode()
        self._writer.write(b"MESSAGE " + str(len(payload)).encode() + b" " + payload)
        await self._writer.drain()

    async def _read_frame(self, reader):
        header = b""
        spaces = 0
        while spaces < 2:
            ch = await reader.readexactly(1)
            header += ch
            if ch == b" ":
                spaces += 1
        mtype, size = header.decode().split(" ", 1)
        payload = await reader.readexactly(int(size.strip()))
        return mtype, payload

    async def _handle(self, reader, writer):
        self._writer = writer
        mtype, payload = await self._read_frame(reader)
        assert mtype == "NEWGREETING"
        greeting = b"fake-rv rv"
        writer.write(b"GREETING " + str(len(greeting)).encode() + b" " + greeting)
        await writer.drain()
        try:
            while True:
                mtype, payload = await self._read_frame(reader)
                text = payload.decode()
                self.received.append((mtype, text))
                if text.startswith("RETURNEVENT remote-pyeval"):
                    ret = ("RETURN " + self.pyeval_response).encode()
                    writer.write(b"MESSAGE " + str(len(ret)).encode() + b" " + ret)
                    await writer.drain()
                elif text == "DISCONNECT":
                    break
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        writer.close()


class TestRVNetworkClient:
    @pytest.mark.asyncio
    async def test_handshake_pyeval_and_event_push(self):
        server = FakeRVServer()
        await server.start()
        try:
            client = RVNetworkClient("127.0.0.1", server.port)
            greeting = await client.connect()
            assert greeting == "fake-rv rv"

            result = await client.pyeval("1 + 1")
            assert result == "evaluated"

            events = []

            async def on_event(name, contents):
                events.append((name, contents))

            client.on_event = on_event
            await server.push_event("dna-view-changed", '{"sources": []}')
            await asyncio.sleep(0.1)
            assert events == [("dna-view-changed", '{"sources": []}')]

            await client.close()
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_scan_finds_fake_rv(self):
        server = FakeRVServer()
        await server.start()
        try:
            found = await scan_for_rv("127.0.0.1", range(server.port, server.port + 1))
            assert found == [{"port": server.port, "greeting": "fake-rv rv"}]
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_scan_empty_when_nothing_listens(self):
        # Port 1 is unbindable/unused on any sane dev box.
        found = await scan_for_rv("127.0.0.1", range(1, 2))
        assert found == []

    @pytest.mark.asyncio
    async def test_scan_survives_accept_then_close_port(self):
        # Docker's host proxy (and RV mid-boot) can accept the TCP
        # connection and close it without a greeting; that must read as
        # "no RV here", not abort the scan (regression: IncompleteReadError
        # is an EOFError, which the original catch tuple missed).
        async def slam(reader, writer):
            writer.close()

        slammer = await asyncio.start_server(slam, "127.0.0.1", 0)
        port = slammer.sockets[0].getsockname()[1]
        try:
            found = await scan_for_rv("127.0.0.1", range(port, port + 1))
            assert found == []
        finally:
            slammer.close()
            await slammer.wait_closed()


class TestServiceLifecycle:
    """Service connect/disconnect against the fake RV server."""

    def _service(self, monkeypatch, port):
        monkeypatch.setenv("RV_SYNC_HOST", "127.0.0.1")
        monkeypatch.setenv("RV_SYNC_PORT_START", str(port))
        monkeypatch.setenv("RV_SYNC_PORT_COUNT", "1")
        storage = mock.AsyncMock()
        publisher = mock.AsyncMock()
        return RVSyncService(storage_provider=storage, event_publisher=publisher)

    @pytest.mark.asyncio
    async def test_connect_apply_event_disconnect(self, monkeypatch):
        server = FakeRVServer(pyeval_response=_state_payload())
        await server.start()
        service = self._service(monkeypatch, server.port)
        try:
            snapshot = await service.connect(42, server.port)
            assert snapshot["status"] == "connected"
            assert snapshot["version_id"] == 7190
            assert service.status(42)["version_id"] == 7190

            await server.push_event(
                "dna-view-changed", _state_payload(version_id="7191", name="v2")
            )
            await asyncio.sleep(0.1)
            assert service.status(42)["version_id"] == 7191

            # Unrelated events are ignored.
            await server.push_event("some-other-event", "{}")
            await asyncio.sleep(0.1)
            assert service.status(42)["version_id"] == 7191

            assert await service.disconnect(42) is True
            assert service.status(42) is None
            assert await service.disconnect(42) is False
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_connect_failure_reports_error(self, monkeypatch):
        service = self._service(monkeypatch, 1)  # nothing listens on port 1
        snapshot = await service.connect(42, 1)
        assert snapshot["status"] == "error"
        assert snapshot["detail"]
        service.storage_provider.upsert_playlist_metadata.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_rv_side_disconnect_removes_session(self, monkeypatch):
        server = FakeRVServer(pyeval_response=_state_payload())
        await server.start()
        service = self._service(monkeypatch, server.port)
        try:
            await service.connect(42, server.port)
            server._writer.close()  # RV goes away
            await asyncio.sleep(0.2)
            assert service.status(42) is None
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_close_tears_down_all_sessions(self, monkeypatch):
        server = FakeRVServer(pyeval_response=_state_payload())
        await server.start()
        service = self._service(monkeypatch, server.port)
        try:
            await service.connect(42, server.port)
            await service.close()
            assert service.status(42) is None
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_scan_uses_env_config(self, monkeypatch):
        server = FakeRVServer()
        await server.start()
        service = self._service(monkeypatch, server.port)
        try:
            found = await service.scan()
            assert found == [{"port": server.port, "greeting": "fake-rv rv"}]
        finally:
            await server.stop()
