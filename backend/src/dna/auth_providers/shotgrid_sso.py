"""ShotGrid PAT Auth Provider.

Authenticates users via ShotGrid username + Legacy Password (Personal Access
Token path).  ShotGrid tokens are stored server-side in MongoDB — they are
never sent to the browser.  The browser receives only a short-lived DNA JWT.

Auth flow
---------
1. Browser POSTs username + password to POST /auth/login
2. Backend calls ShotGrid's /api/v1/auth/access_token (password grant)
   → ShotGrid validates credentials against its own user database
3. Backend calls ShotGrid HumanUser.find_one to resolve the real user identity
   (email, name, integer sg_user_id — nothing hardcoded)
4. A UserSession is stored in MongoDB with the user's SG token
5. A minimal DNA JWT is returned to the browser (no credentials inside)
6. Every subsequent request: JWT verified → session fetched → SG query runs
   under the user's own SG token → ShotGrid enforces native permissions

Cloud ShotGrid requires PAT setup (once per user):
  1. profile.autodesk.com → Security → Personal Access Tokens → create
  2. ShotGrid → Account Settings → Legacy Login and PAT → bind PAT code
On-prem ShotGrid: use the actual ShotGrid / LDAP password, no PAT needed.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Optional

try:
    import jwt as pyjwt
except ImportError:
    raise ImportError("PyJWT is required: pip install PyJWT")

from dna.auth.session_store import SessionStore, ShotGridCredentials, UserSession
from dna.auth.shotgrid_auth_client import ShotGridAuthClient
from dna.auth_providers.auth_provider_base import AuthProviderBase


class ShotGridSSOProvider(AuthProviderBase):
    """Production auth provider — ShotGrid username + Legacy Password (PAT)."""

    _REFRESH_GRACE_SECONDS = 60

    def __init__(
        self,
        session_store: Optional[SessionStore] = None,
        sg_auth_client: Optional[ShotGridAuthClient] = None,
    ) -> None:
        self._secret = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_USE_A_REAL_SECRET_32CHARS")
        self._algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self._expire_seconds = int(os.getenv("JWT_EXPIRE_MINUTES", "480")) * 60

        _INSECURE_DEFAULT = "CHANGE_ME_USE_A_REAL_SECRET_32CHARS"
        if self._secret == _INSECURE_DEFAULT:
            raise ValueError(
                "JWT_SECRET_KEY is set to the insecure placeholder value. "
                "Generate a secure secret with:  openssl rand -hex 32  "
                "and set it in your environment before starting the server."
            )

        self._sessions: SessionStore = session_store or _lazy_session_store()
        # _sg_auth is initialised lazily via _get_sg_auth() to avoid failing
        # at startup when SHOTGRID_URL is not yet configured.
        self._sg_auth_override: Optional[ShotGridAuthClient] = sg_auth_client

    def _get_sg_auth(self) -> "ShotGridAuthClient":
        """Return the ShotGrid auth client, initialising it on first use."""
        if self._sg_auth_override is not None:
            return self._sg_auth_override
        return _lazy_sg_auth_client()

    # ── AuthProviderBase ──────────────────────────────────────────────── #

    def validate_token(self, token: str) -> dict:
        """Validate DNA JWT and check revocation blocklist.

        Raises:
            ValueError: Missing, malformed, expired, or revoked token.
        """
        claims = self._decode_jwt(token)
        jti = claims.get("jti")
        if not jti:
            raise ValueError("Token is missing the 'jti' claim.")
        if self._sessions.is_token_revoked(jti):
            raise ValueError("Token has been revoked. Please log in again.")
        return claims

    # ── PAT login ─────────────────────────────────────────────────────── #

    def login(self, username: str, password: str) -> dict:
        """Authenticate with ShotGrid username + Legacy Password.

        Args:
            username: ShotGrid username (email on cloud, login on some on-prem sites).
            password: ShotGrid Legacy Login password (cloud) or actual password (on-prem).

        Returns:
            Auth token response dict with 'access_token' (DNA JWT).

        Raises:
            ValueError: SG rejected credentials, or user info missing.
        """
        sg_token_set = self._get_sg_auth().login_user(username, password)
        user_info = self._get_sg_auth().get_user_info(
            sg_token_set.access_token, username=username
        )

        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        session = UserSession(
            session_id=session_id,
            jti=jti,
            email=user_info.email,
            name=user_info.name,
            auth_provider="shotgrid_pat",
            shotgrid=ShotGridCredentials(
                user_id=user_info.sg_user_id,
                username=username,                  # ShotGrid login name — never overwritten
                access_token=sg_token_set.access_token,   # Bearer token — rotated on refresh
                refresh_token=sg_token_set.refresh_token,
                password=password,                  # stored server-side, never sent to client
            ),
        )
        self._sessions.create_session(session)

        access_token = self._mint_jwt(
            jti, session_id, user_info.email, user_info.name, user_info.sg_user_id
        )
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": self._expire_seconds,
            "refresh_token": None,
            "user": {
                "id": user_info.sg_user_id,
                "email": user_info.email,
                "name": user_info.name,
                "shotgrid_user_id": user_info.sg_user_id,
            },
        }

    # ── Login info (mode detection for frontend) ─────────────────────── #

    def get_login_info(self) -> dict:
        """Return available auth modes so the frontend renders the correct login UI.

        Returns PAT-only mode.
        """
        return {
            "modes": {
                "shotgrid_pat": {"enabled": True},
                "shotgrid_sso": {"enabled": False},
                "google": {"enabled": False},
            },
            "mode": "pat",
        }

    # ── Token refresh ─────────────────────────────────────────────────── #

    def refresh_access_token(self, expired_jwt: str) -> dict:
        """Rotate DNA JWT + underlying SG tokens.

        SG access_token lifetime = 3600s (1 hour, site-configurable).
        DNA JWT lifetime = 480 min (8 hours, configurable via JWT_EXPIRE_MINUTES).
        """
        claims = self._decode_jwt(expired_jwt, allow_expired=True)
        now = int(time.time())
        exp = claims.get("exp", 0)

        if now > (exp + self._REFRESH_GRACE_SECONDS):
            raise ValueError("Token expired too long ago. Please log in again.")

        old_jti = claims.get("jti")
        session_id = claims.get("session_id")

        if old_jti and self._sessions.is_token_revoked(old_jti):
            raise ValueError("Token has been revoked. Please log in again.")

        session = self._sessions.get_session(session_id)
        if session is None:
            raise ValueError("Session not found or expired. Please log in again.")

        if not session.refresh_token:
            raise ValueError(
                "No ShotGrid refresh token in session. Please log in again."
            )

        try:
            new_sg = self._get_sg_auth().refresh_tokens(session.refresh_token)
        except ValueError as exc:
            self._sessions.delete_session(session_id)
            raise ValueError(
                f"ShotGrid token refresh failed: {exc}. Please log in again."
            )

        new_jti = str(uuid.uuid4())
        session.sg_token = new_sg.access_token
        session.refresh_token = new_sg.refresh_token
        session.jti = new_jti
        self._sessions.update_session(session)

        # Revoke old jti in blocklist
        if old_jti:
            remaining = max(0, exp - int(time.time()))
            self._sessions.revoke_token(old_jti, remaining + self._REFRESH_GRACE_SECONDS)

        # Release stale pool slot (new SG token → new connection on next request)
        _release_from_pool(session_id)

        access_token = self._mint_jwt(
            new_jti, session_id, session.email, session.name, session.sg_user_id
        )
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": self._expire_seconds,
            "refresh_token": None,
            "user": {
                "id": session.sg_user_id,
                "email": session.email,
                "name": session.name,
                "shotgrid_user_id": session.sg_user_id,
            },
        }

    # ── Logout / revocation ───────────────────────────────────────────── #

    def revoke_token(self, token: str) -> None:
        """Revoke JWT → add to blocklist + delete session + release pool."""
        try:
            claims = self._decode_jwt(token, allow_expired=True)
        except ValueError:
            return
        jti = claims.get("jti")
        session_id = claims.get("session_id")
        exp = claims.get("exp", 0)
        if jti:
            remaining = max(0, exp - int(time.time()))
            self._sessions.revoke_token(jti, remaining + self._REFRESH_GRACE_SECONDS)
        if session_id:
            self._sessions.delete_session(session_id)
            _release_from_pool(session_id)

    # ── Session retrieval (prodtrack dependency) ──────────────────────── #

    def get_session_for_request(self, token: str) -> UserSession:
        """Validate JWT + blocklist check → return MongoDB session with sg_token.

        Called by get_user_scoped_prodtrack_provider() on every request.
        The sg_token from the session is passed to ShotGridConnectionPool.get()
        which returns a pooled Shotgun connection (no TCP handshake per request).

        ShotGrid enforces the user's native permissions on every .find() call
        made through the connection — no extra filtering needed in app code.
        """
        claims = self.validate_token(token)
        session_id = claims.get("session_id")
        if not session_id:
            raise ValueError("Token is missing 'session_id' claim.")
        session = self._sessions.get_session(session_id)
        if session is None:
            raise ValueError("Session has expired. Please log in again.")
        return session

    # ── Internal ──────────────────────────────────────────────────────── #

    def _mint_jwt(self, jti, session_id, email, name, sg_user_id) -> str:
        """Mint a signed DNA JWT. No SG token inside — server-side only."""
        now = int(time.time())
        payload = {
            "jti": jti,
            "sub": str(sg_user_id),
            "session_id": session_id,
            "email": email,
            "name": name or email,
            "iat": now,
            "exp": now + self._expire_seconds,
        }
        return pyjwt.encode(payload, self._secret, algorithm=self._algorithm)

    def _decode_jwt(self, token: str, allow_expired: bool = False) -> dict:
        options = {"verify_exp": not allow_expired}
        try:
            return pyjwt.decode(
                token, self._secret, algorithms=[self._algorithm], options=options
            )
        except pyjwt.ExpiredSignatureError:
            raise ValueError(
                "Token has expired. Use POST /auth/refresh or log in again."
            )
        except pyjwt.InvalidTokenError as exc:
            raise ValueError(f"Invalid authentication token: {exc}")


# ── Lazy singletons ───────────────────────────────────────────────────────────

def _lazy_session_store():
    from dna.auth.session_store import get_session_store
    return get_session_store()

def _lazy_sg_auth_client():
    from dna.auth.shotgrid_auth_client import get_sg_auth_client
    return get_sg_auth_client()

def _release_from_pool(session_id: str) -> None:
    try:
        from dna.auth.connection_pool import get_connection_pool
        get_connection_pool().release(session_id)
    except Exception as exc:
        import warnings
        warnings.warn(
            f"[shotgrid_sso] Failed to release pool entry for session '{session_id}': {exc}",
            stacklevel=2,
        )
