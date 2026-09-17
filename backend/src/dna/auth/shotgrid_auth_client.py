"""ShotGrid auth client — talks to ShotGrid's own token endpoint.

DNA authenticates users with the ShotGrid *password grant*: a username plus
Legacy Login password is checked once against ShotGrid's token endpoint.  The
password is used only for that single call and is never stored, and neither
are the tokens ShotGrid returns — DNA queries ShotGrid with the script account
and ``sudo_as_login``, so it has no use for them.

While a session lasts, the account is re-checked with the script account
(``HumanUser.sg_status_list``), so a deactivated user loses access without DNA
holding any user credential.

Endpoint
--------
``POST <SHOTGRID_URL>/api/v1/auth/access_token`` — always ``v1``, never
``v1.1``, on both cloud and on-prem sites.  Access tokens default to a
3600-second lifetime; the real value comes back in ``expires_in``.

Cloud vs on-prem
----------------
Cloud sites require each user to have generated a Personal Access Token (PAT)
at profile.autodesk.com and bound it to their account; it cannot be provisioned
by an admin.  On-prem sites (``SG_SITE_TYPE=onprem``) need no PAT and accept the
user's actual ShotGrid or LDAP/AD password.

Environment variables
---------------------
``SHOTGRID_URL``          ShotGrid site URL, e.g. https://mystudio.shotgrid.autodesk.com
``SHOTGRID_SCRIPT_NAME``  Script account, used to resolve and re-check the user's HumanUser record
``SHOTGRID_API_KEY``      Script account key
``SG_SITE_TYPE``          ``cloud`` (default) or ``onprem``
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Optional

import requests

# Upper bound on a single call to the ShotGrid token endpoint.  A login blocks
# on this, so it must fail fast enough to show the user a clear error.
TOKEN_ENDPOINT_TIMEOUT_SEC = 15

_HUMAN_USER_FIELDS = ["id", "name", "email", "login", "sg_status_list"]

# HumanUser.sg_status_list for an account that may sign in. ShotGrid's other
# value is "dis" (disabled); anything but active is refused.
ACTIVE_USER_STATUS = "act"


# ── Errors ────────────────────────────────────────────────────────────────────
#
# Callers must be able to tell "ShotGrid said no" from "ShotGrid did not
# answer". The first ends a session; the second must not — otherwise a brief
# ShotGrid outage logs out every user who happens to refresh during it. Both
# subclass ValueError so callers that only need "it failed" keep working.


class ShotGridAuthRejected(ValueError):
    """ShotGrid refused the credentials or token. Definitive: log in again."""


class ShotGridUnavailable(ValueError):
    """ShotGrid could not be reached or failed to answer. Transient: retry."""


# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class SGTokenSet:
    """Tokens returned by ShotGrid's /api/v1/auth/access_token endpoint."""

    access_token: str
    refresh_token: Optional[str]
    token_type: str
    expires_in: int  # seconds — default 3600 (1 hour), site-configurable
    obtained_at: float = field(default_factory=time.time)


@dataclass
class SGUserInfo:
    """The ShotGrid HumanUser behind an authenticated login."""

    sg_user_id: int
    email: str
    name: str
    login: str  # HumanUser.login — the value sudo_as_login matches on


# ── Client ────────────────────────────────────────────────────────────────────


class ShotGridAuthClient:
    """Exchanges credentials with ShotGrid and resolves the user's identity."""

    def __init__(self, sg_url: Optional[str] = None) -> None:
        self.sg_url = (sg_url or os.getenv("SHOTGRID_URL") or "").rstrip("/")
        if not self.sg_url:
            raise ValueError("SHOTGRID_URL is required.")
        self._token_url = f"{self.sg_url}/api/v1/auth/access_token"
        self._is_onprem = os.getenv("SG_SITE_TYPE", "cloud").lower() == "onprem"

    # ── Grants ────────────────────────────────────────────────────────── #

    def login_user(self, username: str, password: str) -> SGTokenSet:
        """Verify a username + Legacy Login password with ShotGrid.

        The returned tokens are proof that ShotGrid accepted the credentials.
        Callers should not keep them.

        Raises:
            ShotGridAuthRejected: ShotGrid refused the credentials.
            ShotGridUnavailable: ShotGrid could not be reached or failed.
        """
        return self._call_token_endpoint(
            {"grant_type": "password", "username": username, "password": password}
        )

    # ── Identity ──────────────────────────────────────────────────────── #

    def get_user_info(self, username: str) -> SGUserInfo:
        """Resolve the HumanUser for a username that ShotGrid just accepted.

        People sign in with either their ShotGrid login name or their email
        address depending on the site, so both are tried — login first, since
        it is unique and is what ``sudo_as_login`` later matches on.

        Raises:
            ShotGridUnavailable: Script credentials are missing or the lookup
                failed — a server problem, not the user's.
            ShotGridAuthRejected: The account is not active.
            ValueError: No HumanUser matches.  Never falls back to a placeholder
                identity: a wrong or zero user ID would silently break
                permission enforcement on every later request.
        """
        try:
            sg = self._script_connection(f"Cannot look up ShotGrid user '{username}'")
        except ValueError as exc:
            raise ShotGridUnavailable(str(exc))

        try:
            user = sg.find_one(
                "HumanUser", [["login", "is", username]], _HUMAN_USER_FIELDS
            ) or sg.find_one(
                "HumanUser", [["email", "is", username]], _HUMAN_USER_FIELDS
            )
        except Exception as exc:
            raise ShotGridUnavailable(
                f"Could not look up user '{username}' in ShotGrid: {exc}"
            )

        if not user:
            raise ValueError(
                f"ShotGrid accepted the credentials for '{username}', but no "
                "HumanUser with that login or email was found."
            )
        if user.get("sg_status_list") != ACTIVE_USER_STATUS:
            raise ShotGridAuthRejected(
                f"The ShotGrid account '{username}' is not active. "
                "Contact your ShotGrid administrator."
            )

        return SGUserInfo(
            sg_user_id=int(user["id"]),
            email=(user.get("email") or username).lower().strip(),
            name=user.get("name") or username,
            login=user.get("login") or username,
        )

    def confirm_user_active(self, user_id: int, login: str) -> None:
        """Confirm a signed-in user may still use DNA.

        Called on every session refresh in place of holding a ShotGrid token
        whose refresh would fail once the account is disabled. Uses the script
        account, so no user credential is involved.

        Raises:
            ShotGridAuthRejected: The HumanUser no longer exists, is not active,
                or its login changed (``sudo_as_login`` would no longer match).
            ShotGridUnavailable: ShotGrid could not be queried, or the script
                credentials are not configured. Says nothing about the user.
        """
        try:
            sg = self._script_connection("Cannot confirm ShotGrid account status")
        except ValueError as exc:
            raise ShotGridUnavailable(str(exc))

        try:
            user = sg.find_one(
                "HumanUser", [["id", "is", user_id]], ["login", "sg_status_list"]
            )
        except Exception as exc:
            raise ShotGridUnavailable(
                f"Could not confirm ShotGrid account status: {exc}"
            )

        if not user:
            raise ShotGridAuthRejected("The ShotGrid account no longer exists.")
        if user.get("sg_status_list") != ACTIVE_USER_STATUS:
            raise ShotGridAuthRejected("The ShotGrid account has been deactivated.")
        if (user.get("login") or "").casefold() != (login or "").casefold():
            raise ShotGridAuthRejected("The ShotGrid login for this account changed.")

    # ── Internal ──────────────────────────────────────────────────────── #

    def _script_connection(self, context: str):
        """Return a script-account ShotGrid connection.

        Raises:
            ValueError: Script credentials are not configured.
        """
        sg_script = os.getenv("SHOTGRID_SCRIPT_NAME")
        sg_key = os.getenv("SHOTGRID_API_KEY")
        if not (sg_script and sg_key):
            raise ValueError(
                f"{context}: SHOTGRID_SCRIPT_NAME and SHOTGRID_API_KEY are required "
                "to resolve user identity. Set them in your environment."
            )

        from shotgun_api3 import Shotgun

        return Shotgun(self.sg_url, script_name=sg_script, api_key=sg_key)

    def _call_token_endpoint(self, payload: dict) -> SGTokenSet:
        """POST to ShotGrid's token endpoint and parse the token set.

        Raises:
            ValueError: HTTP error, timeout, or malformed response.  The message
                is written for the person trying to log in.
        """
        try:
            resp = requests.post(
                self._token_url,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=TOKEN_ENDPOINT_TIMEOUT_SEC,
            )
        except requests.ConnectionError:
            raise ShotGridUnavailable(
                f"Cannot reach ShotGrid auth endpoint at {self._token_url}. "
                "Check SHOTGRID_URL and network connectivity."
            )
        except requests.Timeout:
            raise ShotGridUnavailable(
                "ShotGrid auth endpoint timed out after "
                f"{TOKEN_ENDPOINT_TIMEOUT_SEC} seconds."
            )

        if resp.status_code == 401:
            raise ShotGridAuthRejected(
                "ShotGrid authentication failed (HTTP 401). "
                + self._unauthorized_hint(payload.get("grant_type"))
            )

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
                # Error pages from proxies are often HTML, not JSON.
                detail = resp.text[:200]
            message = (
                f"ShotGrid auth endpoint failed (HTTP {resp.status_code}): {detail}"
            )
            # 400/403 are ShotGrid's answer about the credentials; rate
            # limiting and 5xx say nothing about them.
            if resp.status_code in (400, 403):
                raise ShotGridAuthRejected(message)
            raise ShotGridUnavailable(message)

        body = resp.json()
        access_token = body.get("access_token")
        if not access_token:
            raise ShotGridUnavailable(
                f"ShotGrid token response missing 'access_token'. "
                f"Keys received: {list(body.keys())}"
            )

        return SGTokenSet(
            access_token=access_token,
            refresh_token=body.get("refresh_token"),
            token_type=body.get("token_type", "Bearer"),
            expires_in=int(body.get("expires_in", 3600)),
            obtained_at=time.time(),
        )

    def _unauthorized_hint(self, grant_type: Optional[str]) -> str:
        """Explain a 401 in terms of what the user can actually fix."""
        if self._is_onprem:
            return "Verify username and ShotGrid/LDAP password (on-prem site)."
        return (
            "Verify username and Legacy Login password. "
            "Ensure a Personal Access Token (PAT) has been generated "
            "at profile.autodesk.com and bound to the ShotGrid account."
        )


# ── Singleton factory ─────────────────────────────────────────────────────────


_sg_auth_client: Optional[ShotGridAuthClient] = None


def get_sg_auth_client() -> ShotGridAuthClient:
    """Return the application-wide ShotGridAuthClient singleton."""
    global _sg_auth_client
    if _sg_auth_client is None:
        _sg_auth_client = ShotGridAuthClient()
    return _sg_auth_client
