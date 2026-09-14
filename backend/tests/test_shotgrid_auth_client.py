"""Tests for ShotGridAuthClient — the only code that talks to ShotGrid auth.

Every DNA login goes through this client, and most of its surface is error
handling: a studio hits these paths when a password is wrong, a PAT was never
generated, an account was deactivated, or ShotGrid is simply down. The
message each case produces is what an artist ends up reading, so the wording is
asserted here rather than left to chance.

No network access: ``requests`` and ``shotgun_api3`` are mocked throughout.
"""

from __future__ import annotations

import os
import time
from unittest import mock

import pytest
import requests

from dna.auth.shotgrid_auth_client import (
    TOKEN_ENDPOINT_TIMEOUT_SEC,
    SGTokenSet,
    ShotGridAuthClient,
    ShotGridAuthRejected,
    ShotGridUnavailable,
    get_sg_auth_client,
)

SG_URL = "https://test.shotgunstudio.com"
TOKEN_URL = f"{SG_URL}/api/v1/auth/access_token"
SCRIPT_ENV = {"SHOTGRID_SCRIPT_NAME": "test_script", "SHOTGRID_API_KEY": "test_key"}


def _client(**env) -> ShotGridAuthClient:
    with mock.patch.dict(os.environ, env, clear=False):
        return ShotGridAuthClient(sg_url=SG_URL)


def _response(status: int = 200, body: dict | None = None, text: str = "") -> mock.Mock:
    resp = mock.Mock()
    resp.status_code = status
    resp.ok = 200 <= status < 300
    resp.json.return_value = body if body is not None else {}
    resp.text = text
    return resp


def _token_body(**overrides) -> dict:
    body = {
        "access_token": "sg-access-token",
        "refresh_token": "sg-refresh-token",
        "token_type": "Bearer",
        "expires_in": 3600,
    }
    body.update(overrides)
    return body


def _human_user(**overrides) -> dict:
    user = {
        "id": 42,
        "name": "Jane Artist",
        "email": "Jane@Studio.com",
        "login": "jane.artist",
        "sg_status_list": "act",
    }
    user.update(overrides)
    return user


# ═══════════════════════════════════════════════════════════════════════════ #
# Construction                                                                #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestConstruction:

    def test_requires_a_shotgrid_url(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="SHOTGRID_URL is required"):
                ShotGridAuthClient()

    def test_reads_url_from_environment(self):
        with mock.patch.dict(os.environ, {"SHOTGRID_URL": SG_URL + "/"}, clear=False):
            client = ShotGridAuthClient()
        # Trailing slash is stripped so the token URL never doubles up.
        assert client.sg_url == SG_URL
        assert client._token_url == TOKEN_URL

    def test_singleton_factory_returns_same_instance(self):
        import dna.auth.shotgrid_auth_client as module

        module._sg_auth_client = None
        with mock.patch.dict(os.environ, {"SHOTGRID_URL": SG_URL}, clear=False):
            first = get_sg_auth_client()
            second = get_sg_auth_client()
        assert first is second
        module._sg_auth_client = None


# ═══════════════════════════════════════════════════════════════════════════ #
# Grant types                                                                 #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestGrants:
    """Each grant must post the right form body to the v1 token endpoint."""

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_password_grant(self, mock_post):
        mock_post.return_value = _response(body=_token_body())

        tokens = _client().login_user("jane@studio.com", "legacy-password")

        assert tokens.access_token == "sg-access-token"
        assert tokens.refresh_token == "sg-refresh-token"
        assert tokens.expires_in == 3600
        assert mock_post.call_args.args[0] == TOKEN_URL
        assert mock_post.call_args.kwargs["data"] == {
            "grant_type": "password",
            "username": "jane@studio.com",
            "password": "legacy-password",
        }

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_requests_are_bounded_by_the_named_timeout(self, mock_post):
        mock_post.return_value = _response(body=_token_body())

        _client().login_user("u", "p")

        assert mock_post.call_args.kwargs["timeout"] == TOKEN_ENDPOINT_TIMEOUT_SEC

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_expires_in_defaults_when_absent(self, mock_post):
        body = _token_body()
        del body["expires_in"]
        mock_post.return_value = _response(body=body)

        assert _client().login_user("u", "p").expires_in == 3600

    def test_obtained_at_defaults_to_now(self):
        token = SGTokenSet(
            access_token="tok", refresh_token=None, token_type="Bearer", expires_in=60
        )
        assert abs(token.obtained_at - time.time()) < 5


# ═══════════════════════════════════════════════════════════════════════════ #
# Error handling — what the user actually reads                               #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestTokenEndpointErrors:

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_connection_error_names_the_url(self, mock_post):
        mock_post.side_effect = requests.ConnectionError()

        with pytest.raises(ValueError, match="Cannot reach ShotGrid auth endpoint"):
            _client().login_user("u", "p")

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_timeout_is_reported_as_such(self, mock_post):
        mock_post.side_effect = requests.Timeout()

        with pytest.raises(ValueError, match="timed out"):
            _client().login_user("u", "p")

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_cloud_401_mentions_the_pat_requirement(self, mock_post):
        """On cloud sites a missing PAT is the most common cause of a 401."""
        mock_post.return_value = _response(status=401)

        with pytest.raises(ValueError, match="Personal Access Token"):
            _client(SG_SITE_TYPE="cloud").login_user("u", "p")

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_onprem_401_does_not_mention_a_pat(self, mock_post):
        """On-prem sites do not use PATs; suggesting one would misdirect."""
        mock_post.return_value = _response(status=401)

        with pytest.raises(ValueError) as excinfo:
            _client(SG_SITE_TYPE="onprem").login_user("u", "p")

        assert "Personal Access Token" not in str(excinfo.value)
        assert "on-prem" in str(excinfo.value)

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_error_detail_is_surfaced_from_the_body(self, mock_post):
        mock_post.return_value = _response(
            status=500, body={"errors": [{"detail": "Database is on fire"}]}
        )

        with pytest.raises(ValueError, match="Database is on fire"):
            _client().login_user("u", "p")

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_non_list_error_body_is_summarised(self, mock_post):
        mock_post.return_value = _response(status=503, body={"message": "down"})

        with pytest.raises(ValueError, match="HTTP 503"):
            _client().login_user("u", "p")

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_unparseable_error_body_falls_back_to_text(self, mock_post):
        resp = _response(status=502, text="<html>Bad Gateway</html>")
        resp.json.side_effect = ValueError("not json")
        mock_post.return_value = resp

        with pytest.raises(ValueError, match="Bad Gateway"):
            _client().login_user("u", "p")

    @mock.patch("dna.auth.shotgrid_auth_client.requests.post")
    def test_missing_access_token_is_rejected(self, mock_post):
        """A 200 without a token must not produce a half-built session."""
        mock_post.return_value = _response(body={"token_type": "Bearer"})

        with pytest.raises(ValueError, match="missing 'access_token'"):
            _client().login_user("u", "p")


# ═══════════════════════════════════════════════════════════════════════════ #
# Identity resolution                                                         #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestGetUserInfo:
    """Resolve the HumanUser behind a username ShotGrid has just accepted."""

    @mock.patch("shotgun_api3.Shotgun")
    def test_lookup_by_login_name(self, mock_shotgun):
        """The login name is what later scopes every request via sudo_as_login."""
        mock_shotgun.return_value.find_one.return_value = _human_user()

        with mock.patch.dict(os.environ, SCRIPT_ENV, clear=False):
            info = _client().get_user_info("jane.artist")

        assert info.sg_user_id == 42
        assert info.login == "jane.artist"
        # Email is normalised so later comparisons are not casing-dependent.
        assert info.email == "jane@studio.com"
        # Login is unique and is what sudo_as_login matches, so it is tried first.
        first_filter = mock_shotgun.return_value.find_one.call_args_list[0].args[1]
        assert first_filter == [["login", "is", "jane.artist"]]

    @mock.patch("shotgun_api3.Shotgun")
    def test_falls_back_to_email_when_no_login_matches(self, mock_shotgun):
        """Cloud users typically sign in with their email address."""
        mock_shotgun.return_value.find_one.side_effect = [None, _human_user()]

        with mock.patch.dict(os.environ, SCRIPT_ENV, clear=False):
            info = _client().get_user_info("jane@studio.com")

        calls = mock_shotgun.return_value.find_one.call_args_list
        assert [c.args[1] for c in calls] == [
            [["login", "is", "jane@studio.com"]],
            [["email", "is", "jane@studio.com"]],
        ]
        # The *resolved* login is returned, not the email that was typed.
        assert info.login == "jane.artist"

    @mock.patch("shotgun_api3.Shotgun")
    def test_no_matching_user_says_so(self, mock_shotgun):
        """Must not blame script credentials when they are configured correctly."""
        mock_shotgun.return_value.find_one.return_value = None

        with mock.patch.dict(os.environ, SCRIPT_ENV, clear=False):
            with pytest.raises(ValueError) as excinfo:
                _client().get_user_info("ghost@studio.com")

        assert "no HumanUser" in str(excinfo.value)
        assert "SHOTGRID_SCRIPT_NAME" not in str(excinfo.value)

    @mock.patch("shotgun_api3.Shotgun")
    def test_missing_fields_fall_back_to_the_submitted_username(self, mock_shotgun):
        mock_shotgun.return_value.find_one.return_value = {
            "id": 7,
            "sg_status_list": "act",
        }

        with mock.patch.dict(os.environ, SCRIPT_ENV, clear=False):
            info = _client().get_user_info("jdoe")

        assert (info.sg_user_id, info.login, info.name, info.email) == (
            7,
            "jdoe",
            "jdoe",
            "jdoe",
        )

    @mock.patch("shotgun_api3.Shotgun")
    def test_lookup_failure_is_wrapped_with_context(self, mock_shotgun):
        mock_shotgun.return_value.find_one.side_effect = Exception("connection reset")

        with mock.patch.dict(os.environ, SCRIPT_ENV, clear=False):
            with pytest.raises(ValueError, match="Could not look up user"):
                _client().get_user_info("jane@studio.com")

    def test_missing_script_credentials_fails_loudly(self):
        """Never fall back to a placeholder id — that silently breaks permissions.

        It is a server misconfiguration, so it is reported as unavailable rather
        than as a problem with the user's credentials.
        """
        env = {"SHOTGRID_SCRIPT_NAME": "", "SHOTGRID_API_KEY": ""}
        with mock.patch.dict(os.environ, env, clear=False):
            with pytest.raises(ShotGridUnavailable, match="SHOTGRID_SCRIPT_NAME"):
                _client().get_user_info("jane@studio.com")

    @pytest.mark.parametrize("status", ["dis", None])
    def test_inactive_account_cannot_sign_in(self, status):
        with mock.patch("shotgun_api3.Shotgun") as mock_shotgun:
            mock_shotgun.return_value.find_one.return_value = _human_user(
                sg_status_list=status
            )
            with mock.patch.dict(os.environ, SCRIPT_ENV, clear=False):
                with pytest.raises(ShotGridAuthRejected, match="not active"):
                    _client().get_user_info("jane.artist")


# ═══════════════════════════════════════════════════════════════════════════ #
# Account status re-check                                                     #
# ═══════════════════════════════════════════════════════════════════════════ #


class TestConfirmUserActive:
    """Replaces holding a ShotGrid token: the script account re-checks the user."""

    def _confirm(self, user, env=SCRIPT_ENV, login="jane.artist"):
        with mock.patch("shotgun_api3.Shotgun") as mock_shotgun:
            if isinstance(user, Exception):
                mock_shotgun.return_value.find_one.side_effect = user
            else:
                mock_shotgun.return_value.find_one.return_value = user
            with mock.patch.dict(os.environ, env, clear=False):
                _client().confirm_user_active(42, login)
            return mock_shotgun

    def test_active_user_passes_and_is_looked_up_by_id(self):
        mock_shotgun = self._confirm(_human_user())

        call = mock_shotgun.return_value.find_one.call_args
        assert call.args[:2] == ("HumanUser", [["id", "is", 42]])
        assert "sg_status_list" in call.args[2]

    def test_login_comparison_ignores_case(self):
        self._confirm(_human_user(login="Jane.Artist"))

    @pytest.mark.parametrize(
        "user, message",
        [
            (None, "no longer exists"),
            (_human_user(sg_status_list="dis"), "deactivated"),
            (_human_user(sg_status_list=None), "deactivated"),
            (_human_user(login="someone.else"), "login for this account changed"),
        ],
    )
    def test_refusals_are_definitive(self, user, message):
        with pytest.raises(ShotGridAuthRejected, match=message):
            self._confirm(user)

    def test_lookup_failure_is_an_outage_not_a_refusal(self):
        with pytest.raises(ShotGridUnavailable, match="Could not confirm"):
            self._confirm(Exception("connection reset"))

    def test_missing_script_credentials_is_an_outage_not_a_refusal(self):
        """A server misconfiguration must not log every user out."""
        env = {"SHOTGRID_SCRIPT_NAME": "", "SHOTGRID_API_KEY": ""}
        with pytest.raises(ShotGridUnavailable, match="SHOTGRID_SCRIPT_NAME"):
            self._confirm(_human_user(), env=env)
