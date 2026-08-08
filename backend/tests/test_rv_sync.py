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
    def _service(self):
        storage = mock.AsyncMock()
        publisher = mock.AsyncMock()
        service = RVSyncService(
            storage_provider=storage, event_publisher=publisher
        )
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

        await service._apply_state(
            session, _state_payload(info_status="")
        )

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


class TestBuildLaunchUrl:
    @pytest.mark.asyncio
    async def test_launch_url_bakes_command(self):
        service = RVSyncService()
        service.scan = mock.AsyncMock(return_value=[{"port": 45124, "greeting": "x"}])

        info = await service.build_launch_url([7189, 7188])

        assert info["port"] == 45125  # 45124 is taken
        assert info["url"].startswith("rvlink://baked/")
        decoded = bytes.fromhex(info["url"][len("rvlink://baked/"):]).decode()
        assert "-network -networkPort 45125" in decoded
        assert "shotgrid.sessionFromVersionIDs(int[] {7189,7188});" in decoded
        assert "-reuse 0" in decoded


class FakeRVServer:
    """Speaks just enough of RV's network protocol for client tests."""

    def __init__(self):
        self.server = None
        self.port = None
        self.received = []
        self._writer = None

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
        self._writer.write(
            b"MESSAGE " + str(len(payload)).encode() + b" " + payload
        )
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
        writer.write(
            b"GREETING " + str(len(greeting)).encode() + b" " + greeting
        )
        await writer.drain()
        try:
            while True:
                mtype, payload = await self._read_frame(reader)
                text = payload.decode()
                self.received.append((mtype, text))
                if text.startswith("RETURNEVENT remote-pyeval"):
                    ret = b"RETURN evaluated"
                    writer.write(
                        b"MESSAGE " + str(len(ret)).encode() + b" " + ret
                    )
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
            found = await scan_for_rv(
                "127.0.0.1", range(server.port, server.port + 1)
            )
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
