"""ShotGrid PAT Auth Provider.

Authenticates users via ShotGrid username + Legacy Password (Personal Access
Token path).  The password is verified once and discarded, and so are the
tokens ShotGrid returns: DNA stores no ShotGrid credential of any kind.

Tokens
------
**Access token** — a signed DNA JWT, 15 minutes by default
(``JWT_EXPIRE_MINUTES``).  Sent as ``Authorization: Bearer``.  Carries no
credentials; every request also confirms its server-side session still exists,
so revoking a session cuts off its access tokens immediately.

**Refresh token** — a random 256-bit secret, delivered only as an ``httpOnly``
cookie scoped to ``/auth`` so page JavaScript can never read it.  Only its
SHA-256 hash is stored.  It is single-use: every refresh rotates it, and
presenting a rotated-out secret (outside a short grace window for concurrent
tabs) is treated as theft and revokes the whole session.

**Session** — ends when the user is idle longer than ``SESSION_TTL_SECONDS``
(MongoDB TTL index, reset on every refresh), or unconditionally
``SESSION_MAX_LIFETIME_SECONDS`` after login, when the password is required
again however active the user has been.  Each refresh also confirms, with the
script account, that the ShotGrid account is still active.

Auth flow
---------
1. Browser POSTs username + password to POST /auth/login
2. Backend calls ShotGrid's /api/v1/auth/access_token (password grant)
   → ShotGrid validates the credentials; the password and the returned
     ShotGrid tokens are then discarded
3. Backend resolves the HumanUser (id, email, name, login, status) with the
   script account; an inactive account is refused
4. A UserSession holding the ShotGrid login name is stored in MongoDB
5. The access token is returned in the body; the refresh token is set as a cookie
6. Every subsequent request: JWT verified → session confirmed → ShotGrid is
   queried with the script account and ``sudo_as_login=<login>``, so ShotGrid
   enforces that user's own permission group

Cloud ShotGrid requires PAT setup (once per user):
  1. profile.autodesk.com → Security → Personal Access Tokens → create
  2. ShotGrid → Account Settings → Legacy Login and PAT → bind PAT code
On-prem ShotGrid: use the actual ShotGrid / LDAP password, no PAT needed.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Optional

try:
    import jwt as pyjwt
except ImportError:
    raise ImportError("PyJWT is required: pip install PyJWT")

from dna.auth.session_store import (
    AbstractSessionStore,
    ShotGridCredentials,
    UserSession,
)
from dna.auth.shotgrid_auth_client import ShotGridAuthClient, ShotGridUnavailable
from dna.auth_providers.auth_provider_base import AuthProviderBase

logger = logging.getLogger(__name__)

# Recorded on each session so downstream code can tell which path created it.
AUTH_PROVIDER_NAME = "shotgrid_pat"

# HS256 is only as strong as its key. 32 characters matches the output of
# ``openssl rand -hex 16`` and the documented minimum.
MIN_JWT_SECRET_LENGTH = 32

# Bind access tokens to this service. Without them, a token minted by any other
# system sharing JWT_SECRET_KEY — a staging deployment, say — would be accepted.
DEFAULT_JWT_ISSUER = "dna-backend"
DEFAULT_JWT_AUDIENCE = "dna-api"

# Short enough that a leaked access token is useful only briefly; the refresh
# cookie keeps an active user signed in without re-entering their password.
DEFAULT_ACCESS_TOKEN_MINUTES = 15

# Hard ceiling on a session regardless of activity. After this the user must
# prove they still know their password.
DEFAULT_SESSION_MAX_LIFETIME_SECONDS = 12 * 60 * 60

# Two tabs share one cookie jar, so both can send the same refresh secret before
# either sees the rotated cookie. A rotated-out secret arriving within this
# window is that race, not theft.
REFRESH_REUSE_GRACE_SECONDS = 30

REFRESH_COOKIE_NAME = "dna_refresh"
# Sent only to /auth/*, so the secret never accompanies ordinary API calls.
REFRESH_COOKIE_PATH = "/auth"

# Cookie-authenticated endpoints require this header. A cross-site page cannot
# attach a custom header without passing a CORS preflight, which it will fail.
CSRF_HEADER_NAME = "X-DNA-CSRF"


@dataclass
class AuthResult:
    """Outcome of a login or refresh.

    ``refresh_cookie`` is the value to set in the ``dna_refresh`` cookie, or
    None to leave the browser's current cookie untouched.
    """

    body: dict
    refresh_cookie: Optional[str]


def refresh_cookie_settings() -> dict:
    """Attributes for the refresh cookie, as ``Response.set_cookie`` kwargs.

    ``REFRESH_COOKIE_SAMESITE`` — ``strict`` (default), ``lax``, or ``none``.
        Use ``none`` only when the frontend and API are on different sites;
        it then relies on the CSRF header check.
    ``REFRESH_COOKIE_SECURE`` — ``true`` (default).  Browsers treat
        ``http://localhost`` as secure, so the default works for local
        development too.

    No ``max_age`` is set: it is a browser-session cookie, gone when the browser
    closes.  The server-side idle and absolute limits govern its real lifetime.

    Raises:
        ValueError: An invalid combination, e.g. ``samesite=none`` without
            ``secure``, which browsers reject silently.
    """
    samesite = os.getenv("REFRESH_COOKIE_SAMESITE", "strict").strip().lower()
    if samesite not in {"strict", "lax", "none"}:
        raise ValueError(
            f"REFRESH_COOKIE_SAMESITE must be strict, lax or none (got '{samesite}')."
        )
    secure = os.getenv("REFRESH_COOKIE_SECURE", "true").strip().lower() not in {
        "0",
        "false",
        "no",
    }
    if samesite == "none" and not secure:
        raise ValueError(
            "REFRESH_COOKIE_SAMESITE=none requires REFRESH_COOKIE_SECURE=true; "
            "browsers reject the cookie otherwise."
        )
    return {
        "httponly": True,
        "secure": secure,
        "samesite": samesite,
        "path": REFRESH_COOKIE_PATH,
    }


class ShotGridSSOProvider(AuthProviderBase):
    """Production auth provider — ShotGrid username + Legacy Password (PAT)."""

    def __init__(
        self,
        session_store: Optional[AbstractSessionStore] = None,
        sg_auth_client: Optional[ShotGridAuthClient] = None,
    ) -> None:
        secret = os.getenv("JWT_SECRET_KEY") or ""
        if len(secret) < MIN_JWT_SECRET_LENGTH:
            # HS256 security rests entirely on this key: anyone who can guess it
            # can mint a token for any user. Refuse to start with a missing or
            # short one rather than run with a forgeable signature.
            raise ValueError(
                f"JWT_SECRET_KEY must be at least {MIN_JWT_SECRET_LENGTH} "
                f"characters (got {len(secret)}). Generate one with:  "
                "openssl rand -hex 32"
            )
        self._secret = secret
        self._algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self._issuer = os.getenv("JWT_ISSUER", DEFAULT_JWT_ISSUER)
        self._audience = os.getenv("JWT_AUDIENCE", DEFAULT_JWT_AUDIENCE)
        self._expire_seconds = (
            int(os.getenv("JWT_EXPIRE_MINUTES", str(DEFAULT_ACCESS_TOKEN_MINUTES))) * 60
        )
        self._max_session_seconds = int(
            os.getenv(
                "SESSION_MAX_LIFETIME_SECONDS",
                str(DEFAULT_SESSION_MAX_LIFETIME_SECONDS),
            )
        )

        self._sessions: AbstractSessionStore = session_store or _lazy_session_store()
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
        """Validate an access token and confirm its session is still active.

        Raises:
            ValueError: Token missing, malformed, expired or revoked; or its
                session has been logged out, expired, or hit its maximum length.
        """
        claims, _ = self.authenticate(token)
        return claims

    # ── PAT login ─────────────────────────────────────────────────────── #

    def login(self, username: str, password: str) -> AuthResult:
        """Authenticate with ShotGrid username + Legacy Password.

        Args:
            username: ShotGrid login name or email address.
            password: ShotGrid Legacy Login password (cloud) or actual password (on-prem).

        Returns:
            The access token in ``body`` and a new refresh cookie value.

        Raises:
            ValueError: ShotGrid rejected the credentials, or the user could not
                be resolved or is not active.
        """
        # Success is all that matters here. The ShotGrid tokens in the response
        # are deliberately not kept: requests use sudo_as_login, and a stored
        # user token would be a renewable ShotGrid credential in the database.
        self._get_sg_auth().login_user(username, password)
        user_info = self._get_sg_auth().get_user_info(username)

        refresh_secret = secrets.token_urlsafe(32)
        session = UserSession(
            session_id=str(uuid.uuid4()),
            jti=str(uuid.uuid4()),
            email=user_info.email,
            name=user_info.name,
            auth_provider=AUTH_PROVIDER_NAME,
            shotgrid=ShotGridCredentials(
                user_id=user_info.sg_user_id,
                # Store the HumanUser.login resolved from ShotGrid, not what was
                # typed into the form. sudo_as_login matches on the login field,
                # and on cloud sites users sign in with their email, which is not
                # always the same string. Falling back to the submitted value
                # keeps sites where the two are identical working.
                username=user_info.login or username,
            ),
            dna_refresh_token_hash=_hash_secret(refresh_secret),
        )
        self._sessions.create_session(session)

        return AuthResult(
            body=self._token_body(session),
            refresh_cookie=_build_refresh_cookie(session.session_id, refresh_secret),
        )

    # ── Login info (mode detection for frontend) ─────────────────────── #

    def get_login_info(self) -> dict:
        """Report the login mode so the frontend renders the right form.

        Only the ShotGrid username + password form is supported.
        """
        return {"mode": "pat"}

    # ── Token refresh ─────────────────────────────────────────────────── #

    def refresh_session(self, refresh_cookie: str) -> AuthResult:
        """Exchange a refresh cookie for a new access token, rotating the cookie.

        Also confirms with ShotGrid that the account is still active, which is
        how a deactivated account loses access.

        Raises:
            ValueError: The cookie is malformed, its session has ended or hit
                its maximum length, the ShotGrid account is no longer active, or a
                rotated-out secret was reused — in which case the session is
                revoked as a precaution.
        """
        session_id, secret = _parse_refresh_cookie(refresh_cookie)
        session = self._sessions.get_session(session_id)
        if session is None:
            raise ValueError("Your session has ended. Please log in again.")
        self._enforce_max_lifetime(session)

        presented = _hash_secret(secret)

        if _matches(presented, session.dna_refresh_token_hash):
            return self._rotate(session, presented)

        if _matches(presented, session.dna_previous_refresh_token_hash):
            if self._within_reuse_grace(session):
                # Another tab rotated the cookie a moment ago. The browser
                # already holds the new cookie; issue an access token only.
                return AuthResult(body=self._token_body(session), refresh_cookie=None)
            # A secret that really was issued, rotated out, and is now being
            # replayed after the grace window: it was copied. End the session
            # for everyone, including whoever copied it.
            self._sessions.delete_session(session_id)
            logger.warning(
                "Refresh token replay detected; session revoked (ref %s).",
                _log_ref(session_id),
            )
            raise ValueError(
                "This sign-in was used from another location and has been ended "
                "for your security. Please log in again."
            )

        # Never issued for this session. Reject it, but do not revoke anything:
        # session ids are visible inside every access token, so revoking here
        # would let anyone who has seen one log that user out at will.
        raise ValueError("Invalid refresh token. Please log in again.")

    # ── Logout / revocation ───────────────────────────────────────────── #

    def logout(
        self, access_token: Optional[str], refresh_cookie: Optional[str]
    ) -> None:
        """End the session identified by an access token and/or refresh cookie.

        Either credential is enough, so a user whose access token has already
        expired can still log out using the cookie. An expired access token is
        accepted (its signature is still verified); a refresh cookie must match
        the session's current or previous secret.

        Storage errors are deliberately not caught: the caller must report a
        failed logout rather than claim success while the session lives on.
        """
        session_ids: set[str] = set()

        if access_token:
            try:
                claims = self._decode_jwt(access_token, allow_expired=True)
            except ValueError:
                claims = None
            if claims:
                jti = claims.get("jti")
                if jti:
                    remaining = max(0, int(claims.get("exp", 0)) - int(time.time()))
                    self._sessions.revoke_token(jti, remaining)
                if claims.get("session_id"):
                    session_ids.add(claims["session_id"])

        if refresh_cookie:
            try:
                cookie_session_id, secret = _parse_refresh_cookie(refresh_cookie)
            except ValueError:
                cookie_session_id = None
            if cookie_session_id:
                session = self._sessions.get_session(cookie_session_id)
                presented = _hash_secret(secret)
                if session and (
                    _matches(presented, session.dna_refresh_token_hash)
                    or _matches(presented, session.dna_previous_refresh_token_hash)
                ):
                    session_ids.add(cookie_session_id)

        for session_id in session_ids:
            self._sessions.delete_session(session_id)

    def logout_all(self, access_token: str) -> int:
        """End every session belonging to the user who owns ``access_token``.

        Returns:
            The number of sessions ended, including the current one.

        Raises:
            ValueError: The access token is invalid or its session has ended.
        """
        claims, session = self.authenticate(access_token)
        ended = self._sessions.delete_sessions_for_email(session.email)
        remaining = max(0, int(claims.get("exp", 0)) - int(time.time()))
        self._sessions.revoke_token(claims["jti"], remaining)
        logger.info("Ended %d session(s) via logout-all.", ended)
        return ended

    # ── Session retrieval (prodtrack dependency) ──────────────────────── #

    def get_session_for_request(self, token: str) -> UserSession:
        """Validate the access token and return its active session.

        Called by ``get_user_scoped_prodtrack_provider()`` on every request.
        The caller reads ``session.sg_username`` from the returned session and
        passes it to ShotGrid as ``sudo_as_login``, so ShotGrid enforces that
        user's native permission group on every query — no extra filtering is
        needed in application code.

        Raises:
            ValueError: Token invalid or revoked, or the session has ended.
        """
        _, session = self.authenticate(token)
        return session

    # ── Internal ──────────────────────────────────────────────────────── #

    def authenticate(self, token: str) -> tuple[dict, UserSession]:
        """Verify an access token and load its session, in one pass.

        This is what the request pipeline calls, once per request; its result
        is shared by every dependency that needs the caller's identity.

        The session lookup is what makes revocation immediate: logging out,
        logging out everywhere, reuse detection, a deactivated ShotGrid account
        and the maximum lifetime all work by deleting the session, and every access
        token for it stops working on the next request.
        """
        claims = self._decode_jwt(token)
        jti = claims.get("jti")
        if not jti:
            raise ValueError("Token is missing the 'jti' claim.")
        session_id = claims.get("session_id")
        if not session_id:
            raise ValueError("Token is missing the 'session_id' claim.")
        if self._sessions.is_token_revoked(jti):
            raise ValueError("Token has been revoked. Please log in again.")
        session = self._sessions.get_session(session_id)
        if session is None:
            raise ValueError("Your session has ended. Please log in again.")
        self._enforce_max_lifetime(session)
        return claims, session

    def _enforce_max_lifetime(self, session: UserSession) -> None:
        if time.time() - session.created_at > self._max_session_seconds:
            self._sessions.delete_session(session.session_id)
            raise ValueError(
                "Your session has reached its maximum length. Please log in again."
            )

    def _within_reuse_grace(self, session: UserSession) -> bool:
        return (
            time.time() - session.dna_refresh_rotated_at <= REFRESH_REUSE_GRACE_SECONDS
        )

    def _rotate(self, session: UserSession, presented_hash: str) -> AuthResult:
        new_secret = secrets.token_urlsafe(32)
        rotated = self._sessions.rotate_refresh_token(
            session.session_id,
            expected_hash=presented_hash,
            new_hash=_hash_secret(new_secret),
            new_jti=str(uuid.uuid4()),
        )

        if rotated is None:
            # A concurrent refresh of the same cookie won the atomic swap. The
            # browser receives that request's cookie, so answer this one from
            # the grace path rather than treating the race as theft.
            current = self._sessions.get_session(session.session_id)
            if (
                current is not None
                and _matches(presented_hash, current.dna_previous_refresh_token_hash)
                and self._within_reuse_grace(current)
            ):
                return AuthResult(body=self._token_body(current), refresh_cookie=None)
            raise ValueError("Your session has ended. Please log in again.")

        # Only the winner of the swap talks to ShotGrid: concurrent tabs cost
        # one account check, not one each.
        self._confirm_shotgrid_access(rotated)
        return AuthResult(
            body=self._token_body(rotated),
            refresh_cookie=_build_refresh_cookie(rotated.session_id, new_secret),
        )

    def _confirm_shotgrid_access(self, session: UserSession) -> None:
        """End the session if its ShotGrid account is no longer active.

        The check uses the script account, so DNA needs no ShotGrid token of the
        user's. If ShotGrid is merely unreachable the session is kept: the check
        is retried on the next refresh, and the absolute lifetime still applies.
        """
        if not (session.sg_user_id and session.sg_username):
            self._sessions.delete_session(session.session_id)
            raise ValueError("Your session cannot be renewed. Please log in again.")

        try:
            self._get_sg_auth().confirm_user_active(
                session.sg_user_id, session.sg_username
            )
        except ShotGridUnavailable as exc:
            logger.warning(
                "ShotGrid unavailable during refresh; keeping session and "
                "rechecking on the next refresh: %s",
                exc,
            )
        except ValueError as exc:
            # ShotGrid answered and the account may not sign in. Deleting the
            # session revokes every access token issued for it.
            self._sessions.delete_session(session.session_id)
            raise ValueError(f"{exc} Please log in again.")

    def _token_body(self, session: UserSession) -> dict:
        return {
            "access_token": self._mint_jwt(
                session.jti,
                session.session_id,
                session.email,
                session.name,
                session.sg_user_id,
            ),
            "token_type": "Bearer",
            "expires_in": self._expire_seconds,
            "user": {
                "id": session.sg_user_id,
                "email": session.email,
                "name": session.name,
                "shotgrid_user_id": session.sg_user_id,
            },
        }

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
            "iss": self._issuer,
            "aud": self._audience,
        }
        return pyjwt.encode(payload, self._secret, algorithm=self._algorithm)

    def _decode_jwt(self, token: str, allow_expired: bool = False) -> dict:
        options = {
            "verify_exp": not allow_expired,
            "require": ["exp", "iat", "iss", "aud"],
        }
        try:
            return pyjwt.decode(
                token,
                self._secret,
                algorithms=[self._algorithm],
                audience=self._audience,
                issuer=self._issuer,
                options=options,
            )
        except pyjwt.ExpiredSignatureError:
            raise ValueError(
                "Token has expired. Use POST /auth/refresh or log in again."
            )
        except pyjwt.InvalidTokenError as exc:
            raise ValueError(f"Invalid authentication token: {exc}")


# ── Refresh-token helpers ─────────────────────────────────────────────────────


def _hash_secret(secret: str) -> str:
    """SHA-256 of a refresh secret. The secret is 256 random bits, so a fast
    hash is sufficient — there is nothing to brute-force."""
    return hashlib.sha256(secret.encode()).hexdigest()


def _matches(presented_hash: str, stored_hash: str) -> bool:
    """Constant-time comparison; an empty stored hash never matches."""
    return bool(stored_hash) and hmac.compare_digest(presented_hash, stored_hash)


def _build_refresh_cookie(session_id: str, secret: str) -> str:
    # Neither a UUID nor a token_urlsafe secret contains ".", so it separates them.
    return f"{session_id}.{secret}"


def _log_ref(session_id: str) -> str:
    """Short, non-reversible reference to a session, for correlating log lines.

    The raw session id is avoided in logs because it appears inside access
    tokens and so helps anyone who can read the logs target a session.
    """
    return hashlib.sha256(session_id.encode()).hexdigest()[:12]


def _parse_refresh_cookie(value: str) -> tuple[str, str]:
    session_id, sep, secret = (value or "").partition(".")
    if not (sep and session_id and secret):
        raise ValueError("Invalid refresh token. Please log in again.")
    return session_id, secret


# ── Lazy singletons ───────────────────────────────────────────────────────────


def _lazy_session_store():
    from dna.auth.session_store import get_session_store

    return get_session_store()


def _lazy_sg_auth_client():
    from dna.auth.shotgrid_auth_client import get_sg_auth_client

    return get_sg_auth_client()
