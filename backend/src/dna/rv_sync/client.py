"""Asyncio client for RV's TCP network protocol.

Wire format (RV reference manual ch. 13, TwkQtChat):
    <TYPE> <size> <payload>
where TYPE is MESSAGE / GREETING / NEWGREETING / PING / PONG /
PINGPONGCONTROL (plus data messages we don't use), and size is the byte
length of the payload. remote-pyeval round-trips are:
    out: MESSAGE <n> RETURNEVENT remote-pyeval * <code>
    in:  MESSAGE <n> RETURN <value>
"""

import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

EventCallback = Callable[[str, str], Awaitable[None]]
"""Called with (event_name, contents) for each EVENT pushed by RV."""


class RVProtocolError(Exception):
    pass


class RVNetworkClient:
    def __init__(
        self,
        host: str,
        port: int,
        contact: Optional[str] = None,
        app: str = "dna_backend",
    ):
        self.host = host
        self.port = port
        # RV keys contacts by name@machine and routes remoteSendEvent by that
        # key. Reusing a contact name across connections (reconnects, scan
        # probes) makes RV route events to whichever socket first claimed the
        # name — often a dead one. Every connection must greet uniquely.
        self.contact = contact or f"dna-{os.urandom(3).hex()}"
        self.app = app
        self.greeting: Optional[str] = None
        self.on_event: Optional[EventCallback] = None
        self.on_disconnect: Optional[Callable[[], Awaitable[None]]] = None
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._read_task: Optional[asyncio.Task] = None
        self._pending_return: Optional[asyncio.Future] = None
        self._closing = False

    @property
    def connected(self) -> bool:
        return self._writer is not None and not self._writer.is_closing()

    async def connect(self, timeout: float = 5.0) -> str:
        self._reader, self._writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port), timeout
        )
        try:
            greeting = f"{self.contact} {self.app}".encode("utf-8")
            await self._send_raw(
                b"NEWGREETING " + str(len(greeting)).encode() + b" " + greeting
            )
            mtype, payload = await asyncio.wait_for(self._read_frame(), timeout)
            if mtype not in ("GREETING", "NEWGREETING"):
                raise RVProtocolError(
                    f"unexpected handshake reply: {mtype} {payload[:80]!r}"
                )
        except BaseException:
            self._writer.close()
            self._writer = None
            self._reader = None
            raise
        self.greeting = payload.decode("utf-8", "replace")
        self._read_task = asyncio.create_task(self._read_loop())
        return self.greeting

    async def close(self) -> None:
        self._closing = True
        if self._read_task:
            self._read_task.cancel()
        if self._writer:
            try:
                await self._send_raw(b"MESSAGE 10 DISCONNECT")
            except (ConnectionError, OSError):
                pass
            self._writer.close()
            self._writer = None

    async def pyeval(self, code: str, timeout: float = 15.0) -> str:
        """Evaluate a Python expression inside RV and return its repr."""
        if self._pending_return is not None:
            raise RVProtocolError("pyeval already in flight")
        self._pending_return = asyncio.get_running_loop().create_future()
        try:
            await self._send_message(f"RETURNEVENT remote-pyeval * {code}")
            return await asyncio.wait_for(self._pending_return, timeout)
        finally:
            self._pending_return = None

    # ------------------------------------------------------------ internals

    async def _send_raw(self, data: bytes) -> None:
        if not self._writer:
            raise ConnectionError("not connected")
        self._writer.write(data)
        await self._writer.drain()

    async def _send_message(self, payload: str) -> None:
        p = payload.encode("utf-8")
        await self._send_raw(b"MESSAGE " + str(len(p)).encode() + b" " + p)

    async def _read_frame(self) -> tuple[str, bytes]:
        assert self._reader is not None
        header = b""
        spaces = 0
        while spaces < 2:
            ch = await self._reader.readexactly(1)
            header += ch
            if ch == b" ":
                spaces += 1
        mtype, size = header.decode("utf-8", "replace").split(" ", 1)
        payload = await self._reader.readexactly(int(size.strip()))
        return mtype, payload

    async def _read_loop(self) -> None:
        try:
            while True:
                mtype, payload = await self._read_frame()
                try:
                    await self._handle_frame(mtype, payload)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # One bad frame/handler must not kill the read loop —
                    # a dead loop looks "connected" but processes nothing.
                    logger.exception(
                        "rv_sync: error handling %s frame from %s:%s",
                        mtype,
                        self.host,
                        self.port,
                    )
        except asyncio.CancelledError:
            raise
        except (asyncio.IncompleteReadError, ConnectionError, OSError) as e:
            if not self._closing:
                logger.warning(
                    "RV connection lost (%s:%s): %s", self.host, self.port, e
                )
                if self._pending_return and not self._pending_return.done():
                    self._pending_return.set_exception(
                        ConnectionError("RV connection lost")
                    )
                if self.on_disconnect:
                    await self.on_disconnect()

    async def _handle_frame(self, mtype: str, payload: bytes) -> None:
        if mtype == "PING":
            await self._send_raw(b"PONG 1 p")
            return
        if mtype in ("PONG", "PINGPONGCONTROL", "GREETING", "NEWGREETING"):
            return
        if mtype != "MESSAGE":
            logger.debug("ignoring %s frame (%d bytes)", mtype, len(payload))
            return
        text = payload.decode("utf-8", "replace")
        if text.startswith("RETURN"):
            value = text[len("RETURN ") :] if text.startswith("RETURN ") else ""
            if self._pending_return and not self._pending_return.done():
                self._pending_return.set_result(value)
            return
        if text.startswith("EVENT ") or text.startswith("RETURNEVENT "):
            # EVENT <name> <target> <contents>
            parts = text.split(" ", 3)
            if len(parts) >= 3:
                name = parts[1]
                contents = parts[3] if len(parts) > 3 else ""
                if text.startswith("RETURNEVENT "):
                    await self._send_message("RETURN ")
                if self.on_event:
                    await self.on_event(name, contents)
            return
        if text == "DISCONNECT":
            self._closing = True
            if self.on_disconnect:
                await self.on_disconnect()
            return
        logger.debug("unhandled RV message: %s", text[:120])


async def scan_for_rv(
    host: str, ports: range, connect_timeout: float = 1.0
) -> list[dict]:
    """Probe ports for RV sessions; returns [{port, greeting}, ...].

    Any per-port failure just means "no RV there": ports can be closed,
    accept-then-EOF (Docker's host proxy, RV mid-boot), or held by another
    service entirely — none of that may abort the rest of the scan.
    """

    async def probe(port: int) -> dict | None:
        client = RVNetworkClient(host, port)
        try:
            greeting = await client.connect(timeout=connect_timeout)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.debug("rv scan: no RV on %s:%s (%s)", host, port, e)
            return None
        await client.close()
        return {"port": port, "greeting": greeting}

    results = await asyncio.gather(*(probe(p) for p in ports))
    return [r for r in results if r is not None]
