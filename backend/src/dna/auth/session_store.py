"""Session store for DNA auth — MongoDB-backed.

Responsibilities
----------------
- Create, read, update, delete user sessions keyed by ``session_id``.
- Manage the JWT revocation blocklist (by ``jti``).

MongoDB collection schema
--------------------------
Collection ``dna_sessions``:
    _id          : session_id (str)
    jti          : id of the most recently issued JWT (superseded ids are blocklisted)
    email        : str
    name         : str
    auth_provider: 'shotgrid_pat'
    created_at   : float (unix timestamp)
    expires_at   : datetime  ← TTL index on this field
    shotgrid     : sub-document — identity only, never a credential
      user_id      : int
      username     : str       (ShotGrid login name — used for sudo_as_login)
    dna_refresh_token_hash         : SHA-256 of the current DNA refresh secret
    dna_previous_refresh_token_hash: SHA-256 of the secret it replaced
    dna_refresh_rotated_at         : float (unix timestamp of the last rotation)

Collection ``dna_token_blocklist``:
    _id          : jti (str)
    expires_at   : datetime  ← TTL index

Environment variables
---------------------
``MONGODB_URL``          - Default: ``mongodb://localhost:27017``
``MONGODB_DB``           - Default: ``dna``
``SESSION_TTL_SECONDS``  - Default: ``28800`` (8 hours)
"""

from __future__ import annotations

import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Provider-specific credential models ──────────────────────────────────────
#
# Each auth provider that stores credentials in the session gets its own typed
# dataclass. When a new production-tracking provider is added (e.g. Ftrack),
# add a new FtrackCredentials dataclass and an optional field on UserSession.
# Existing providers and their credentials are never touched.


@dataclass
class ShotGridCredentials:
    """The ShotGrid identity behind a PAT session.

    Holds no credential of any kind. The password is verified once at login
    and discarded, and the tokens ShotGrid returns are discarded with it: every
    request runs as the script account with ``sudo_as_login``, so a user token
    is never needed. A leaked session document therefore grants no ShotGrid
    access.

    These fields are ShotGrid-specific and should never be accessed by code
    that is not in the ShotGrid auth or prodtrack provider.

    Fields
    ------
    user_id  : Integer primary key of the HumanUser record in ShotGrid. Used to
               re-check the account's status on refresh.
    username : ShotGrid login name — passed as sudo_as_login on every
               prodtrack request.  Never overwritten after creation.
    """

    # Default "" on username keeps sessions written before the field existed
    # deserialisable.  Such a session is not usable: the request path rejects a
    # missing username with 401 rather than degrading to script-account access.
    user_id: int
    username: str = ""  # ShotGrid login name — never overwritten after login


# ── Core session model ────────────────────────────────────────────────────────


@dataclass
class UserSession:
    """Provider-agnostic session stored in the backend.

    Generic identity fields live at the top level.  Provider-specific
    credentials are nested in typed sub-objects (``shotgrid``, and in future
    ``ftrack``, etc.) so they can evolve independently.

    Fields
    ------
    session_id    : UUID — primary key, stored in the DNA JWT as ``session_id``.
    jti           : Id of the JWT most recently issued for this session.
                    Rotated on refresh; the superseded jti is added to the
                    revocation blocklist, which is what actually invalidates
                    the old token on the next request.
    email         : Canonical user email, provider-agnostic.
    name          : Display name.
    auth_provider : Which auth path created this session.
    created_at    : Unix timestamp of session creation.
    shotgrid      : ShotGrid-specific credentials.
    dna_refresh_token_hash:
                    SHA-256 of the current DNA refresh token secret.  The raw
                    secret exists only in the browser's httpOnly cookie, so a
                    database leak does not yield usable refresh tokens.
    dna_previous_refresh_token_hash / dna_refresh_rotated_at:
                    The secret replaced by the most recent rotation, and when.
                    Presenting it inside a short grace window is a benign
                    concurrent refresh; presenting it later means the token was
                    copied, and the session is revoked.
    """

    session_id: str
    jti: str
    email: str
    name: str
    auth_provider: str  # 'shotgrid_pat'
    created_at: float = field(default_factory=time.time)

    # ── Provider credentials — add new providers here ─────────────────── #
    shotgrid: Optional[ShotGridCredentials] = None
    # future: ftrack: Optional[FtrackCredentials] = None

    # ── DNA refresh token — hashes only, never the raw secret ─────────── #
    dna_refresh_token_hash: str = ""
    dna_previous_refresh_token_hash: str = ""
    dna_refresh_rotated_at: float = 0.0

    # ── Serialisation helpers ──────────────────────────────────────────── #

    def to_dict(self) -> dict:
        """Return a plain dict suitable for JSON or MongoDB storage."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "UserSession":
        """Reconstruct from a plain dict (MongoDB document or JSON).

        Generic: automatically deserializes any field whose stored value is a
        dict and whose declared type is Optional[<SomeDataclass>].  No changes
        needed here when new provider credential classes are added — just
        declare the field on UserSession and the right class will be
        instantiated automatically.

        How it works
        ------------
        Python's ``get_type_hints`` returns the actual resolved types for each
        field.  For Optional[X] (i.e. Union[X, None]) we unwrap the inner type
        X, check whether it is a dataclass, and if the stored value is a dict
        we call X(**value) to reconstruct it.  Primitive fields (str, int,
        float) are passed through unchanged.
        """
        import dataclasses as _dc
        from typing import Union, get_args, get_origin, get_type_hints

        hints = get_type_hints(cls)
        processed = dict(data)  # work on a copy so we don't mutate the caller's dict

        for field_name, type_hint in hints.items():
            raw = processed.get(field_name)
            if not isinstance(raw, dict):
                continue  # nothing to deserialize for primitive / missing fields

            # Unwrap Optional[X]  →  X
            origin = get_origin(type_hint)
            if origin is Union:
                inner_types = [t for t in get_args(type_hint) if t is not type(None)]
                if len(inner_types) == 1 and _dc.is_dataclass(inner_types[0]):
                    processed[field_name] = inner_types[0](**raw)

        return cls(**processed)

    # Legacy property aliases — kept so existing call-sites continue to work.
    # Update call-sites to use session.shotgrid.* directly when convenient.

    @property
    def sg_username(self) -> Optional[str]:
        """ShotGrid login name — passed to ShotGrid as ``sudo_as_login``."""
        return self.shotgrid.username if self.shotgrid else None

    @property
    def sg_user_id(self) -> int:
        return self.shotgrid.user_id if self.shotgrid else 0


# ── Abstract interface ────────────────────────────────────────────────────────
#
# Any new storage backend (DynamoDB, Postgres, Redis, etc.) implements this
# interface. The rest of the codebase only depends on AbstractSessionStore,
# never on a concrete implementation.


class AbstractSessionStore(ABC):
    """Interface for DNA session storage."""

    # ── Sessions ───────────────────────────────────────────────────────── #

    @abstractmethod
    def create_session(self, session: UserSession) -> None:
        """Persist a new session."""

    @abstractmethod
    def get_session(self, session_id: str) -> Optional[UserSession]:
        """Return session or None if absent / expired."""

    @abstractmethod
    def update_session(self, session: UserSession) -> None:
        """Overwrite an existing session and reset its TTL."""

    @abstractmethod
    def delete_session(self, session_id: str) -> None:
        """Delete a session (called on logout)."""

    @abstractmethod
    def delete_sessions_for_email(self, email: str) -> int:
        """Delete every session belonging to a user. Returns how many were removed."""

    @abstractmethod
    def rotate_refresh_token(
        self, session_id: str, expected_hash: str, new_hash: str, new_jti: str
    ) -> Optional[UserSession]:
        """Atomically swap the refresh-token hash, if it still equals ``expected_hash``.

        The comparison and the write must be one operation. Two requests that
        both read the same hash and then both write would each hand the browser
        a different secret, only one of which the server keeps.

        Returns:
            The updated session, or None if another request rotated it first
            or the session has ended.
        """

    @abstractmethod
    def get_session_ttl(self, session_id: str) -> int:
        """Return remaining TTL in seconds, or -2 if absent."""

    # ── JWT blocklist ──────────────────────────────────────────────────── #

    @abstractmethod
    def revoke_token(self, jti: str, remaining_ttl_seconds: int) -> None:
        """Add a JWT jti to the revocation blocklist."""

    @abstractmethod
    def is_token_revoked(self, jti: str) -> bool:
        """Return True if the jti is on the blocklist."""

    # ── Health ─────────────────────────────────────────────────────────── #

    @abstractmethod
    def ping(self) -> bool:
        """Return True if the backend is reachable."""


# ── MongoDB implementation ────────────────────────────────────────────────────


class MongoSessionStore(AbstractSessionStore):
    """MongoDB-backed session store.

    Uses the same MongoDB instance as the rest of DNA — no extra service.

    Collections
    -----------
    dna_sessions       — user sessions, TTL-indexed on ``expires_at``
    dna_token_blocklist — revoked JTIs, TTL-indexed on ``expires_at``

    TTL notes
    ---------
    MongoDB's TTL background thread runs every ~60 seconds.  Documents are
    deleted *after* ``expires_at``, so entries may linger up to 60 s longer
    than their TTL — this only affects cleanup timing, not correctness.
    Blocklist entries staying slightly longer is *more* conservative (safer).
    """

    def __init__(
        self,
        mongo_url: Optional[str] = None,
        db_name: Optional[str] = None,
        session_ttl: Optional[int] = None,
    ) -> None:
        try:
            from pymongo import ASCENDING, MongoClient
        except ImportError:
            raise ImportError(
                "pymongo is required for MongoDB session storage. "
                "Install with: pip install pymongo"
            )

        self._mongo_url = mongo_url or os.getenv(
            "MONGODB_URL", "mongodb://localhost:27017"
        )
        self._db_name = db_name or os.getenv("MONGODB_DB", "dna")
        self.session_ttl = session_ttl or int(os.getenv("SESSION_TTL_SECONDS", "28800"))

        self._client = MongoClient(
            self._mongo_url,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            # Return aware datetimes. Naive ones make expires_at comparisons and
            # .timestamp() depend on the host's local timezone.
            tz_aware=True,
        )
        db = self._client[self._db_name]
        self._sessions = db["dna_sessions"]
        self._blocklist = db["dna_token_blocklist"]

        # Ensure TTL indexes exist (idempotent)
        self._sessions.create_index(
            [("expires_at", ASCENDING)],
            expireAfterSeconds=0,
            background=True,
        )
        # Supports logout-everywhere without a collection scan.
        self._sessions.create_index([("email", ASCENDING)], background=True)
        self._blocklist.create_index(
            [("expires_at", ASCENDING)],
            expireAfterSeconds=0,
            background=True,
        )

    def _expires_at(self, ttl_seconds: int) -> datetime:
        return datetime.fromtimestamp(time.time() + ttl_seconds, tz=timezone.utc)

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _active(self, session_id: str) -> dict:
        """Filter matching a session that has not passed its idle timeout.

        MongoDB's TTL monitor deletes expired documents only about once a
        minute, and later under load, so expiry is enforced here as well.
        """
        return {"_id": session_id, "expires_at": {"$gt": self._now()}}

    def _to_session(self, doc: dict, session_id: str) -> Optional[UserSession]:
        try:
            doc = dict(doc)
            doc["session_id"] = doc.pop("_id")
            doc.pop("expires_at", None)
            return UserSession.from_dict(doc)
        except (KeyError, TypeError) as exc:
            logger.warning(
                "Failed to deserialize session '%s': %s. The document may be "
                "from an older schema — deleting it.",
                session_id,
                exc,
            )
            # Remove the corrupt document so the user is prompted to log in again
            # rather than seeing repeated errors on every request.
            try:
                self._sessions.delete_one({"_id": session_id})
            except Exception as delete_exc:
                # Non-fatal: returning None still forces a fresh login, and the
                # TTL index removes the document eventually.
                logger.warning(
                    "Could not delete corrupt session '%s': %s", session_id, delete_exc
                )
            return None

    # ── Sessions ───────────────────────────────────────────────────────── #

    def create_session(self, session: UserSession) -> None:
        doc = session.to_dict()
        doc["_id"] = doc.pop("session_id")
        doc["expires_at"] = self._expires_at(self.session_ttl)
        self._sessions.insert_one(doc)

    def get_session(self, session_id: str) -> Optional[UserSession]:
        doc = self._sessions.find_one(self._active(session_id))
        return None if doc is None else self._to_session(doc, session_id)

    def update_session(self, session: UserSession) -> None:
        doc = session.to_dict()
        doc.pop("session_id")
        doc["expires_at"] = self._expires_at(self.session_ttl)
        self._sessions.replace_one(
            {"_id": session.session_id},
            {**doc, "_id": session.session_id},
            upsert=True,
        )

    def delete_session(self, session_id: str) -> None:
        self._sessions.delete_one({"_id": session_id})

    def delete_sessions_for_email(self, email: str) -> int:
        return self._sessions.delete_many({"email": email}).deleted_count

    def rotate_refresh_token(
        self, session_id: str, expected_hash: str, new_hash: str, new_jti: str
    ) -> Optional[UserSession]:
        from pymongo import ReturnDocument

        # findOneAndUpdate matches and writes as a single atomic operation, so
        # exactly one of any concurrent refreshes of the same secret succeeds.
        doc = self._sessions.find_one_and_update(
            {**self._active(session_id), "dna_refresh_token_hash": expected_hash},
            {
                "$set": {
                    "dna_refresh_token_hash": new_hash,
                    "dna_previous_refresh_token_hash": expected_hash,
                    "dna_refresh_rotated_at": time.time(),
                    "jti": new_jti,
                    # A refresh is activity: restart the idle timeout.
                    "expires_at": self._expires_at(self.session_ttl),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return None if doc is None else self._to_session(doc, session_id)

    def get_session_ttl(self, session_id: str) -> int:
        doc = self._sessions.find_one({"_id": session_id}, {"expires_at": 1})
        if not doc or "expires_at" not in doc:
            return -2
        remaining = doc["expires_at"].timestamp() - time.time()
        return max(0, int(remaining))

    # ── JWT blocklist ──────────────────────────────────────────────────── #

    def revoke_token(self, jti: str, remaining_ttl_seconds: int) -> None:
        if remaining_ttl_seconds <= 0:
            return
        self._blocklist.replace_one(
            {"_id": jti},
            {"_id": jti, "expires_at": self._expires_at(remaining_ttl_seconds)},
            upsert=True,
        )

    def is_token_revoked(self, jti: str) -> bool:
        return self._blocklist.find_one({"_id": jti}) is not None

    # ── Health ─────────────────────────────────────────────────────────── #

    def ping(self) -> bool:
        try:
            self._client.admin.command("ping")
            return True
        except Exception:
            return False


# ── Singleton factory ─────────────────────────────────────────────────────────

_session_store: Optional[AbstractSessionStore] = None


def get_session_store() -> AbstractSessionStore:
    """Return the application-wide session store singleton (MongoDB)."""
    global _session_store
    if _session_store is None:
        _session_store = MongoSessionStore()
    return _session_store
