"""ShotGrid Auth Client — uses ShotGrid's own OAuth2-like token endpoint.

CONFIRMED FACTS (see INVESTIGATION_FINDINGS.md)
------------------------------------------------
1. Autodesk Identity access_tokens CANNOT be used with ShotGrid (not GA, 2026).
2. Auth endpoint: POST <sg_url>/api/v1/auth/access_token  (always v1, not v1.1)
3. Three supported grant types:
     password          → username + Legacy Password (requires user PAT on cloud)
     client_credentials→ script_name + api_key
     session_token     → exchange existing SG session_token for Bearer token
4. Default access_token lifetime: 3600 seconds (1 hour), site-configurable.
   The actual value is returned in the 'expires_in' field of every response.
5. Refresh tokens: supported via grant_type=refresh_token.
6. On-prem Docker sites: same endpoint, NO PAT required, uses actual SG password.

RECOMMENDED AUTH FLOW FOR DNA (see INVESTIGATION_FINDINGS.md Q2)
-----------------------------------------------------------------
PRIMARY: AMI (Action Menu Item) flow — user launches DNA from within ShotGrid.
  ShotGrid sends session_token in POST payload → exchange via session_token grant.
  No PAT. No Legacy Password. Seamless SSO.

FALLBACK: password grant — standalone access via Legacy Login + PAT.
  Requires per-user PAT setup (cannot be admin-provisioned).

BACKGROUND: client_credentials — script key for background jobs only.

Environment variables:
  SHOTGRID_URL                  - e.g. https://mystudio.shotgunstudio.com
  SG_SITE_TYPE                  - "cloud" (default) or "onprem"
  SG_ACCESS_TOKEN_TTL_BUFFER_SEC- refresh SG token N seconds before expiry (default 120)
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Optional

import requests


# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class SGTokenSet:
    """Tokens returned by ShotGrid's /api/v1/auth/access_token endpoint."""
    access_token: str
    refresh_token: Optional[str]
    token_type: str
    expires_in: int       # seconds — default 3600 (1 hour), site-configurable
    obtained_at: float = field(default_factory=time.time)


@dataclass
class SGUserInfo:
    """User info resolved from a ShotGrid access_token."""
    sg_user_id: int
    email: str
    name: str
    login: str            # ShotGrid login (needed for sudo_as_login if used)


# ── Client ────────────────────────────────────────────────────────────────────


class ShotGridAuthClient:
    """Handles all auth interactions with ShotGrid's own token endpoint.

    CONFIRMED: Autodesk Identity (APS) access_tokens CANNOT be used here.
    ShotGrid operates its own legacy OAuth2-like token system entirely separate
    from Autodesk Identity.

    Auth endpoint (both cloud and on-prem, always v1 not v1.1):
        POST <sg_url>/api/v1/auth/access_token
        Content-Type: application/x-www-form-urlencoded
    """

    # Class-level default — overridden per-instance in __init__ so that
    # environment variable changes after import are picked up correctly.
    _DEFAULT_TTL_BUFFER_SEC: int = 120

    def __init__(self, sg_url: Optional[str] = None) -> None:
        self.sg_url = (sg_url or os.getenv("SHOTGRID_URL") or "").rstrip("/")
        if not self.sg_url:
            raise ValueError("SHOTGRID_URL is required.")
        # NOTE: Auth endpoint is always /api/v1/ — never /api/v1.1/
        self._token_url = f"{self.sg_url}/api/v1/auth/access_token"
        self._is_onprem = os.getenv("SG_SITE_TYPE", "cloud").lower() == "onprem"
        # Read at instantiation time so tests / runtime env changes take effect.
        self.TTL_BUFFER_SEC: int = int(
            os.getenv("SG_ACCESS_TOKEN_TTL_BUFFER_SEC", str(self._DEFAULT_TTL_BUFFER_SEC))
        )

    # ── Grant: session_token (AMI flow — primary, no PAT needed) ─────── #

    def login_via_session_token(self, session_token: str) -> SGTokenSet:
        """Exchange an existing ShotGrid session_token for a Bearer token.

        This is the RECOMMENDED primary auth path for DNA.

        ShotGrid sends a session_token to DNA when the user launches it from
        the ShotGrid UI via an Action Menu Item (AMI). The backend exchanges
        it here for a proper Bearer access_token.

        No PAT. No Legacy Password. No Autodesk Identity interaction.
        The resulting access_token IS the user's session — ShotGrid enforces
        their native project permissions on all subsequent API calls.

        AMI Setup (ShotGrid Admin must do once):
            ShotGrid Admin → Action Menu Items → Create AMI
            Entity Types: Playlist (or Version, etc.)
            URL: POST https://your-dna-backend.com/auth/ami-callback
            Token type: User (sends the active user's session_token)

        Args:
            session_token: The ShotGrid session_token received in the AMI POST
                           payload (key: 'session_token' in the request body).

        Returns:
            SGTokenSet with access_token and refresh_token.

        Raises:
            ValueError: ShotGrid rejected the session_token or is unreachable.
        """
        return self._call_token_endpoint({
            "grant_type": "session_token",
            "session_token": session_token,
        })

    # ── Grant: password (fallback for standalone access) ─────────────── #

    def login_user(self, username: str, password: str) -> SGTokenSet:
        """Authenticate with ShotGrid username + Legacy Password.

        FALLBACK PATH: Use this only when DNA is accessed standalone (not
        launched from ShotGrid via AMI).

        PAT requirement:
        - Cloud ShotGrid: user MUST have a Personal Access Token (PAT) generated
          at profile.autodesk.com and bound to their ShotGrid account. This
          cannot be admin-provisioned — each user must do it once manually.
        - On-prem/Enterprise Docker (SG_SITE_TYPE=onprem): PAT is NOT required.
          Use the user's actual ShotGrid password (or LDAP/AD password if the
          site is bound to the studio directory).

        Args:
            username: ShotGrid username (usually the user's email on cloud sites).
            password: For cloud: ShotGrid Legacy Login password (set in SG Account
                      Settings, separate from Autodesk account password).
                      For on-prem: actual ShotGrid or LDAP/AD password.

        Returns:
            SGTokenSet with access_token and refresh_token.

        Raises:
            ValueError: Authentication rejected or ShotGrid unreachable.
        """
        return self._call_token_endpoint({
            "grant_type": "password",
            "username": username,
            "password": password,
        })

    # ── Grant: refresh_token ──────────────────────────────────────────── #

    def refresh_tokens(self, refresh_token: str) -> SGTokenSet:
        """Obtain a new token set using a stored ShotGrid refresh_token.

        The SG access_token defaults to 3600s lifetime (1 hour, site-configurable).
        The actual lifetime is in the expires_in field of the token response.
        We call this proactively via should_refresh() 2 minutes before expiry.

        Args:
            refresh_token: The ShotGrid refresh_token from the MongoDB session.

        Returns:
            New SGTokenSet (new access_token + new refresh_token).

        Raises:
            ValueError: Refresh token expired/revoked or ShotGrid unreachable.
                        On 401: caller should require the user to re-login via
                        the AMI flow or password grant.
        """
        return self._call_token_endpoint({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        })

    # ── User info ─────────────────────────────────────────────────────── #

    def get_user_info(self, access_token: str, username: str = None) -> SGUserInfo:
        """Resolve a ShotGrid HumanUser from an authenticated access_token.

        Two code paths:

        1. ``username`` provided (PAT / password grant):
           Look up the user by email using script credentials or fall back to
           trusting the authenticated email directly.

        2. ``username`` is None (AMI / SSO / session_token grant):
           Decode the ShotGrid Bearer JWT (no signature verification — SG
           issued it, we trust it) to extract the ``identity.id`` claim, then
           fetch the full user record via script credentials.

           ShotGrid REST API JWTs carry:
               { "identity": { "type": "HumanUser", "id": <int> }, ... }
           or  { "sub": "HumanUser:<id>", ... }

           Fallback (no script creds): make a REST call with the Bearer token
           to ``/api/v1/entity/HumanUsers/<id>``.
        """
        sg_script = os.getenv("SHOTGRID_SCRIPT_NAME")
        sg_key = os.getenv("SHOTGRID_API_KEY")

        # ── Path 1: username known (password grant) ──────────────────── #
        if username:
            if sg_script and sg_key:
                try:
                    from shotgun_api3 import Shotgun
                    sg = Shotgun(self.sg_url, script_name=sg_script, api_key=sg_key)
                    user = sg.find_one(
                        "HumanUser",
                        filters=[["email", "is", username]],
                        fields=["id", "name", "email", "login"],
                    )
                    if user:
                        return SGUserInfo(
                            sg_user_id=int(user["id"]),
                            email=(user.get("email") or username).lower().strip(),
                            name=user.get("name") or username,
                            login=user.get("login") or username,
                        )
                except Exception as exc:
                    raise ValueError(
                        f"Could not look up user '{username}' in ShotGrid: {exc}"
                    )
            # No script credentials — cannot look up user without them.
            # Returning sg_user_id=0 would silently break permission enforcement
            # on all subsequent ShotGrid API calls.  Fail loudly instead.
            raise ValueError(
                f"Cannot look up ShotGrid user '{username}': "
                "SHOTGRID_SCRIPT_NAME and SHOTGRID_API_KEY are required to resolve "
                "user identity. Set them in your environment."
            )

        # ── Path 2: username unknown (AMI / SSO / session_token grant) ── #
        # Decode the ShotGrid Bearer JWT to extract the HumanUser ID.
        user_id = self._extract_user_id_from_jwt(access_token)

        if user_id and sg_script and sg_key:
            try:
                from shotgun_api3 import Shotgun
                sg = Shotgun(self.sg_url, script_name=sg_script, api_key=sg_key)
                user = sg.find_one(
                    "HumanUser",
                    filters=[["id", "is", user_id]],
                    fields=["id", "name", "email", "login"],
                )
                if user:
                    return SGUserInfo(
                        sg_user_id=int(user["id"]),
                        email=(user.get("email") or "").lower().strip(),
                        name=user.get("name") or "",
                        login=user.get("login") or "",
                    )
            except Exception as exc:
                raise ValueError(
                    f"Could not fetch HumanUser(id={user_id}) from ShotGrid: {exc}"
                )

        # Fallback: REST call with the Bearer token itself.
        if user_id:
            try:
                resp = requests.get(
                    f"{self.sg_url}/api/v1/entity/HumanUsers/{user_id}",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"fields": "id,name,email,login"},
                    timeout=10,
                )
                if resp.ok:
                    attrs = resp.json().get("data", {}).get("attributes", {})
                    return SGUserInfo(
                        sg_user_id=user_id,
                        email=(attrs.get("email") or "").lower().strip(),
                        name=attrs.get("name") or "",
                        login=attrs.get("login") or "",
                    )
            except Exception:
                pass

        raise ValueError(
            "Could not resolve user identity from ShotGrid access_token. "
            "Ensure SHOTGRID_SCRIPT_NAME and SHOTGRID_API_KEY are configured, "
            "or check that the ShotGrid JWT contains an 'identity' claim."
        )

    @staticmethod
    def _extract_user_id_from_jwt(access_token: str) -> Optional[int]:
        """Decode a ShotGrid Bearer JWT (no verification) and return HumanUser ID.

        ShotGrid REST API access_tokens are JWTs.  The user identity is in:
          • ``identity.id``          (preferred, newer SG format)
          • ``sub``                  (may be int or "HumanUser:42")

        Returns None if decoding fails or no user ID is found.
        """
        import base64
        import json as _json

        try:
            parts = access_token.split(".")
            if len(parts) != 3:
                return None
            # Pad to a valid base64 length
            payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
            payload = _json.loads(base64.urlsafe_b64decode(payload_b64))

            # Preferred: identity.type == HumanUser and identity.id
            identity = payload.get("identity") or {}
            if isinstance(identity, dict) and identity.get("type") == "HumanUser":
                uid = identity.get("id")
                if uid:
                    return int(uid)

            # Fallback: sub claim — either int or "HumanUser:42"
            sub = payload.get("sub")
            if sub is not None:
                if isinstance(sub, int):
                    return sub
                s = str(sub)
                if ":" in s:
                    return int(s.split(":")[-1])
                return int(s)
        except Exception:
            pass
        return None

    # ── Token lifecycle helpers ───────────────────────────────────────── #

    def should_refresh(self, token_set: SGTokenSet) -> bool:
        """Return True if the SG access_token should be refreshed now.

        The SG token lifetime is returned in expires_in (default 3600s).
        We refresh TTL_BUFFER_SEC (120s) before expiry.
        """
        elapsed = time.time() - token_set.obtained_at
        return elapsed >= (token_set.expires_in - self.TTL_BUFFER_SEC)

    @staticmethod
    def is_expired(token_set: SGTokenSet) -> bool:
        """Return True if the SG access_token has definitely expired."""
        elapsed = time.time() - token_set.obtained_at
        return elapsed >= token_set.expires_in

    # ── Internal ──────────────────────────────────────────────────────── #

    def _call_token_endpoint(self, payload: dict) -> SGTokenSet:
        """POST to ShotGrid's /api/v1/auth/access_token endpoint.

        Raises:
            ValueError: HTTP error or malformed response.
        """
        try:
            resp = requests.post(
                self._token_url,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
            )
        except requests.ConnectionError:
            raise ValueError(
                f"Cannot reach ShotGrid auth endpoint at {self._token_url}. "
                "Check SHOTGRID_URL and network connectivity."
            )
        except requests.Timeout:
            raise ValueError("ShotGrid auth endpoint timed out after 15 seconds.")

        if resp.status_code == 401:
            grant = payload.get("grant_type", "unknown")
            if grant == "password":
                if self._is_onprem:
                    hint = "Verify username and ShotGrid/LDAP password (on-prem site)."
                else:
                    hint = (
                        "Verify username and Legacy Login password. "
                        "Ensure a Personal Access Token (PAT) has been generated "
                        "at profile.autodesk.com and bound to the ShotGrid account."
                    )
            elif grant == "session_token":
                hint = "The ShotGrid session_token has expired or is invalid. User must re-launch from ShotGrid."
            elif grant == "refresh_token":
                hint = "The ShotGrid refresh_token has expired. User must re-authenticate."
            else:
                hint = "Verify credentials."
            raise ValueError(f"ShotGrid authentication failed (HTTP 401). {hint}")

        if not resp.ok:
            try:
                body = resp.json()
                errors = body.get("errors", [])
                if errors and isinstance(errors, list):
                    first = errors[0]
                    detail = first.get("detail") or first.get("title") or str(first)
                else:
                    detail = str(body)[:200]
            except Exception:
                detail = resp.text[:200]
            raise ValueError(
                f"ShotGrid auth endpoint failed (HTTP {resp.status_code}): {detail}"
            )

        body = resp.json()
        access_token = body.get("access_token")
        if not access_token:
            raise ValueError(
                f"ShotGrid token response missing 'access_token'. "
                f"Keys received: {list(body.keys())}"
            )

        return SGTokenSet(
            access_token=access_token,
            refresh_token=body.get("refresh_token"),
            token_type=body.get("token_type", "Bearer"),
            # Use the actual value from the response — default 3600s (1 hour)
            expires_in=int(body.get("expires_in", 3600)),
            obtained_at=time.time(),
        )


# ── Singleton factory ─────────────────────────────────────────────────────────


_sg_auth_client: Optional[ShotGridAuthClient] = None


def get_sg_auth_client() -> ShotGridAuthClient:
    """Return the application-wide ShotGridAuthClient singleton."""
    global _sg_auth_client
    if _sg_auth_client is None:
        _sg_auth_client = ShotGridAuthClient()
    return _sg_auth_client
