"""Production auth tests — session store, PAT login, and sudo_as_login routing.

Run with:
    pytest tests/test_auth_prod.py -v

No external services or extra packages are required: MongoDB collections are
replaced with an in-memory fake, so these tests exercise the real
``MongoSessionStore`` logic without a database.

What is deliberately covered here
---------------------------------
The security contract of Issue #55, not just the happy path:

* the session never carries a password or ShotGrid token (structurally, not
  by convention),
* credentials never reach a log line,
* an authenticated request is always scoped with ``sudo_as_login``,
* a session that cannot supply a ShotGrid login is rejected rather than
  silently downgraded to the full-permission script account,
* one user cannot read another user's projects,
* ShotGrid permission denials become 403, not 500.
"""

from __future__ import annotations

import copy
import dataclasses
import os
import threading
import time
import uuid
from typing import Any, Optional
from unittest import mock

import pytest

# ─────────────────────────────────────────────────────────────────────────── #
# In-memory MongoDB doubles                                                    #
# ─────────────────────────────────────────────────────────────────────────── #


class _FakeCollection:
    """Minimal stand-in for a pymongo Collection.

    Implements only what MongoSessionStore uses. Every operation holds a lock,
    so ``find_one_and_update`` is atomic exactly as it is in MongoDB — which is
    what the concurrent-refresh tests rely on. Copies are handed out so callers
    cannot mutate stored state by accident, matching pymongo.
    """

    def __init__(self) -> None:
        self.docs: dict[Any, dict] = {}
        self._lock = threading.RLock()

    @staticmethod
    def _matches(doc: dict, query: dict) -> bool:
        for field, expected in query.items():
            actual = doc.get(field)
            if isinstance(expected, dict) and "$gt" in expected:
                if actual is None or not actual > expected["$gt"]:
                    return False
            elif actual != expected:
                return False
        return True

    def _find(self, query: dict):
        return next((d for d in self.docs.values() if self._matches(d, query)), None)

    @staticmethod
    def _apply_set(doc: dict, update: dict) -> None:
        for dotted, value in update.get("$set", {}).items():
            target = doc
            *parents, leaf = dotted.split(".")
            for key in parents:
                target = target.setdefault(key, {})
            target[leaf] = value

    def create_index(self, *_args, **_kwargs) -> None:
        return None

    def insert_one(self, doc: dict) -> None:
        with self._lock:
            self.docs[doc["_id"]] = copy.deepcopy(doc)

    def find_one(self, query: dict, _projection: Optional[dict] = None):
        with self._lock:
            doc = self._find(query)
            return copy.deepcopy(doc) if doc is not None else None

    def find_one_and_update(self, query: dict, update: dict, return_document=None):
        with self._lock:
            doc = self._find(query)
            if doc is None:
                return None
            self._apply_set(doc, update)
            return copy.deepcopy(doc)

    def update_one(self, query: dict, update: dict) -> None:
        with self._lock:
            doc = self._find(query)
            if doc is not None:
                self._apply_set(doc, update)

    def replace_one(self, query: dict, doc: dict, upsert: bool = False) -> None:
        with self._lock:
            key = query.get("_id")
            if key in self.docs or upsert:
                self.docs[key] = copy.deepcopy(doc)

    def delete_one(self, query: dict) -> None:
        with self._lock:
            self.docs.pop(query.get("_id"), None)

    def delete_many(self, query: dict):
        with self._lock:
            doomed = [k for k, d in self.docs.items() if self._matches(d, query)]
            for key in doomed:
                del self.docs[key]
            return mock.Mock(deleted_count=len(doomed))


def _make_store(ttl: int = 3600):
    """Return a MongoSessionStore wired to in-memory collections."""
    from dna.auth.session_store import MongoSessionStore

    store = MongoSessionStore.__new__(MongoSessionStore)
    store.session_ttl = ttl
    store._sessions = _FakeCollection()
    store._blocklist = _FakeCollection()
    store._client = mock.MagicMock()
    return store


def _make_session(**overrides):
    """Build a UserSession with nested ShotGrid credentials."""
    from dna.auth.session_store import ShotGridCredentials, UserSession

    shotgrid = ShotGridCredentials(
        user_id=overrides.pop("sg_user_id", 42),
        username=overrides.pop("sg_username", "jane.artist"),
    )
    defaults = dict(
        session_id=str(uuid.uuid4()),
        jti=str(uuid.uuid4()),
        email="jane@studio.com",
        name="Jane Artist",
        auth_provider="shotgrid_pat",
        shotgrid=shotgrid,
    )
    defaults.update(overrides)
    return UserSession(**defaults)


# ═══════════════════════════════════════════════════════════════════════════ #
# Credential model — the security contract of Issue #55                       #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestShotGridCredentials:
    """The session must never be able to hold a user credential."""

    def test_holds_identity_only(self):
        """Structural guard: no password or ShotGrid token can be reintroduced silently.

        The reviewer's objection on PR #164 was that passwords were persisted.
        A stored ShotGrid token would be just as usable against ShotGrid, so the
        field set is pinned here rather than left to a security review.
        """
        from dna.auth.session_store import ShotGridCredentials

        field_names = {f.name for f in dataclasses.fields(ShotGridCredentials)}
        assert field_names == {"user_id", "username"}

    @pytest.mark.parametrize("secret", ["password", "access_token", "refresh_token"])
    def test_constructor_rejects_credentials(self, secret):
        from dna.auth.session_store import ShotGridCredentials

        with pytest.raises(TypeError):
            ShotGridCredentials(user_id=1, **{secret: "hunter2"})

    def test_username_survives_round_trip(self):
        """username is the sudo_as_login anchor — it must persist verbatim."""
        session = _make_session(sg_username="jane.artist")
        restored = type(session).from_dict(session.to_dict())
        assert restored.sg_username == "jane.artist"


# ═══════════════════════════════════════════════════════════════════════════ #
# Session store                                                               #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestMongoSessionStore:

    def test_create_and_get_session(self):
        store = _make_store()
        session = _make_session()
        store.create_session(session)

        retrieved = store.get_session(session.session_id)
        assert retrieved is not None
        assert retrieved.email == "jane@studio.com"
        assert retrieved.sg_username == "jane.artist"
        assert retrieved.sg_user_id == 42

    def test_stored_document_contains_no_password(self):
        """Belt and braces: inspect what actually lands in the collection."""
        store = _make_store()
        session = _make_session()
        store.create_session(session)

        raw = store._sessions.docs[session.session_id]
        assert "password" not in raw
        assert set(raw["shotgrid"]) == {"user_id", "username"}

    def test_get_missing_session_returns_none(self):
        store = _make_store()
        assert store.get_session("does-not-exist") is None

    def test_delete_session(self):
        store = _make_store()
        session = _make_session()
        store.create_session(session)
        store.delete_session(session.session_id)
        assert store.get_session(session.session_id) is None

    def test_update_session_replaces_values(self):
        store = _make_store()
        session = _make_session()
        store.create_session(session)

        session.name = "Jane Q. Artist"
        store.update_session(session)

        updated = store.get_session(session.session_id)
        assert updated.name == "Jane Q. Artist"

    def test_corrupt_document_is_deleted_not_raised(self):
        """An old-schema document must not 500 every request that touches it."""
        store = _make_store()
        store._sessions.docs["broken"] = {
            "_id": "broken",
            "unexpected": True,
            "expires_at": store._expires_at(3600),
        }

        assert store.get_session("broken") is None
        assert "broken" not in store._sessions.docs

    def test_session_holding_shotgrid_tokens_is_deleted_on_read(self):
        """Sessions written before tokens were dropped must not keep them around."""
        store = _make_store()
        session = _make_session()
        store.create_session(session)
        store._sessions.docs[session.session_id]["shotgrid"].update(
            access_token="old-sg-access", refresh_token="old-sg-refresh"
        )

        assert store.get_session(session.session_id) is None
        assert session.session_id not in store._sessions.docs

    def test_revoke_and_check_token(self):
        store = _make_store()
        jti = str(uuid.uuid4())
        assert not store.is_token_revoked(jti)
        store.revoke_token(jti, remaining_ttl_seconds=3600)
        assert store.is_token_revoked(jti)

    def test_revoke_zero_ttl_not_stored(self):
        store = _make_store()
        jti = str(uuid.uuid4())
        store.revoke_token(jti, remaining_ttl_seconds=0)
        assert not store.is_token_revoked(jti)

    def test_session_ttl_reports_remaining_seconds(self):
        store = _make_store(ttl=3600)
        session = _make_session()
        store.create_session(session)

        remaining = store.get_session_ttl(session.session_id)
        assert 3500 < remaining <= 3600
        assert store.get_session_ttl("missing") == -2


# ═══════════════════════════════════════════════════════════════════════════ #
# ShotGridSSOProvider                                                         #
# ═══════════════════════════════════════════════════════════════════════════ #


def _make_provider(
    secret: str = "test-secret-key-32-chars-minimum!!",
    access_seconds: int = 15 * 60,
    max_session_seconds: int = 12 * 60 * 60,
):
    from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider

    provider = ShotGridSSOProvider.__new__(ShotGridSSOProvider)
    provider._secret = secret
    provider._algorithm = "HS256"
    provider._expire_seconds = access_seconds
    provider._max_session_seconds = max_session_seconds
    provider._issuer = "dna-backend"
    provider._audience = "dna-api"
    provider._sessions = _make_store()
    provider._sg_auth_override = mock.MagicMock()
    return provider


def _wire_shotgrid(provider, login_name="jane.artist"):
    """Make the mocked ShotGrid client accept a login and report the account active."""
    from dna.auth.shotgrid_auth_client import SGTokenSet, SGUserInfo

    provider._sg_auth_override.login_user.return_value = SGTokenSet(
        access_token="sg-access-token",
        refresh_token="sg-refresh-token",
        token_type="Bearer",
        expires_in=3600,
    )
    provider._sg_auth_override.get_user_info.return_value = SGUserInfo(
        sg_user_id=42, email="jane@studio.com", name="Jane Artist", login=login_name
    )
    provider._sg_auth_override.confirm_user_active.return_value = None
    return provider


def _logged_in(provider=None, login_name="jane.artist"):
    """Log a user in; return (provider, AuthResult, session)."""
    provider = _wire_shotgrid(provider or _make_provider(), login_name)
    result = provider.login(
        username="jane@studio.com", password="s3cret-password-value"
    )
    claims = provider._decode_jwt(result.body["access_token"], allow_expired=True)
    return provider, result, provider._sessions.get_session(claims["session_id"])


class TestJwtSecretValidation:
    """HS256 tokens are only as strong as the signing key."""

    def _construct(self, secret):
        from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider

        env = {} if secret is None else {"JWT_SECRET_KEY": secret}
        with mock.patch.dict(os.environ, env, clear=True):
            return ShotGridSSOProvider(session_store=_make_store())

    def test_missing_secret_refuses_to_start(self):
        with pytest.raises(ValueError, match="at least 32 characters"):
            self._construct(None)

    def test_short_secret_refuses_to_start(self):
        """Previously only one placeholder string was rejected; "abc" was accepted."""
        with pytest.raises(ValueError, match=r"got 3"):
            self._construct("abc")

    def test_secret_of_minimum_length_is_accepted(self):
        provider = self._construct("x" * 32)
        assert provider._secret == "x" * 32

    def test_access_tokens_default_to_fifteen_minutes(self):
        assert self._construct("x" * 32)._expire_seconds == 15 * 60

    def test_sessions_default_to_a_twelve_hour_ceiling(self):
        assert self._construct("x" * 32)._max_session_seconds == 12 * 60 * 60


class TestPatLogin:
    """POST /auth/login — where the password is used once and thrown away."""

    def test_password_is_never_persisted(self):
        provider, _, _ = _logged_in()

        stored = list(provider._sessions._sessions.docs.values())
        assert len(stored) == 1
        assert "s3cret-password-value" not in repr(stored[0])
        assert "password" not in stored[0]["shotgrid"]

    def test_password_is_verified_against_shotgrid_exactly_once(self):
        provider, _, _ = _logged_in()

        provider._sg_auth_override.login_user.assert_called_once_with(
            "jane@studio.com", "s3cret-password-value"
        )
        # Identity is resolved from the username alone.
        provider._sg_auth_override.get_user_info.assert_called_once_with(
            "jane@studio.com"
        )

    def test_access_token_carries_no_credentials(self):
        """Decode and inspect claims rather than substring-matching base64."""
        provider, result, _ = _logged_in()
        claims = provider._decode_jwt(result.body["access_token"])

        assert set(claims) == {
            "jti",
            "sub",
            "session_id",
            "email",
            "name",
            "iat",
            "exp",
            "iss",
            "aud",
        }
        assert result.body["token_type"] == "Bearer"
        assert result.body["user"]["shotgrid_user_id"] == 42
        assert "refresh_token" not in result.body

    def test_access_token_is_short_lived(self):
        provider, result, _ = _logged_in()
        claims = provider._decode_jwt(result.body["access_token"])

        assert claims["exp"] - claims["iat"] == 15 * 60
        assert result.body["expires_in"] == 15 * 60

    def test_refresh_token_is_issued_as_cookie_and_stored_only_hashed(self):
        import hashlib

        provider, result, session = _logged_in()
        cookie_session_id, _, secret = result.refresh_cookie.partition(".")

        assert cookie_session_id == session.session_id
        assert len(secret) >= 43  # 32 random bytes, URL-safe base64
        assert (
            session.dna_refresh_token_hash
            == hashlib.sha256(secret.encode()).hexdigest()
        )
        # The raw secret must not be recoverable from what is stored.
        assert secret not in repr(provider._sessions._sessions.docs)

    def test_shotgrid_tokens_from_login_are_not_stored(self):
        """The password grant returns renewable ShotGrid tokens; DNA discards them."""
        provider, _, session = _logged_in()
        stored = repr(provider._sessions._sessions.docs)

        assert "sg-access-token" not in stored
        assert "sg-refresh-token" not in stored
        assert "s3cret-password-value" not in stored

    def test_session_stores_the_shotgrid_login_not_the_typed_email(self):
        """sudo_as_login matches HumanUser.login, which may differ from email."""
        _, _, session = _logged_in(login_name="jane.artist")
        assert session.sg_username == "jane.artist"

    def test_falls_back_to_submitted_username_when_login_is_blank(self):
        _, _, session = _logged_in(login_name="")
        assert session.sg_username == "jane@studio.com"

    def test_rejected_credentials_leave_no_session(self):
        provider = _make_provider()
        provider._sg_auth_override.login_user.side_effect = ValueError(
            "ShotGrid authentication failed (HTTP 401)."
        )

        with pytest.raises(ValueError, match="authentication failed"):
            provider.login(username="jane@studio.com", password="wrong")

        assert provider._sessions._sessions.docs == {}


class TestAccessTokenValidation:
    """Every request must confirm the session behind the token still exists."""

    def test_valid_token_for_active_session_is_accepted(self):
        provider, result, _ = _logged_in()
        assert (
            provider.validate_token(result.body["access_token"])["email"]
            == "jane@studio.com"
        )

    def test_token_stops_working_the_moment_its_session_is_deleted(self):
        """Previously a deleted session's token kept working until it expired."""
        provider, result, session = _logged_in()
        provider._sessions.delete_session(session.session_id)

        with pytest.raises(ValueError, match="session has ended"):
            provider.validate_token(result.body["access_token"])

    def test_blocklisted_token_is_rejected(self):
        provider, result, session = _logged_in()
        provider._sessions.revoke_token(session.jti, 3600)

        with pytest.raises(ValueError, match="revoked"):
            provider.validate_token(result.body["access_token"])

    def test_token_without_session_claim_is_rejected(self):
        import jwt as pyjwt

        provider = _make_provider()
        token = pyjwt.encode(
            {
                "jti": "j",
                "email": "a@b.c",
                "iat": int(time.time()),
                "exp": int(time.time()) + 60,
                "iss": "dna-backend",
                "aud": "dna-api",
            },
            provider._secret,
            algorithm="HS256",
        )
        with pytest.raises(ValueError, match="session_id"):
            provider.validate_token(token)

    def test_decode_pins_the_signing_algorithm(self):
        import jwt as pyjwt

        provider = _make_provider()
        forged = pyjwt.encode(
            {
                "jti": "x",
                "session_id": "y",
                "email": "a@b.c",
                "iat": int(time.time()),
                "exp": int(time.time()) + 60,
                "iss": "dna-backend",
                "aud": "dna-api",
            },
            provider._secret,
            algorithm="HS512",
        )
        with pytest.raises(ValueError):
            provider.validate_token(forged)

    def test_session_past_maximum_lifetime_is_ended_on_next_request(self):
        provider, result, session = _logged_in(_make_provider(max_session_seconds=60))
        session.created_at = time.time() - 61
        provider._sessions.update_session(session)

        with pytest.raises(ValueError, match="maximum length"):
            provider.validate_token(result.body["access_token"])
        assert provider._sessions.get_session(session.session_id) is None

    def test_session_past_idle_timeout_is_rejected_before_mongo_reaps_it(self):
        """MongoDB's TTL monitor runs only about once a minute."""
        provider, result, session = _logged_in()
        doc = provider._sessions._sessions.docs[session.session_id]
        doc["expires_at"] = provider._sessions._expires_at(
            -1
        )  # expired, not yet deleted

        with pytest.raises(ValueError, match="session has ended"):
            provider.validate_token(result.body["access_token"])

    @pytest.mark.parametrize(
        "claims_override, reason",
        [
            ({"aud": "some-other-service"}, "audience"),
            ({"iss": "some-other-issuer"}, "issuer"),
        ],
    )
    def test_token_for_another_service_is_rejected(self, claims_override, reason):
        """A token signed with a shared secret by another system must not work here."""
        import jwt as pyjwt

        provider, result, _ = _logged_in()
        claims = {
            **provider._decode_jwt(result.body["access_token"]),
            **claims_override,
        }
        foreign = pyjwt.encode(claims, provider._secret, algorithm="HS256")

        with pytest.raises(ValueError, match="Invalid authentication token"):
            provider.validate_token(foreign)

    def test_token_without_audience_or_issuer_is_rejected(self):
        import jwt as pyjwt

        provider, result, _ = _logged_in()
        claims = provider._decode_jwt(result.body["access_token"])
        del claims["aud"], claims["iss"]
        bare = pyjwt.encode(claims, provider._secret, algorithm="HS256")

        with pytest.raises(ValueError, match="Invalid authentication token"):
            provider.validate_token(bare)

    def test_get_session_for_request_returns_the_active_session(self):
        provider, result, _ = _logged_in()
        assert (
            provider.get_session_for_request(result.body["access_token"]).sg_username
            == "jane.artist"
        )


class TestRefreshTokenRotation:
    """Single-use refresh tokens, rotated every time, with theft detection."""

    def test_refresh_issues_new_access_token_and_rotates_cookie(self):
        provider, login, _ = _logged_in()

        refreshed = provider.refresh_session(login.refresh_cookie)

        assert (
            refreshed.refresh_cookie
            and refreshed.refresh_cookie != login.refresh_cookie
        )
        assert provider.validate_token(refreshed.body["access_token"])

    def test_refresh_confirms_the_shotgrid_account_and_keeps_identity(self):
        provider, login, session = _logged_in()

        provider.refresh_session(login.refresh_cookie)

        provider._sg_auth_override.confirm_user_active.assert_called_once_with(
            42, "jane.artist"
        )
        updated = provider._sessions.get_session(session.session_id)
        assert updated.sg_username == "jane.artist"

    def test_previous_access_token_still_works_until_it_expires(self):
        """Other tabs keep their token; short expiry bounds it, not rotation."""
        provider, login, _ = _logged_in()
        provider.refresh_session(login.refresh_cookie)

        assert provider.validate_token(login.body["access_token"])

    def test_concurrent_refresh_within_grace_window_is_not_theft(self):
        """Two tabs share one cookie jar and can race the same secret."""
        provider, login, session = _logged_in()
        provider.refresh_session(login.refresh_cookie)

        again = provider.refresh_session(login.refresh_cookie)

        assert provider.validate_token(again.body["access_token"])
        assert again.refresh_cookie is None  # browser already holds the rotated cookie
        assert provider._sessions.get_session(session.session_id) is not None

    def test_concurrent_refreshes_of_one_cookie_never_log_the_user_out(self):
        """Two tabs refreshing at once (e.g. after a laptop wakes).

        Previously both passed the check, both rotated, and the browser could be
        left holding the cookie the server had discarded — a logout on the next
        refresh. The swap is now atomic: exactly one request rotates.
        """
        for _ in range(25):
            provider, login, session = _logged_in()
            store = provider._sessions
            real_get = store.get_session

            def slow_get(session_id, _get=real_get):
                found = _get(session_id)
                time.sleep(0.005)  # MongoDB round trip: both requests read first
                return found

            store.get_session = slow_get
            results = []
            threads = [
                threading.Thread(
                    target=lambda: results.append(
                        provider.refresh_session(login.refresh_cookie)
                    )
                )
                for _ in range(2)
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            store.get_session = real_get

            assert len(results) == 2, "a concurrent refresh raised"
            issued = [r.refresh_cookie for r in results if r.refresh_cookie]
            assert len(issued) == 1, "exactly one request may rotate the secret"
            # Only the winner checks the account with ShotGrid.
            assert provider._sg_auth_override.confirm_user_active.call_count == 1
            # Whatever the browser keeps is accepted next time.
            assert provider.refresh_session(issued[0]).refresh_cookie
            for r in results:
                assert provider.validate_token(r.body["access_token"])

    def test_reusing_a_rotated_token_after_grace_revokes_the_session(self):
        provider, login, session = _logged_in()
        provider.refresh_session(login.refresh_cookie)
        rotated = provider._sessions.get_session(session.session_id)
        rotated.dna_refresh_rotated_at = time.time() - 31
        provider._sessions.update_session(rotated)

        with pytest.raises(ValueError, match="another location"):
            provider.refresh_session(login.refresh_cookie)
        assert provider._sessions.get_session(session.session_id) is None

    def test_reuse_revocation_also_kills_the_attackers_fresh_tokens(self):
        """If the thief refreshed first, the victim's replay must lock them out too."""
        provider, login, session = _logged_in()
        thief = provider.refresh_session(login.refresh_cookie)
        rotated = provider._sessions.get_session(session.session_id)
        rotated.dna_refresh_rotated_at = time.time() - 31
        provider._sessions.update_session(rotated)

        with pytest.raises(ValueError):
            provider.refresh_session(login.refresh_cookie)

        with pytest.raises(ValueError, match="session has ended"):
            provider.validate_token(thief.body["access_token"])
        with pytest.raises(ValueError):
            provider.refresh_session(thief.refresh_cookie)

    def test_forged_secret_is_rejected_without_revoking_the_session(self):
        """Session ids are readable in every access token.

        If an arbitrary secret revoked the session, anyone who had seen one
        token — or one log line — could log that user out at will.
        """
        provider, login, session = _logged_in()

        with pytest.raises(ValueError, match="Invalid refresh token"):
            provider.refresh_session(f"{session.session_id}.not-the-real-secret")

        assert provider._sessions.get_session(session.session_id) is not None
        # The genuine holder is completely unaffected.
        assert provider.refresh_session(login.refresh_cookie).refresh_cookie

    def test_security_logs_do_not_contain_session_ids_or_emails(self, caplog):
        provider, login, session = _logged_in()
        provider.refresh_session(login.refresh_cookie)
        rotated = provider._sessions._sessions.docs[session.session_id]
        rotated["dna_refresh_rotated_at"] = time.time() - 31

        with caplog.at_level("WARNING"), pytest.raises(ValueError):
            provider.refresh_session(login.refresh_cookie)

        assert "replay detected" in caplog.text
        assert session.session_id not in caplog.text
        assert session.email not in caplog.text

    @pytest.mark.parametrize(
        "cookie", ["", "no-separator", ".secret-only", "session-only."]
    )
    def test_malformed_cookie_is_rejected(self, cookie):
        with pytest.raises(ValueError, match="Invalid refresh token"):
            _make_provider().refresh_session(cookie)

    def test_refresh_for_unknown_session_is_rejected(self):
        with pytest.raises(ValueError, match="session has ended"):
            _make_provider().refresh_session("no-such-session.secret")

    def test_refresh_past_maximum_lifetime_requires_password_again(self):
        provider, login, session = _logged_in(_make_provider(max_session_seconds=60))
        session.created_at = time.time() - 61
        provider._sessions.update_session(session)

        with pytest.raises(ValueError, match="maximum length"):
            provider.refresh_session(login.refresh_cookie)
        assert provider._sessions.get_session(session.session_id) is None

    @pytest.mark.parametrize(
        "refusal",
        [
            "The ShotGrid account has been deactivated.",
            "The ShotGrid account no longer exists.",
            "The ShotGrid login for this account changed.",
        ],
    )
    def test_inactive_shotgrid_account_revokes_the_session(self, refusal):
        """A deactivated ShotGrid account must lose DNA access, not just this refresh."""
        from dna.auth.shotgrid_auth_client import ShotGridAuthRejected

        provider, login, session = _logged_in()
        provider._sg_auth_override.confirm_user_active.side_effect = (
            ShotGridAuthRejected(refusal)
        )

        with pytest.raises(ValueError, match=refusal):
            provider.refresh_session(login.refresh_cookie)

        assert provider._sessions.get_session(session.session_id) is None
        with pytest.raises(ValueError, match="session has ended"):
            provider.validate_token(login.body["access_token"])

    @pytest.mark.parametrize(
        "outage",
        [
            "Could not confirm ShotGrid account status: timed out",
            "Could not confirm ShotGrid account status: connection reset",
            "Cannot confirm ShotGrid account status: SHOTGRID_API_KEY is required",
        ],
    )
    def test_shotgrid_outage_keeps_the_user_signed_in(self, outage):
        """Previously any ShotGrid failure deleted the session — an outage was a mass logout."""
        from dna.auth.shotgrid_auth_client import ShotGridUnavailable

        provider, login, session = _logged_in()
        provider._sg_auth_override.confirm_user_active.side_effect = (
            ShotGridUnavailable(outage)
        )

        refreshed = provider.refresh_session(login.refresh_cookie)

        assert refreshed.refresh_cookie  # rotation completed; the browser gets a cookie
        assert provider.validate_token(refreshed.body["access_token"])
        assert provider._sessions.get_session(session.session_id) is not None

    @pytest.mark.parametrize("missing", ["sg_user_id", "sg_username"])
    def test_session_without_shotgrid_identity_cannot_be_renewed(self, missing):
        provider, login, session = _logged_in()
        if missing == "sg_user_id":
            session.shotgrid.user_id = 0
        else:
            session.shotgrid.username = ""
        provider._sessions.update_session(session)

        with pytest.raises(ValueError, match="cannot be renewed"):
            provider.refresh_session(login.refresh_cookie)
        assert provider._sessions.get_session(session.session_id) is None


class TestLogout:
    """Logout must end the session server-side, and never pretend otherwise."""

    def test_logout_with_access_token_ends_session(self):
        provider, login, session = _logged_in()

        provider.logout(login.body["access_token"], None)

        assert provider._sessions.get_session(session.session_id) is None
        with pytest.raises(ValueError):
            provider.validate_token(login.body["access_token"])
        with pytest.raises(ValueError):
            provider.refresh_session(login.refresh_cookie)

    def test_logout_with_only_the_cookie_ends_session(self):
        """An idle user whose access token expired must still be able to log out."""
        provider, login, session = _logged_in()

        provider.logout(None, login.refresh_cookie)

        assert provider._sessions.get_session(session.session_id) is None

    def test_logout_accepts_an_expired_access_token(self):
        provider, login, session = _logged_in(_make_provider(access_seconds=-1))

        provider.logout(login.body["access_token"], None)

        assert provider._sessions.get_session(session.session_id) is None

    def test_cookie_with_wrong_secret_cannot_log_anyone_out(self):
        provider, _, session = _logged_in()

        provider.logout(None, f"{session.session_id}.guessed-secret")

        assert provider._sessions.get_session(session.session_id) is not None

    def test_storage_failure_propagates_instead_of_claiming_success(self):
        provider, login, _ = _logged_in()

        with mock.patch.object(
            provider._sessions, "delete_session", side_effect=RuntimeError("mongo down")
        ):
            with pytest.raises(RuntimeError):
                provider.logout(login.body["access_token"], login.refresh_cookie)

    def test_logout_only_ends_the_current_device(self):
        provider = _wire_shotgrid(_make_provider())
        laptop = provider.login(username="jane@studio.com", password="pw-value-one")
        phone = provider.login(username="jane@studio.com", password="pw-value-one")

        provider.logout(laptop.body["access_token"], laptop.refresh_cookie)

        assert provider.validate_token(phone.body["access_token"])

    def test_logout_all_ends_every_device_for_that_user_only(self):
        provider = _wire_shotgrid(_make_provider())
        laptop = provider.login(username="jane@studio.com", password="pw-value-one")
        phone = provider.login(username="jane@studio.com", password="pw-value-one")
        other = _make_session(email="bob@studio.com")
        provider._sessions.create_session(other)

        ended = provider.logout_all(laptop.body["access_token"])

        assert ended == 2
        for device in (laptop, phone):
            with pytest.raises(ValueError):
                provider.validate_token(device.body["access_token"])
            with pytest.raises(ValueError):
                provider.refresh_session(device.refresh_cookie)
        assert provider._sessions.get_session(other.session_id) is not None

    def test_logout_all_requires_an_active_session(self):
        provider, login, session = _logged_in()
        provider._sessions.delete_session(session.session_id)

        with pytest.raises(ValueError, match="session has ended"):
            provider.logout_all(login.body["access_token"])


# ═══════════════════════════════════════════════════════════════════════════ #
# sudo_as_login routing                                                       #
# ═══════════════════════════════════════════════════════════════════════════ #

_SG_ENV = {
    "PRODTRACK_PROVIDER": "shotgrid",
    "SHOTGRID_URL": "https://test.shotgunstudio.com",
    "SHOTGRID_SCRIPT_NAME": "test_script",
    "SHOTGRID_API_KEY": "test_key",
}


class TestSudoAsLoginRouting:
    """Every authenticated query must run as the user, via the script account."""

    @mock.patch("dna.prodtrack_providers.shotgrid.Shotgun")
    def test_sudo_login_is_passed_to_shotgrid(self, mock_shotgun):
        from dna.prodtrack_providers.prodtrack_provider_base import (
            get_prodtrack_provider,
        )

        with mock.patch.dict(os.environ, _SG_ENV, clear=True):
            get_prodtrack_provider(sudo_login="jane.artist", session_id="sess-1")

        mock_shotgun.assert_called_once_with(
            "https://test.shotgunstudio.com",
            "test_script",
            "test_key",
            sudo_as_login="jane.artist",
        )

    @mock.patch("dna.prodtrack_providers.shotgrid.Shotgun")
    def test_no_sudo_login_yields_bare_script_account(self, mock_shotgun):
        """The script path still exists — for background jobs, not requests."""
        from dna.prodtrack_providers.prodtrack_provider_base import (
            get_prodtrack_provider,
        )

        with mock.patch.dict(os.environ, _SG_ENV, clear=True):
            get_prodtrack_provider()

        assert mock_shotgun.call_args.kwargs["sudo_as_login"] is None

    def test_provider_no_longer_accepts_a_password(self):
        """The credential path the reviewer objected to must be gone."""
        import inspect

        from dna.prodtrack_providers.shotgrid import ShotgridProvider

        params = inspect.signature(ShotgridProvider.__init__).parameters
        assert "password" not in params
        assert "login" not in params
        assert "user_token" not in params

    @mock.patch("dna.prodtrack_providers.shotgrid.Shotgun")
    def test_sudo_context_uses_script_credentials(self, mock_shotgun):
        """sudo() must impersonate through the script account, not a token."""
        from dna.prodtrack_providers.shotgrid import ShotgridProvider

        with mock.patch.dict(os.environ, _SG_ENV, clear=True):
            provider = ShotgridProvider()
            mock_shotgun.reset_mock()
            with provider.sudo("other.artist"):
                assert provider._sg is provider._sudo_connection

        mock_shotgun.assert_called_once_with(
            "https://test.shotgunstudio.com",
            "test_script",
            "test_key",
            sudo_as_login="other.artist",
        )
        # Restored afterwards, so the next request is not silently impersonating.
        assert provider._sudo_connection is None


# ═══════════════════════════════════════════════════════════════════════════ #
# Fail-closed behaviour — regression guard for the privilege-escalation bug   #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestFailsClosed:
    """A session that cannot name a ShotGrid user must be rejected.

    The bug this guards against: when the session carried no usable ShotGrid
    login, the request fell through to the bare script account and answered
    with full site permissions instead of failing. Issue #55 is explicit —
    "Never use service account for user-facing queries".
    """

    @staticmethod
    def _shotgrid_provider():
        from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider

        return mock.MagicMock(spec=ShotGridSSOProvider)

    @staticmethod
    def _credentials():
        from fastapi.security import HTTPAuthorizationCredentials

        return HTTPAuthorizationCredentials(scheme="Bearer", credentials="jwt-token")

    def test_missing_username_raises_401(self):
        from fastapi import HTTPException
        from main import AuthContext, get_user_scoped_prodtrack_provider

        context = AuthContext(
            email="jane@studio.com", session=_make_session(sg_username="")
        )

        with mock.patch("main.get_prodtrack_provider") as spy:
            with pytest.raises(HTTPException) as excinfo:
                get_user_scoped_prodtrack_provider(
                    context, auth_provider=self._shotgrid_provider()
                )

        assert excinfo.value.status_code == 401
        # The critical assertion: no provider was built at all, so there was no
        # opportunity to answer the query with script-account permissions.
        spy.assert_not_called()

    def test_missing_session_raises_401(self):
        """A ShotGrid login with no session at all is equally unusable."""
        from fastapi import HTTPException
        from main import AuthContext, get_user_scoped_prodtrack_provider

        with mock.patch("main.get_prodtrack_provider") as spy:
            with pytest.raises(HTTPException) as excinfo:
                get_user_scoped_prodtrack_provider(
                    AuthContext(email="jane@studio.com", session=None),
                    auth_provider=self._shotgrid_provider(),
                )

        assert excinfo.value.status_code == 401
        spy.assert_not_called()

    def test_missing_shotgrid_credentials_block_raises_401(self):
        from fastapi import HTTPException
        from main import AuthContext, get_user_scoped_prodtrack_provider

        session = _make_session()
        session.shotgrid = None

        with pytest.raises(HTTPException) as excinfo:
            get_user_scoped_prodtrack_provider(
                AuthContext(email="jane@studio.com", session=session),
                auth_provider=self._shotgrid_provider(),
            )

        assert excinfo.value.status_code == 401

    @mock.patch("dna.prodtrack_providers.shotgrid.Shotgun")
    def test_valid_session_is_scoped_to_that_user(self, mock_shotgun):
        from main import AuthContext, get_user_scoped_prodtrack_provider

        context = AuthContext(
            email="jane@studio.com", session=_make_session(sg_username="jane.artist")
        )

        with mock.patch.dict(os.environ, _SG_ENV, clear=True):
            get_user_scoped_prodtrack_provider(
                context, auth_provider=self._shotgrid_provider()
            )

        assert mock_shotgun.call_args.kwargs["sudo_as_login"] == "jane.artist"

    def test_ended_session_raises_401_during_authentication(self):
        from fastapi import HTTPException
        from main import get_auth_context

        provider = self._shotgrid_provider()
        provider.authenticate.side_effect = ValueError(
            "Your session has ended. Please log in again."
        )

        with mock.patch.dict(os.environ, {"AUTH_PROVIDER": "shotgrid"}, clear=False):
            with pytest.raises(HTTPException) as excinfo:
                get_auth_context(
                    credentials=self._credentials(), auth_provider=provider
                )

        assert excinfo.value.status_code == 401

    def test_auth_dependencies_run_in_the_threadpool(self):
        """Blocking MongoDB lookups must not run on the event loop."""
        import inspect

        from main import (
            get_auth_context,
            get_current_user,
            get_user_scoped_prodtrack_provider,
        )

        for dependency in (
            get_auth_context,
            get_current_user,
            get_user_scoped_prodtrack_provider,
        ):
            assert not inspect.iscoroutinefunction(dependency), dependency.__name__

    def test_auth_endpoints_that_call_shotgrid_or_mongo_run_in_the_threadpool(self):
        """A slow ShotGrid login or refresh must not stall every other request."""
        import inspect

        from main import auth_login, auth_logout, auth_logout_all, auth_refresh

        for endpoint in (auth_login, auth_refresh, auth_logout, auth_logout_all):
            assert not inspect.iscoroutinefunction(endpoint), endpoint.__name__


# ═══════════════════════════════════════════════════════════════════════════ #
# ShotGrid Fault → HTTP status translation                                    #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestFaultClassification:
    """ShotGrid reports denial, revocation and outage as one exception type."""

    def test_permission_message_becomes_permission_error(self):
        from dna.prodtrack_providers.prodtrack_provider_base import (
            ProdtrackPermissionError,
        )
        from dna.prodtrack_providers.shotgrid import SGFault, classify_sg_fault

        fault = SGFault("API read() CRUD ERROR: Permission denied for entity Project")
        assert isinstance(classify_sg_fault(fault), ProdtrackPermissionError)

    def test_unrelated_message_becomes_unavailable_error(self):
        from dna.prodtrack_providers.prodtrack_provider_base import (
            ProdtrackUnavailableError,
        )
        from dna.prodtrack_providers.shotgrid import SGFault, classify_sg_fault

        fault = SGFault("Shotgun is currently down for maintenance")
        assert isinstance(classify_sg_fault(fault), ProdtrackUnavailableError)

    def test_authentication_fault_becomes_auth_error(self):
        from dna.prodtrack_providers import shotgrid as sg_module
        from dna.prodtrack_providers.prodtrack_provider_base import ProdtrackAuthError

        if sg_module.AuthenticationFault is None:  # pragma: no cover
            pytest.skip("shotgun_api3 build has no AuthenticationFault")

        fault = sg_module.AuthenticationFault("Cannot authenticate user")
        assert isinstance(sg_module.classify_sg_fault(fault), ProdtrackAuthError)


# ═══════════════════════════════════════════════════════════════════════════ #
# Endpoint-level permission enforcement                                       #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestCrossUserAccess:
    """Acceptance criterion: a user cannot read another user's projects."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from main import app

        return TestClient(app)

    @pytest.fixture
    def as_user_a(self):
        """Authenticate every request as user A, with a stubbed provider."""
        from main import app, get_current_user, get_user_scoped_prodtrack_provider

        provider = mock.MagicMock()
        provider.get_projects_for_user.return_value = []

        app.dependency_overrides[get_current_user] = lambda: "user.a@studio.com"
        app.dependency_overrides[get_user_scoped_prodtrack_provider] = lambda: provider
        with mock.patch.dict(os.environ, {"AUTH_PROVIDER": "shotgrid"}, clear=False):
            yield provider
        app.dependency_overrides.clear()

    def test_user_cannot_read_another_users_projects(self, client, as_user_a):
        response = client.get("/projects/user/user.b@studio.com")

        assert response.status_code == 403
        # The request must be refused before the tracker is ever queried.
        as_user_a.get_projects_for_user.assert_not_called()

    def test_user_can_read_their_own_projects(self, client, as_user_a):
        response = client.get("/projects/user/user.a@studio.com")

        assert response.status_code == 200
        as_user_a.get_projects_for_user.assert_called_once_with("user.a@studio.com")

    def test_email_comparison_is_case_insensitive(self, client, as_user_a):
        """ShotGrid stores emails inconsistently; casing must not deny access."""
        response = client.get("/projects/user/User.A@Studio.com")

        assert response.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════ #
# Provider selection                                                          #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestAuthProviderFactory:
    """ShotGrid login is added alongside the existing providers, not instead.

    The project's GCP deployment runs with AUTH_PROVIDER=google; if that value
    stopped resolving, the backend would refuse to start on the next deploy.
    """

    def _resolve(self, value, **extra_env):
        from dna.auth_providers.auth_provider_base import get_auth_provider

        env = {"AUTH_PROVIDER": value, **extra_env}
        with mock.patch.dict(os.environ, env, clear=False):
            return get_auth_provider()

    def test_none_resolves_to_noop(self):
        from dna.auth_providers.noop_auth_provider import NoopAuthProvider

        assert isinstance(self._resolve("none"), NoopAuthProvider)

    def test_google_still_resolves_to_google(self):
        from dna.auth_providers.google_auth_provider import GoogleAuthProvider

        # The deploy supplies GOOGLE_CLIENT_ID from Secret Manager.
        provider = self._resolve("google", GOOGLE_CLIENT_ID="test-client-id")
        assert isinstance(provider, GoogleAuthProvider)

    def test_shotgrid_resolves_to_shotgrid(self):
        from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider

        with mock.patch(
            "dna.auth_providers.shotgrid_sso._lazy_session_store",
            return_value=_make_store(),
        ):
            provider = self._resolve("shotgrid", JWT_SECRET_KEY="k" * 32)
        assert isinstance(provider, ShotGridSSOProvider)

    def test_unknown_value_lists_every_valid_option(self):
        with pytest.raises(ValueError, match="none, google, shotgrid"):
            self._resolve("okta")


# ═══════════════════════════════════════════════════════════════════════════ #
# HTTP endpoints — cookies, CSRF and fail-closed behaviour                    #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestAuthEndpoints:
    """What only the HTTP layer can prove: cookie attributes, CSRF, status codes."""

    CSRF = {"X-DNA-CSRF": "1"}
    SETTINGS = "/users/jane@studio.com/settings"

    @pytest.fixture
    def env(self):
        from main import app, get_auth_provider_cached, get_storage_provider_cached

        provider = _wire_shotgrid(_make_provider())
        storage = mock.AsyncMock()
        storage.get_user_settings.return_value = None
        app.dependency_overrides[get_auth_provider_cached] = lambda: provider
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage
        with mock.patch.dict(
            os.environ,
            {"AUTH_PROVIDER": "shotgrid", "REFRESH_COOKIE_SECURE": "false"},
            clear=False,
        ):
            yield provider
        app.dependency_overrides.clear()

    @pytest.fixture
    def client(self, env):
        from fastapi.testclient import TestClient
        from main import app

        return TestClient(app)

    def _login(self, client):
        response = client.post(
            "/auth/login",
            json={"username": "jane@studio.com", "password": "s3cret-password-value"},
        )
        assert response.status_code == 200
        return response

    @staticmethod
    def _bearer(response):
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def test_login_sets_httponly_cookie_scoped_to_auth(self, client):
        set_cookie = self._login(client).headers["set-cookie"].lower()

        assert set_cookie.startswith("dna_refresh=")
        assert "httponly" in set_cookie
        assert "path=/auth" in set_cookie
        assert "samesite=strict" in set_cookie
        assert "max-age" not in set_cookie  # browser-session cookie

    def test_request_authenticates_exactly_once(self, client, env):
        """The current user and the ShotGrid provider share one session lookup."""
        login = self._login(client)

        with (
            mock.patch.object(env, "authenticate", wraps=env.authenticate) as spy,
            mock.patch("main.get_prodtrack_provider") as provider_factory,
        ):
            provider_factory.return_value.get_projects_for_user.return_value = []
            response = client.get(
                "/projects/user/jane@studio.com", headers=self._bearer(login)
            )

        assert response.status_code == 200
        assert spy.call_count == 1

    def test_login_returns_503_when_shotgrid_is_unavailable(self, client, env):
        """Nothing is known about the credentials, so it must not look like a wrong password."""
        from dna.auth.shotgrid_auth_client import ShotGridUnavailable

        env._sg_auth_override.login_user.side_effect = ShotGridUnavailable(
            "ShotGrid auth endpoint timed out after 15 seconds."
        )

        response = client.post(
            "/auth/login",
            json={"username": "jane@studio.com", "password": "s3cret-password-value"},
        )

        assert response.status_code == 503

    def test_login_outage_details_are_not_returned_to_the_caller(self, client, env):
        """Internal URLs and ShotGrid errors belong in the server log only."""
        from dna.auth.shotgrid_auth_client import ShotGridUnavailable

        env._sg_auth_override.login_user.side_effect = ShotGridUnavailable(
            "Cannot reach ShotGrid auth endpoint at https://internal.example/api"
        )

        response = client.post(
            "/auth/login",
            json={"username": "jane@studio.com", "password": "s3cret-password-value"},
        )

        assert response.status_code == 503
        assert "internal.example" not in response.text
        assert "unavailable" in response.json()["detail"]

    def test_login_body_contains_no_refresh_token(self, client):
        body = self._login(client).json()
        assert "refresh_token" not in body
        assert body["expires_in"] == 15 * 60

    def test_refresh_requires_csrf_header(self, client):
        self._login(client)
        assert client.post("/auth/refresh").status_code == 403

    def test_refresh_with_cookie_rotates_it(self, client):
        first = self._login(client).cookies["dna_refresh"]

        response = client.post("/auth/refresh", headers=self.CSRF)

        assert response.status_code == 200
        assert response.cookies["dna_refresh"] != first
        assert (
            client.get(self.SETTINGS, headers=self._bearer(response)).status_code == 200
        )

    def test_refresh_without_cookie_is_401(self, client):
        assert client.post("/auth/refresh", headers=self.CSRF).status_code == 401

    def test_stolen_access_token_cannot_refresh(self, client):
        """Previously the access token itself was the refresh credential."""
        login = self._login(client)
        client.cookies.clear()

        response = client.post(
            "/auth/refresh", headers={**self.CSRF, **self._bearer(login)}
        )

        assert response.status_code == 401

    def test_deleted_session_blocks_non_shotgrid_endpoints(self, client, env):
        """Settings, drafts and QC do not call ShotGrid — they were the gap."""
        login = self._login(client)
        session_id = env._decode_jwt(login.json()["access_token"])["session_id"]
        env._sessions.delete_session(session_id)

        assert client.get(self.SETTINGS, headers=self._bearer(login)).status_code == 401

    def test_logout_ends_session_and_clears_cookie(self, client):
        login = self._login(client)

        response = client.post(
            "/auth/logout", headers={**self.CSRF, **self._bearer(login)}
        )

        assert response.status_code == 200
        assert 'dna_refresh=""' in response.headers["set-cookie"]
        assert client.get(self.SETTINGS, headers=self._bearer(login)).status_code == 401

    def test_logout_by_cookie_alone_needs_csrf_header(self, client, env):
        login = self._login(client)
        session_id = env._decode_jwt(login.json()["access_token"])["session_id"]

        client.post("/auth/logout")  # no header: a forged cross-site post
        assert env._sessions.get_session(session_id) is not None

        client.cookies.set("dna_refresh", login.cookies["dna_refresh"], path="/auth")
        client.post("/auth/logout", headers=self.CSRF)
        assert env._sessions.get_session(session_id) is None

    def test_logout_fails_closed_when_revocation_fails(self, client, env):
        """Previously this returned 200 "Logged out" while the token kept working."""
        login = self._login(client)

        with mock.patch.object(
            env._sessions, "delete_session", side_effect=RuntimeError("mongo down")
        ):
            response = client.post(
                "/auth/logout", headers={**self.CSRF, **self._bearer(login)}
            )

        assert response.status_code == 503
        assert "may still be active" in response.json()["detail"]

    def test_logout_all_ends_other_devices(self, client, env):
        from fastapi.testclient import TestClient
        from main import app

        laptop = self._login(client)
        phone = self._login(TestClient(app))

        response = client.post("/auth/logout-all", headers=self._bearer(laptop))

        assert response.status_code == 200
        assert response.json()["sessions_ended"] == 2
        assert client.get(self.SETTINGS, headers=self._bearer(phone)).status_code == 401

    def test_logout_all_fails_closed(self, client, env):
        login = self._login(client)

        with mock.patch.object(
            env._sessions,
            "delete_sessions_for_email",
            side_effect=RuntimeError("mongo down"),
        ):
            response = client.post("/auth/logout-all", headers=self._bearer(login))

        assert response.status_code == 503

    def test_logout_all_requires_authentication(self, client):
        assert client.post("/auth/logout-all").status_code == 401


class TestRefreshCookieSettings:

    def _settings(self, **env):
        from dna.auth_providers.shotgrid_sso import refresh_cookie_settings

        with mock.patch.dict(os.environ, env, clear=False):
            for key in ("REFRESH_COOKIE_SAMESITE", "REFRESH_COOKIE_SECURE"):
                if key not in env:
                    os.environ.pop(key, None)
            return refresh_cookie_settings()

    def test_defaults_are_the_strictest_setting(self):
        assert self._settings() == {
            "httponly": True,
            "secure": True,
            "samesite": "strict",
            "path": "/auth",
        }

    def test_cross_site_deployments_can_opt_into_samesite_none(self):
        assert self._settings(REFRESH_COOKIE_SAMESITE="none")["samesite"] == "none"

    def test_samesite_none_without_secure_is_refused(self):
        with pytest.raises(ValueError, match="requires REFRESH_COOKIE_SECURE"):
            self._settings(
                REFRESH_COOKIE_SAMESITE="none", REFRESH_COOKIE_SECURE="false"
            )

    def test_unknown_samesite_value_is_refused(self):
        with pytest.raises(ValueError, match="strict, lax or none"):
            self._settings(REFRESH_COOKIE_SAMESITE="sometimes")
