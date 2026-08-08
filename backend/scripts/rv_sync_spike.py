#!/usr/bin/env python3
"""Spike: talk to a local RV over its TCP network protocol.

Goals (feeds the rv_sync backend module design):
  1. Scan localhost for networked RV sessions.
  2. Handshake (NEWGREETING) and remote-pyeval round-trips.
  3. Dump the current view's source(s) + any ShotGrid-ish metadata
     properties so we learn the exact property names to read.
  4. Inject event bindings (after-graph-view-change, source-media-set)
     that push state back to us via remoteSendEvent — verify push works.

Usage:
  python3 rv_sync_spike.py scan
  python3 rv_sync_spike.py probe [port]
  python3 rv_sync_spike.py listen [port] [seconds]

Protocol framing (RV reference manual ch. 13 / TwkQtChat/Connection.cpp):
  <TYPE> <size> <payload>   where size = byte length of payload.
  remote-pyeval goes out as:  MESSAGE <n> RETURNEVENT remote-pyeval * <code>
  and the result comes back:  MESSAGE <n> RETURN <value>
"""

import socket
import sys
import time

HOST = "127.0.0.1"
DEFAULT_PORT = 45124
SCAN_RANGE = range(45124, 45135)
CONTACT = "dna"
APP = "dna_spike"


# ---------------------------------------------------------------- connection


class RVConnection:
    def __init__(self, host: str, port: int):
        self.sock = socket.create_connection((host, port), timeout=5)
        self.buf = b""
        self.greeting = None

    def close(self):
        try:
            self.send_raw(b"MESSAGE 10 DISCONNECT")
        except OSError:
            pass
        self.sock.close()

    def send_raw(self, data: bytes):
        self.sock.sendall(data)

    def send_message(self, payload: str):
        p = payload.encode("utf-8")
        self.send_raw(b"MESSAGE " + str(len(p)).encode() + b" " + p)

    def handshake(self):
        greeting = f"{CONTACT} {APP}".encode("utf-8")
        self.send_raw(
            b"NEWGREETING " + str(len(greeting)).encode() + b" " + greeting
        )
        mtype, payload = self.read_message()
        if mtype not in ("GREETING", "NEWGREETING"):
            raise RuntimeError(f"unexpected handshake reply: {mtype} {payload!r}")
        self.greeting = payload.decode("utf-8", "replace")
        return self.greeting

    def _fill(self, timeout: float):
        self.sock.settimeout(timeout)
        chunk = self.sock.recv(65536)
        if not chunk:
            raise ConnectionError("RV closed the connection")
        self.buf += chunk

    def read_message(self, timeout: float = 10.0):
        """Return (type, payload_bytes). Answers nothing by itself."""
        deadline = time.time() + timeout
        while True:
            # Need "<TYPE> <size> " header before payload.
            sp1 = self.buf.find(b" ")
            sp2 = self.buf.find(b" ", sp1 + 1) if sp1 != -1 else -1
            if sp2 != -1:
                mtype = self.buf[:sp1].decode("utf-8", "replace")
                size = int(self.buf[sp1 + 1 : sp2])
                end = sp2 + 1 + size
                if len(self.buf) >= end:
                    payload = self.buf[sp2 + 1 : end]
                    self.buf = self.buf[end:]
                    return mtype, payload
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError("timed out waiting for RV message")
            self._fill(remaining)

    def dispatch(self, mtype: str, payload: bytes) -> bool:
        """Handle housekeeping messages. Returns True if consumed."""
        if mtype == "PING":
            self.send_raw(b"PONG 1 p")
            return True
        if mtype in ("PONG", "PINGPONGCONTROL"):
            return True
        return False

    def pyeval(self, code: str, timeout: float = 15.0) -> str:
        """RETURNEVENT remote-pyeval and wait for the RETURN."""
        self.send_message(f"RETURNEVENT remote-pyeval * {code}")
        deadline = time.time() + timeout
        while time.time() < deadline:
            mtype, payload = self.read_message(timeout=deadline - time.time())
            if self.dispatch(mtype, payload):
                continue
            if mtype == "MESSAGE":
                text = payload.decode("utf-8", "replace")
                if text.startswith("RETURN "):
                    return text[len("RETURN ") :]
                if text == "RETURN":
                    return ""
                print(f"  [while waiting] {text[:200]}")
            else:
                print(f"  [while waiting] {mtype} {payload[:80]!r}")
        raise TimeoutError("no RETURN for pyeval")


# ---------------------------------------------------------------- rv-side code

# Everything below is exec'd inside RV via remote-pyeval. remote-pyeval
# evaluates a single expression, so multi-line defs are shipped through
# exec(..., globals()) and then called by name.

PROBE_DEFS = r'''
exec("""
import json

def dna_state():
    from rv import commands as rvc
    out = {}
    out["viewNode"] = rvc.viewNode()
    out["viewNodeType"] = rvc.nodeType(rvc.viewNode())
    out["frame"] = rvc.frame()
    srcs = rvc.sourcesAtFrame(rvc.frame())
    out["sources"] = []
    keywords = ("tracking", "shotgun", "sg_", "version", "review", "flow")
    for s in srcs:
        grp = rvc.nodeGroup(s)
        entry = {"source": s, "group": grp}
        try:
            entry["media"] = rvc.getStringProperty(s + ".media.movie")
        except Exception as e:
            entry["media"] = "<error: %s>" % e
        props = {}
        nodes = [s]
        try:
            nodes += rvc.nodesInGroup(grp)
        except Exception:
            pass
        for node in nodes:
            try:
                names = rvc.properties(node)
            except Exception:
                continue
            for p in names:
                lp = p.lower()
                if not any(k in lp for k in keywords):
                    continue
                try:
                    props[p] = rvc.getStringProperty(p)
                except Exception:
                    try:
                        props[p] = rvc.getIntProperty(p)
                    except Exception:
                        props[p] = "<unreadable>"
        entry["sgProps"] = props
        out["sources"].append(entry)
    try:
        out["remoteConnections"] = rvc.remoteConnections()
    except Exception as e:
        out["remoteConnections"] = "<error: %s>" % e
    return json.dumps(out)
""", globals())
'''

BIND_DEFS = r'''
exec("""
import json

_dna_last_key = [None]

def dna_push_now():
    from rv import commands as rvc
    try:
        rvc.remoteSendEvent(
            "dna-view-changed", "*", dna_state(), rvc.remoteConnections()
        )
    except Exception as exc:
        print("dna_push error: %r" % exc)

def dna_push(event):
    dna_push_now()
    event.reject()

def dna_frame_changed(event):
    # In review-app/Screening Room layouts all versions are clips in one
    # sequence, so the current version is the source under the playhead.
    # Only push when that source actually changes.
    from rv import commands as rvc
    try:
        key = ",".join(rvc.sourcesAtFrame(rvc.frame()))
    except Exception:
        key = ""
    if key != _dna_last_key[0]:
        _dna_last_key[0] = key
        dna_push_now()
    event.reject()

def dna_install_bindings():
    from rv import commands as rvc
    if globals().get("_dna_bound"):
        return "already bound"
    globals()["_dna_bound"] = True
    rvc.bind("default", "global", "frame-changed", dna_frame_changed,
             "DNA rv_sync spike")
    for ev in ("after-graph-view-change", "source-media-set"):
        rvc.bind("default", "global", ev, dna_push, "DNA rv_sync spike")
    return "bindings installed"
""", globals())
'''


# ---------------------------------------------------------------- commands


def scan():
    found = []
    for port in SCAN_RANGE:
        try:
            with socket.create_connection((HOST, port), timeout=0.3):
                found.append(port)
        except OSError:
            continue
    for port in found:
        try:
            conn = RVConnection(HOST, port)
            greeting = conn.handshake()
            conn.close()
            print(f"port {port}: RV session, greeting: {greeting!r}")
        except Exception as e:
            print(f"port {port}: open but handshake failed ({e})")
    if not found:
        print("no networked RV found on localhost "
              f"({SCAN_RANGE.start}-{SCAN_RANGE.stop - 1})")
    return found


def probe(port: int):
    conn = RVConnection(HOST, port)
    print(f"connected, greeting: {conn.handshake()!r}")
    print("installing probe defs ...")
    conn.pyeval(PROBE_DEFS)
    print("=== dna_state() ===")
    print(conn.pyeval("dna_state()"))
    conn.close()


def listen(port: int, seconds: int):
    conn = RVConnection(HOST, port)
    print(f"connected, greeting: {conn.handshake()!r}")
    conn.pyeval(PROBE_DEFS)
    conn.pyeval(BIND_DEFS)
    print("install:", conn.pyeval("dna_install_bindings()"))
    print("initial state:", conn.pyeval("dna_state()")[:400], "...")
    print(f"--- listening {seconds}s: click around in RV now ---")
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            mtype, payload = conn.read_message(timeout=deadline - time.time())
        except (TimeoutError, socket.timeout):
            break
        if conn.dispatch(mtype, payload):
            continue
        text = payload.decode("utf-8", "replace")
        stamp = time.strftime("%H:%M:%S")
        print(f"[{stamp}] {mtype}: {text[:600]}")
    conn.close()
    print("--- done ---")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "scan"
    port_arg = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PORT
    if cmd == "scan":
        scan()
    elif cmd == "probe":
        probe(port_arg)
    elif cmd == "listen":
        listen(port_arg, int(sys.argv[3]) if len(sys.argv) > 3 else 90)
    else:
        print(__doc__)
        sys.exit(1)
