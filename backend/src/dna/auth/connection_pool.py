"""Thread-safe LRU connection pool for ShotGrid connections.

Problem solved
--------------
Creating a new ``Shotgun(url, session_token=token)`` on every API request
causes a TCP handshake + ShotGrid session negotiation on each call.  Under
load (50+ concurrent users), this becomes the dominant latency contributor.

Solution
--------
Maintain a bounded pool of live ``Shotgun`` connections keyed by
``session_id``.  Connections are reused across requests from the same user
session; stale connections (wrong token hash) are replaced transparently.

Design
------
- Storage:   ``collections.OrderedDict`` for O(1) LRU move-to-end.
- Locking:   ``threading.RLock`` — reentrant so nested acquire() is safe.
- Eviction:  LRU when pool reaches ``max_size``.
- Staleness: Pool entries store a SHA-256 hash of the SG token.  If the token
             rotates (refresh), the hash changes and a new connection is opened.
- Cleanup:   ``cleanup_idle()`` evicts connections idle > ``max_idle_seconds``.
             Call this from a FastAPI background task (see main.py).
- No explicit close: ``shotgun_api3.Shotgun`` has no ``close()`` — we simply
             let entries be garbage-collected on eviction.

Environment variables
---------------------
``SG_POOL_MAX_SIZE``     - Maximum connections (default: 200)
``SG_POOL_MAX_IDLE_SEC`` - Max idle seconds before eviction (default: 3600)
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional

from shotgun_api3 import Shotgun


# ── Pool entry ────────────────────────────────────────────────────────────────


@dataclass
class _PoolEntry:
    conn: Shotgun
    session_id: str
    sg_token_hash: str        # SHA-256 of sg_token — for staleness detection
    last_used: float = field(default_factory=time.monotonic)
    created_at: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_used = time.monotonic()

    def is_idle(self, max_idle_seconds: float) -> bool:
        return (time.monotonic() - self.last_used) > max_idle_seconds


# ── Pool ──────────────────────────────────────────────────────────────────────


class ShotGridConnectionPool:
    """Thread-safe LRU pool of ``Shotgun`` connections.

    Usage::

        pool = ShotGridConnectionPool(sg_url="https://mystudio.shotgunstudio.com")

        # Get (or create) a connection for this user session
        conn = pool.get(session_id="uuid-...", sg_token="opaque-token")
        results = conn.find("Version", ...)

        # On logout, release the connection slot
        pool.release(session_id="uuid-...")

        # Periodic cleanup (call from background task)
        pool.cleanup_idle()
    """

    def __init__(
        self,
        sg_url: Optional[str] = None,
        max_size: Optional[int] = None,
        max_idle_seconds: Optional[float] = None,
    ) -> None:
        self.sg_url: str = (
            sg_url or os.getenv("SHOTGRID_URL") or ""
        ).rstrip("/")
        if not self.sg_url:
            raise ValueError(
                "SHOTGRID_URL is required for ShotGridConnectionPool."
            )
        self.max_size: int = max_size or int(os.getenv("SG_POOL_MAX_SIZE", "200"))
        self.max_idle_seconds: float = max_idle_seconds or float(
            os.getenv("SG_POOL_MAX_IDLE_SEC", "3600")
        )

        self._lock: threading.RLock = threading.RLock()
        # OrderedDict preserves insertion order → LRU: least recently used at front
        self._pool: OrderedDict[str, _PoolEntry] = OrderedDict()
        self._hits: int = 0
        self._misses: int = 0

    # ── Public API ────────────────────────────────────────────────────── #

    def get(self, session_id: str, sg_token: str) -> Shotgun:
        """Return a live Shotgun connection for this session.

        Creates a new connection if:
        - No entry exists for ``session_id``.
        - The stored entry's SG token has changed (post-refresh staleness).

        If the pool is at capacity, the least recently used entry is evicted.

        Args:
            session_id: The user's session ID (from the DNA JWT).
            sg_token:   The ShotGrid session token (from MongoDB session store).

        Returns:
            A live ``Shotgun`` instance authenticated as this user.
        """
        token_hash = _hash_token(sg_token)

        with self._lock:
            entry = self._pool.get(session_id)

            if entry is not None:
                if entry.sg_token_hash == token_hash:
                    # Cache hit — move to end (most recently used) and return
                    self._pool.move_to_end(session_id)
                    entry.touch()
                    self._hits += 1
                    return entry.conn
                else:
                    # Token rotated (refresh) — replace stale connection
                    del self._pool[session_id]

            # Cache miss — create a new connection
            self._misses += 1
            self._maybe_evict_lru()

            conn = Shotgun(self.sg_url, session_token=sg_token)
            self._pool[session_id] = _PoolEntry(
                conn=conn,
                session_id=session_id,
                sg_token_hash=token_hash,
            )
            return conn

    def release(self, session_id: str) -> None:
        """Remove a session's connection from the pool.

        Call this on logout or when a session is deleted from MongoDB.

        Args:
            session_id: The session ID whose connection should be removed.
        """
        with self._lock:
            self._pool.pop(session_id, None)

    def cleanup_idle(self) -> int:
        """Evict connections that have been idle longer than ``max_idle_seconds``.

        Returns:
            Number of connections evicted.

        Call from a FastAPI ``BackgroundTask`` or ``asyncio`` periodic task::

            @app.on_event("startup")
            async def startup():
                asyncio.create_task(_periodic_pool_cleanup())

            async def _periodic_pool_cleanup():
                while True:
                    await asyncio.sleep(300)   # every 5 minutes
                    pool.cleanup_idle()
        """
        evicted = 0
        with self._lock:
            idle_keys = [
                sid
                for sid, entry in self._pool.items()
                if entry.is_idle(self.max_idle_seconds)
            ]
            for sid in idle_keys:
                del self._pool[sid]
                evicted += 1
        return evicted

    # ── Stats (for monitoring / health endpoint) ──────────────────────── #

    @property
    def size(self) -> int:
        """Current number of pooled connections."""
        with self._lock:
            return len(self._pool)

    @property
    def stats(self) -> dict:
        """Return pool statistics for monitoring."""
        with self._lock:
            total = self._hits + self._misses
            return {
                "size": len(self._pool),
                "max_size": self.max_size,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / total, 3) if total else 0.0,
            }

    # ── Internal ──────────────────────────────────────────────────────── #

    def _maybe_evict_lru(self) -> None:
        """Evict the least recently used entry if the pool is at capacity.

        Must be called inside ``self._lock``.
        """
        while len(self._pool) >= self.max_size:
            # OrderedDict.popitem(last=False) removes the oldest (LRU) entry
            self._pool.popitem(last=False)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _hash_token(token: str) -> str:
    """Return a SHA-256 hex digest of the token.

    We never store the raw SG token in the pool entry — only its hash —
    to prevent accidental logging of credentials.
    """
    return hashlib.sha256(token.encode()).hexdigest()


# ── Singleton factory ─────────────────────────────────────────────────────────


_pool: Optional[ShotGridConnectionPool] = None


def get_connection_pool() -> ShotGridConnectionPool:
    """Return the application-wide ShotGridConnectionPool singleton."""
    global _pool
    if _pool is None:
        _pool = ShotGridConnectionPool()
    return _pool
