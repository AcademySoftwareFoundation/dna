"""Production auth tests — session store, connection pool, ShotGrid SSO.

Run with:
    pytest tests/test_auth_prod.py -v

Requires:
    pip install fakeredis pytest pytest-asyncio
"""

from __future__ import annotations

import hashlib
import time
import uuid
from unittest.mock import MagicMock, patch

import pytest

try:
    import fakeredis
    HAS_FAKEREDIS = True
except ImportError:
    HAS_FAKEREDIS = False

# ─────────────────────────────────────────────────────────────────────────── #
# Helpers                                                                      #
# ─────────────────────────────────────────────────────────────────────────── #


def _make_session(**kwargs) -> "UserSession":
    from dna.auth.session_store import UserSession
    defaults = dict(
        session_id=str(uuid.uuid4()),
        jti=str(uuid.uuid4()),
        email="jane@studio.com",
        name="Jane Artist",
        sg_user_id=42,
        sg_token="opaque-sg-token",
        refresh_token="autodesk-refresh-token",
    )
    defaults.update(kwargs)
    return UserSession(**defaults)


def _make_store(ttl=3600) -> "SessionStore":
    """Return a SessionStore backed by fakeredis (in-memory)."""
    from dna.auth.session_store import SessionStore
    store = SessionStore.__new__(SessionStore)
    store.session_ttl = ttl
    store.state_ttl = 600
    store._client = fakeredis.FakeRedis(decode_responses=True)
    store._redis_url = "fake://"
    return store


# ═══════════════════════════════════════════════════════════════════════════ #
# SessionStore tests                                                          #
# ═══════════════════════════════════════════════════════════════════════════ #


@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
class TestSessionStore:

    def test_create_and_get_session(self):
        store = _make_store()
        session = _make_session()
        store.create_session(session)
        retrieved = store.get_session(session.session_id)
        assert retrieved is not None
        assert retrieved.email == "jane@studio.com"
        assert retrieved.sg_token == "opaque-sg-token"
        assert retrieved.sg_user_id == 42

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
        session.sg_token = "new-sg-token"
        session.refresh_token = "new-refresh-token"
        store.update_session(session)
        updated = store.get_session(session.session_id)
        assert updated.sg_token == "new-sg-token"
        assert updated.refresh_token == "new-refresh-token"

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

    def test_oauth_state_stored_and_consumed(self):
        from dna.auth.session_store import OAuthState
        store = _make_store()
        state = "random-state-abc"
        oauth_state = OAuthState(
            code_verifier="verifier-xyz",
            redirect_uri="http://localhost:3000/callback",
        )
        store.store_oauth_state(state, oauth_state)
        consumed = store.consume_oauth_state(state)
        assert consumed is not None
        assert consumed.code_verifier == "verifier-xyz"

    def test_oauth_state_one_time_use(self):
        from dna.auth.session_store import OAuthState
        store = _make_store()
        state = "one-time-state"
        store.store_oauth_state(state, OAuthState(code_verifier="v", redirect_uri="u"))
        store.consume_oauth_state(state)   # First consume — should work
        assert store.consume_oauth_state(state) is None   # Second — should be None

    def test_consume_missing_state_returns_none(self):
        store = _make_store()
        assert store.consume_oauth_state("nonexistent-state") is None

    def test_sg_token_never_exposed_in_get_session(self):
        """The sg_token is in the session dict — but it only goes to the server."""
        store = _make_store()
        session = _make_session(sg_token="super-secret-sg-token")
        store.create_session(session)
        retrieved = store.get_session(session.session_id)
        # The session IS accessible server-side (that's the point)
        assert retrieved.sg_token == "super-secret-sg-token"
        # But verify nothing in the serialised data leaks outside the class boundary
        # (the JWT the client sees doesn't contain sg_token — tested in SSO tests)
        raw = store._client.get(f"dna:session:{session.session_id}")
        import json
        data = json.loads(raw)
        assert "sg_token" in data  # server has it
        # (The client JWT is minted separately without sg_token — see SSO tests)


# ═══════════════════════════════════════════════════════════════════════════ #
# Connection pool tests                                                       #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestShotGridConnectionPool:

    def _make_pool(self, max_size=5, sg_url="https://test.shotgunstudio.com"):
        from dna.auth.connection_pool import ShotGridConnectionPool
        with patch.dict("os.environ", {"SHOTGRID_URL": sg_url}):
            pool = ShotGridConnectionPool(max_size=max_size)
        return pool

    @patch("dna.auth.connection_pool.Shotgun")
    def test_get_creates_connection(self, mock_sg):
        pool = self._make_pool()
        session_id = str(uuid.uuid4())
        conn = pool.get(session_id=session_id, sg_token="tok-1")
        mock_sg.assert_called_once_with("https://test.shotgunstudio.com", session_token="tok-1")
        assert pool.size == 1

    @patch("dna.auth.connection_pool.Shotgun")
    def test_get_same_session_reuses_connection(self, mock_sg):
        pool = self._make_pool()
        sid = str(uuid.uuid4())
        conn1 = pool.get(sid, "tok-1")
        conn2 = pool.get(sid, "tok-1")
        # Shotgun() called only once (cache hit on second get)
        assert mock_sg.call_count == 1
        assert conn1 is conn2
        assert pool.stats["hits"] == 1

    @patch("dna.auth.connection_pool.Shotgun")
    def test_stale_token_replaces_connection(self, mock_sg):
        pool = self._make_pool()
        sid = str(uuid.uuid4())
        pool.get(sid, "tok-old")
        pool.get(sid, "tok-new")   # Different token — stale
        assert mock_sg.call_count == 2  # Two connections created
        assert pool.size == 1           # Only one entry (replaced, not added)

    @patch("dna.auth.connection_pool.Shotgun")
    def test_lru_eviction_at_max_size(self, mock_sg):
        pool = self._make_pool(max_size=3)
        sids = [str(uuid.uuid4()) for _ in range(4)]
        for i, sid in enumerate(sids):
            pool.get(sid, f"tok-{i}")
        # Pool should only contain 3 entries (oldest evicted)
        assert pool.size == 3

    @patch("dna.auth.connection_pool.Shotgun")
    def test_release_removes_entry(self, mock_sg):
        pool = self._make_pool()
        sid = str(uuid.uuid4())
        pool.get(sid, "tok-1")
        assert pool.size == 1
        pool.release(sid)
        assert pool.size == 0

    @patch("dna.auth.connection_pool.Shotgun")
    def test_cleanup_idle_evicts_old_entries(self, mock_sg):
        from dna.auth.connection_pool import _PoolEntry

        pool = self._make_pool()
        sid = str(uuid.uuid4())
        pool.get(sid, "tok-1")
        # Manually set last_used to 2 hours ago
        pool._pool[sid].last_used = time.monotonic() - 7200
        evicted = pool.cleanup_idle()
        assert evicted == 1
        assert pool.size == 0

    @patch("dna.auth.connection_pool.Shotgun")
    def test_stats_hit_rate(self, mock_sg):
        pool = self._make_pool()
        sid = str(uuid.uuid4())
        pool.get(sid, "tok")   # miss
        pool.get(sid, "tok")   # hit
        pool.get(sid, "tok")   # hit
        stats = pool.stats
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == pytest.approx(2 / 3, rel=0.01)

    def test_missing_sg_url_raises(self):
        from dna.auth.connection_pool import ShotGridConnectionPool
        import os
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("SHOTGRID_URL", None)
            with pytest.raises(ValueError, match="SHOTGRID_URL"):
                ShotGridConnectionPool()


# ═══════════════════════════════════════════════════════════════════════════ #
# SGToken helpers tests                                                          #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestSGTokenSet:
    """Tests for SGTokenSet token lifecycle helpers."""

    def test_should_refresh_when_near_expiry(self):
        from dna.auth.shotgrid_auth_client import SGTokenSet, ShotGridAuthClient
        import time

        token = SGTokenSet(
            access_token="tok",
            refresh_token="ref",
            token_type="Bearer",
            expires_in=600,
            obtained_at=time.time() - 500,  # obtained 500s ago, expires in 100s
        )
        # TTL buffer is 120s — 100s remaining < 120s buffer → should refresh
        assert ShotGridAuthClient.should_refresh(token) is True

    def test_should_not_refresh_when_fresh(self):
        from dna.auth.shotgrid_auth_client import SGTokenSet, ShotGridAuthClient
        import time

        token = SGTokenSet(
            access_token="tok",
            refresh_token="ref",
            token_type="Bearer",
            expires_in=3600,
            obtained_at=time.time() - 10,  # obtained 10s ago, 3590s remaining
        )
        assert ShotGridAuthClient.should_refresh(token) is False

    def test_is_expired_when_past_lifetime(self):
        from dna.auth.shotgrid_auth_client import SGTokenSet, ShotGridAuthClient
        import time

        token = SGTokenSet(
            access_token="tok",
            refresh_token="ref",
            token_type="Bearer",
            expires_in=600,
            obtained_at=time.time() - 700,  # 700s ago, expired 100s ago
        )
        assert ShotGridAuthClient.is_expired(token) is True

    def test_is_not_expired_when_within_lifetime(self):
        from dna.auth.shotgrid_auth_client import SGTokenSet, ShotGridAuthClient
        import time

        token = SGTokenSet(
            access_token="tok",
            refresh_token="ref",
            token_type="Bearer",
            expires_in=3600,
            obtained_at=time.time() - 100,
        )
        assert ShotGridAuthClient.is_expired(token) is False


# ═══════════════════════════════════════════════════════════════════════════ #
# ShotGridSSOProvider tests                                                   #
# ═══════════════════════════════════════════════════════════════════════════ #


@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
class TestShotGridSSOProvider:

    def _make_provider(self, secret="test-secret-key-32-chars-minimum!!"):
        import os
        from unittest.mock import MagicMock
        with patch.dict(os.environ, {
            "JWT_SECRET_KEY": secret,
            "JWT_ALGORITHM": "HS256",
            "JWT_EXPIRE_MINUTES": "60",
            "SHOTGRID_URL": "https://test.shotgunstudio.com",
        }):
            from dna.auth_providers.shotgrid_sso import ShotGridSSOProvider
            provider = ShotGridSSOProvider.__new__(ShotGridSSOProvider)
            provider._secret = secret
            provider._algorithm = "HS256"
            provider._expire_seconds = 3600
            provider._sessions = _make_store()
            provider._sg_auth = MagicMock()
            return provider

    def test_jwt_does_not_contain_sg_token(self):
        """Critical: the SG token must NEVER appear in the client JWT."""
        import jwt as pyjwt

        provider = self._make_provider()

        # Simulate handle_callback internals
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        session = _make_session(
            session_id=session_id, jti=jti, sg_token="SECRET-SG-TOKEN"
        )
        provider._sessions.create_session(session)

        token = provider._mint_jwt(
            jti=jti, session_id=session_id,
            email="jane@studio.com", name="Jane", sg_user_id=42
        )
        claims = pyjwt.decode(
            token, provider._secret, algorithms=["HS256"]
        )

        # Must have session_id (server lookup key)
        assert "session_id" in claims
        # Must NOT have sg_token
        assert "sg_token" not in claims
        # Must NOT have refresh_token
        assert "refresh_token" not in claims

    def test_validate_token_checks_blocklist(self):
        provider = self._make_provider()
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        session = _make_session(session_id=session_id, jti=jti)
        provider._sessions.create_session(session)
        token = provider._mint_jwt(
            jti=jti, session_id=session_id,
            email="jane@studio.com", name="Jane", sg_user_id=42
        )
        # Token should be valid before revocation
        claims = provider.validate_token(token)
        assert claims["email"] == "jane@studio.com"

        # Revoke it
        provider._sessions.revoke_token(jti, 3600)
        with pytest.raises(ValueError, match="revoked"):
            provider.validate_token(token)

    def test_revoke_token_deletes_session(self):
        provider = self._make_provider()
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        session = _make_session(session_id=session_id, jti=jti)
        provider._sessions.create_session(session)
        token = provider._mint_jwt(
            jti=jti, session_id=session_id,
            email="jane@studio.com", name="Jane", sg_user_id=42
        )
        provider.revoke_token(token)
        assert provider._sessions.get_session(session_id) is None
        assert provider._sessions.is_token_revoked(jti)

    def test_refresh_within_grace_period(self):
        import jwt as pyjwt
        from dna.auth.shotgrid_auth_client import SGTokenSet

        provider = self._make_provider()
        session_id = str(uuid.uuid4())
        old_jti = str(uuid.uuid4())
        session = _make_session(
            session_id=session_id, jti=old_jti,
            refresh_token="autodesk-refresh-tok"
        )
        provider._sessions.create_session(session)

        # Mint a token that expired 30s ago (within 60s grace)
        payload = {
            "jti": old_jti,
            "sub": "42",
            "session_id": session_id,
            "email": "jane@studio.com",
            "iat": int(time.time()) - 3630,
            "exp": int(time.time()) - 30,  # 30s ago — within grace
        }
        expired_token = pyjwt.encode(payload, provider._secret, algorithm="HS256")

        # Mock Autodesk refresh
        
        provider._sg_auth.refresh_tokens.return_value = SGTokenSet(
                access_token="new-sg-tok",
                refresh_token="new-refresh-tok",
                token_type="Bearer",
                expires_in=3600,
            )

        result = provider.refresh_access_token(expired_token)
        assert "access_token" in result
        assert result["token_type"] == "Bearer"

        # Old jti should now be revoked
        assert provider._sessions.is_token_revoked(old_jti)

        # Session should have new tokens
        updated = provider._sessions.get_session(session_id)
        assert updated.sg_token == "new-sg-tok"
        assert updated.refresh_token == "new-refresh-tok"

    def test_refresh_beyond_grace_period_raises(self):
        import jwt as pyjwt

        provider = self._make_provider()
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        payload = {
            "jti": jti,
            "session_id": session_id,
            "email": "jane@studio.com",
            "exp": int(time.time()) - 200,  # 200s ago — beyond 60s grace
        }
        stale_token = pyjwt.encode(payload, provider._secret, algorithm="HS256")
        with pytest.raises(ValueError, match="too long"):
            provider.refresh_access_token(stale_token)

    def test_get_session_for_request_returns_session(self):
        provider = self._make_provider()
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        session = _make_session(session_id=session_id, jti=jti)
        provider._sessions.create_session(session)
        token = provider._mint_jwt(
            jti=jti, session_id=session_id,
            email="jane@studio.com", name="Jane", sg_user_id=42
        )
        retrieved_session = provider.get_session_for_request(token)
        assert retrieved_session.sg_token == "opaque-sg-token"
        assert retrieved_session.email == "jane@studio.com"

    def test_get_session_for_revoked_token_raises(self):
        provider = self._make_provider()
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        session = _make_session(session_id=session_id, jti=jti)
        provider._sessions.create_session(session)
        token = provider._mint_jwt(
            jti=jti, session_id=session_id,
            email="jane@studio.com", name="Jane", sg_user_id=42
        )
        provider._sessions.revoke_token(jti, 3600)
        with pytest.raises(ValueError, match="revoked"):
            provider.get_session_for_request(token)


# ═══════════════════════════════════════════════════════════════════════════ #
# ShotgridProvider user-token mode tests                                      #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestShotgridProviderProductionMode:

    @patch("dna.auth.connection_pool.Shotgun")
    @patch("dna.prodtrack_providers.shotgrid.Shotgun")
    def test_user_token_with_session_uses_pool(self, mock_sg_direct, mock_sg_pool):
        import os
        from unittest.mock import patch as _patch

        with _patch.dict(os.environ, {"SHOTGRID_URL": "https://sg.example.com"}):
            from dna.auth.connection_pool import ShotGridConnectionPool
            pool = ShotGridConnectionPool()

            session_id = str(uuid.uuid4())
            sg_token = "user-session-token"
            # Pre-populate pool with a mock connection
            mock_conn = MagicMock()
            pool._pool[session_id] = __import__(
                "dna.auth.connection_pool", fromlist=["_PoolEntry"]
            )._PoolEntry(
                conn=mock_conn,
                session_id=session_id,
                sg_token_hash=hashlib.sha256(sg_token.encode()).hexdigest(),
            )

            with _patch("dna.auth.connection_pool.get_connection_pool", return_value=pool):
                from dna.prodtrack_providers.shotgrid import ShotgridProvider
                provider = ShotgridProvider(
                    user_token=sg_token, session_id=session_id
                )
                # Should get connection from pool, not create new Shotgun()
                assert provider.sg is mock_conn
                mock_sg_direct.assert_not_called()

    @patch("dna.prodtrack_providers.shotgrid.Shotgun")
    def test_sudo_in_user_token_mode_is_noop(self, mock_sg):
        import os
        with patch.dict(os.environ, {"SHOTGRID_URL": "https://sg.example.com"}):
            from dna.prodtrack_providers.shotgrid import ShotgridProvider
            provider = ShotgridProvider(user_token="tok")
            original_conn = provider.sg
            with provider.sudo("some-user"):
                # In user-token mode, sudo should not change the connection
                assert provider._sg is original_conn
            # After context, still the same
            assert provider._sg is original_conn
