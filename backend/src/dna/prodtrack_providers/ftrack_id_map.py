"""Stable int ids for ftrack's UUID-keyed entities.

DNA entity ids are ints end to end (`EntityBase.id`, the FastAPI path params,
the Mongo bookkeeping rows, the frontend interfaces). ftrack keys everything by
UUID string, so the provider hands out a surrogate int per UUID and keeps the
pairing here.

The int is a truncated blake2b of the UUID, so any process derives the same one
without coordinating. The map is still persisted because the *reverse*
direction is what a request needs: `GET /version/814233907` has to resolve back
to a UUID on whichever instance happens to serve it, possibly long after the
instance that first saw that version is gone. Collisions are rare at 53 bits but
handled: the digest is re-salted until a free slot is found, which is exactly
why the forward direction reads the store too rather than trusting the hash.

Ids stay inside the 2**53 range JavaScript can represent exactly; anything
larger would be silently rounded by the frontend.

**Lookups come in batches.** Converting one playlist touches an id per version
plus its project, user, task, task type and shot — a round trip each would
dominate the request. Subclasses implement bulk hooks, the base class serves
repeats from an in-process cache, and callers with a known working set warm it
up front with :meth:`FtrackIdMap.to_ints`. Caching is safe because a pairing,
once written, never changes.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable, Optional

# 2**53 - 1: the largest integer JavaScript round-trips without loss.
_MAX_SAFE_INT = 9007199254740991

# Bounded so a pathological collision run fails loudly instead of spinning.
_MAX_PROBES = 64

# Above this many cached pairings the cache is dropped wholesale. Entries are
# equally valuable and never stale, so evicting precisely is not worth the
# bookkeeping.
_DEFAULT_CACHE_SIZE = 100_000

# Mongo `$in` and SQLite parameter lists both degrade on huge batches.
_CHUNK = 500


def surrogate_id(uuid: str, salt: int = 0) -> int:
    """Derive the candidate int id for *uuid*, re-salted on collision."""
    payload = uuid.encode("utf-8") if salt == 0 else f"{uuid}:{salt}".encode("utf-8")
    digest = hashlib.blake2b(payload, digest_size=8).digest()
    return int.from_bytes(digest, "big") % _MAX_SAFE_INT + 1


def _chunked(values: list, size: int = _CHUNK) -> Iterable[list]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


class FtrackIdMap:
    """Bidirectional UUID <-> surrogate int store.

    Subclasses implement the three storage hooks (`_fetch_ints`, `_fetch_rows`,
    `_insert`) and may override `_insert_many` when the backend can do better
    than one write at a time. Everything else — caching, batching, collision
    probing — lives here so all backends behave identically.
    """

    def __init__(self, cache_size: int = _DEFAULT_CACHE_SIZE) -> None:
        self._forward: dict[str, int] = {}
        self._reverse: dict[int, tuple[str, str]] = {}
        self._cache_size = cache_size
        self._lock = threading.Lock()

    # -- storage hooks ------------------------------------------------

    def _fetch_ints(self, uuids: list[str]) -> dict[str, int]:
        """Return the ints already assigned to *uuids*."""
        raise NotImplementedError()

    def _fetch_rows(self, entity_ids: list[int]) -> dict[int, tuple[str, str]]:
        """Return {id: (uuid, entity_type)} for the ids that are mapped."""
        raise NotImplementedError()

    def _insert(self, entity_id: int, uuid: str, entity_type: str) -> bool:
        """Claim *entity_id* for *uuid*. False if the slot or uuid is taken."""
        raise NotImplementedError()

    def _insert_many(self, rows: list[tuple[int, str, str]]) -> None:
        """Best-effort bulk claim; conflicts are left for the probing path."""
        for entity_id, uuid, entity_type in rows:
            self._insert(entity_id, uuid, entity_type)

    # -- cache --------------------------------------------------------

    def _remember(self, entity_id: int, uuid: str, entity_type: str) -> None:
        if len(self._forward) >= self._cache_size:
            self._forward.clear()
            self._reverse.clear()
        self._forward[uuid] = entity_id
        self._reverse[entity_id] = (uuid, entity_type)

    # -- public api ---------------------------------------------------

    def to_int(self, uuid: str, entity_type: str) -> int:
        """Return the stable int for *uuid*, assigning one on first sight."""
        cached = self._forward.get(uuid)
        if cached is not None:
            return cached
        return self.to_ints([(uuid, entity_type)])[uuid]

    def to_ints(self, items: list[tuple[str, str]]) -> dict[str, int]:
        """Map many (uuid, entity_type) pairs at once.

        Warming this before a conversion turns what would be one round trip per
        entity into one per batch. Repeats are free.
        """
        wanted: dict[str, str] = {}
        resolved: dict[str, int] = {}
        for uuid, entity_type in items:
            if uuid is None:
                continue
            cached = self._forward.get(uuid)
            if cached is not None:
                resolved[uuid] = cached
            else:
                wanted.setdefault(uuid, entity_type)

        if not wanted:
            return resolved

        with self._lock:
            # Another thread may have filled these in while we waited.
            pending = {u: t for u, t in wanted.items() if u not in self._forward}
            resolved.update({u: self._forward[u] for u in wanted if u in self._forward})

            if pending:
                for chunk in _chunked(list(pending)):
                    for uuid, entity_id in self._fetch_ints(chunk).items():
                        self._remember(entity_id, uuid, pending[uuid])
                        resolved[uuid] = entity_id

                missing = {u: t for u, t in pending.items() if u not in resolved}
                if missing:
                    resolved.update(self._assign(missing))

        return resolved

    def _assign(self, missing: dict[str, str]) -> dict[str, int]:
        """Claim ids for uuids that have none, bulk first then probing."""
        candidates = [
            (surrogate_id(uuid), uuid, entity_type)
            for uuid, entity_type in missing.items()
        ]
        for chunk in _chunked(candidates):
            self._insert_many(chunk)

        assigned: dict[str, int] = {}
        for chunk in _chunked(list(missing)):
            for uuid, entity_id in self._fetch_ints(chunk).items():
                self._remember(entity_id, uuid, missing[uuid])
                assigned[uuid] = entity_id

        # Whatever the bulk write could not place lost a race or hit a
        # colliding int; re-salt those one at a time.
        for uuid, entity_type in missing.items():
            if uuid in assigned:
                continue
            assigned[uuid] = self._assign_one(uuid, entity_type)
        return assigned

    def _assign_one(self, uuid: str, entity_type: str) -> int:
        for salt in range(_MAX_PROBES):
            candidate = surrogate_id(uuid, salt)
            if self._insert(candidate, uuid, entity_type):
                self._remember(candidate, uuid, entity_type)
                return candidate
            # Either another writer claimed this uuid, or the int belongs to a
            # different one. Re-read before probing further.
            existing = self._fetch_ints([uuid]).get(uuid)
            if existing is not None:
                self._remember(existing, uuid, entity_type)
                return existing
        raise RuntimeError(f"Could not allocate a surrogate id for {uuid}")

    def to_uuid(self, entity_id: int) -> Optional[str]:
        """Return the UUID for *entity_id*, or None when it was never mapped."""
        row = self._row(entity_id)
        return row[0] if row else None

    def entity_type_for(self, entity_id: int) -> Optional[str]:
        """Return the ftrack entity type recorded alongside *entity_id*."""
        row = self._row(entity_id)
        return row[1] if row else None

    def to_uuids(self, entity_ids: list[int]) -> dict[int, str]:
        """Resolve many ints back to UUIDs in one round trip."""
        resolved: dict[int, str] = {}
        pending: list[int] = []
        for entity_id in entity_ids:
            row = self._reverse.get(entity_id)
            if row is not None:
                resolved[entity_id] = row[0]
            else:
                pending.append(entity_id)

        for chunk in _chunked(pending):
            for entity_id, (uuid, entity_type) in self._fetch_rows(chunk).items():
                self._remember(entity_id, uuid, entity_type)
                resolved[entity_id] = uuid
        return resolved

    def _row(self, entity_id: int) -> Optional[tuple[str, str]]:
        cached = self._reverse.get(entity_id)
        if cached is not None:
            return cached
        row = self._fetch_rows([entity_id]).get(entity_id)
        if row is not None:
            self._remember(entity_id, row[0], row[1])
        return row


class InMemoryIdMap(FtrackIdMap):
    """Process-local map. For tests and single-shot scripts only."""

    def __init__(self, cache_size: int = _DEFAULT_CACHE_SIZE) -> None:
        super().__init__(cache_size)
        self._store: dict[int, tuple[str, str]] = {}
        self._by_uuid: dict[str, int] = {}

    def _fetch_ints(self, uuids: list[str]) -> dict[str, int]:
        return {u: self._by_uuid[u] for u in uuids if u in self._by_uuid}

    def _fetch_rows(self, entity_ids: list[int]) -> dict[int, tuple[str, str]]:
        return {i: self._store[i] for i in entity_ids if i in self._store}

    def _insert(self, entity_id: int, uuid: str, entity_type: str) -> bool:
        if entity_id in self._store or uuid in self._by_uuid:
            return False
        self._store[entity_id] = (uuid, entity_type)
        self._by_uuid[uuid] = entity_id
        return True


class SqliteIdMap(FtrackIdMap):
    """File-backed map. Survives restarts on a single host."""

    def __init__(
        self, db_path: Optional[Path] = None, cache_size: int = _DEFAULT_CACHE_SIZE
    ) -> None:
        super().__init__(cache_size)
        if db_path is None:
            db_path = Path(os.getenv("FTRACK_ID_MAP_PATH", "/tmp/dna_ftrack_id_map.db"))
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS ftrack_id_map ("
                "  id INTEGER PRIMARY KEY,"
                "  uuid TEXT NOT NULL UNIQUE,"
                "  entity_type TEXT NOT NULL"
                ")"
            )
            conn.commit()
        finally:
            conn.close()

    def _fetch_ints(self, uuids: list[str]) -> dict[str, int]:
        placeholders = ",".join("?" * len(uuids))
        conn = self._connect()
        try:
            rows = conn.execute(
                f"SELECT id, uuid FROM ftrack_id_map WHERE uuid IN ({placeholders})",
                uuids,
            ).fetchall()
        finally:
            conn.close()
        return {row["uuid"]: int(row["id"]) for row in rows}

    def _fetch_rows(self, entity_ids: list[int]) -> dict[int, tuple[str, str]]:
        placeholders = ",".join("?" * len(entity_ids))
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT id, uuid, entity_type FROM ftrack_id_map "
                f"WHERE id IN ({placeholders})",
                entity_ids,
            ).fetchall()
        finally:
            conn.close()
        return {int(r["id"]): (r["uuid"], r["entity_type"]) for r in rows}

    def _insert(self, entity_id: int, uuid: str, entity_type: str) -> bool:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO ftrack_id_map (id, uuid, entity_type) VALUES (?, ?, ?)",
                (entity_id, uuid, entity_type),
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False
        finally:
            conn.close()

    def _insert_many(self, rows: list[tuple[int, str, str]]) -> None:
        conn = self._connect()
        try:
            # OR IGNORE skips whichever rows conflict on id or uuid; the
            # re-read in _assign spots them and falls back to probing.
            conn.executemany(
                "INSERT OR IGNORE INTO ftrack_id_map (id, uuid, entity_type) "
                "VALUES (?, ?, ?)",
                rows,
            )
            conn.commit()
        finally:
            conn.close()


class MongoIdMap(FtrackIdMap):
    """Mongo-backed map, shared by every instance pointed at the same database.

    Uses the synchronous client on purpose: the whole prodtrack provider
    surface is synchronous, and an id lookup sits in the middle of it.
    """

    COLLECTION = "ftrack_id_map"

    def __init__(
        self,
        mongo_url: Optional[str] = None,
        database: str = "dna",
        cache_size: int = _DEFAULT_CACHE_SIZE,
    ) -> None:
        super().__init__(cache_size)
        self._mongo_url = mongo_url or os.getenv(
            "MONGODB_URL", "mongodb://localhost:27017"
        )
        self._database = database
        self._collection: Any = None

    @property
    def collection(self) -> Any:
        if self._collection is None:
            from pymongo import MongoClient

            client: Any = MongoClient(self._mongo_url)
            self._collection = client[self._database][self.COLLECTION]
            self._collection.create_index("uuid", unique=True, name="ftrack_uuid")
        return self._collection

    def _fetch_ints(self, uuids: list[str]) -> dict[str, int]:
        rows = self.collection.find({"uuid": {"$in": uuids}}, {"_id": 1, "uuid": 1})
        return {row["uuid"]: int(row["_id"]) for row in rows}

    def _fetch_rows(self, entity_ids: list[int]) -> dict[int, tuple[str, str]]:
        rows = self.collection.find({"_id": {"$in": entity_ids}})
        return {
            int(row["_id"]): (row["uuid"], row.get("entity_type", "")) for row in rows
        }

    def _insert(self, entity_id: int, uuid: str, entity_type: str) -> bool:
        from pymongo.errors import DuplicateKeyError

        try:
            self.collection.insert_one(
                {"_id": entity_id, "uuid": uuid, "entity_type": entity_type}
            )
            return True
        except DuplicateKeyError:
            return False

    def _insert_many(self, rows: list[tuple[int, str, str]]) -> None:
        from pymongo.errors import BulkWriteError

        try:
            # Unordered so one conflict does not abandon the rest of the batch;
            # the re-read in _assign catches whatever did not land.
            self.collection.insert_many(
                [
                    {"_id": entity_id, "uuid": uuid, "entity_type": entity_type}
                    for entity_id, uuid, entity_type in rows
                ],
                ordered=False,
            )
        except BulkWriteError:
            pass


def get_ftrack_id_map() -> FtrackIdMap:
    """Build the id map named by FTRACK_ID_MAP.

    Defaults to mongodb, matching STORAGE_PROVIDER: the deployed backend runs
    several instances against one database, and sqlite on a container's local
    disk would hand each instance a different, short-lived map.
    """
    backend = os.getenv("FTRACK_ID_MAP", "mongodb").lower()

    if backend == "mongodb":
        return MongoIdMap()
    if backend == "sqlite":
        return SqliteIdMap()
    if backend == "memory":
        return InMemoryIdMap()

    raise ValueError(f"Unknown ftrack id map backend: {backend}")
