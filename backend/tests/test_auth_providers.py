"""Tests for the authentication providers and their factory."""

from unittest import mock

import pytest

from dna.auth.errors import AuthenticationError
from dna.auth.identity import CurrentUser
from dna.auth_providers.auth_provider_base import get_auth_provider
from dna.auth_providers.mock_auth_provider import MockAuthProvider
from dna.auth_providers.shotgrid_auth_provider import ShotgridAuthProvider
from dna.models.entity import User


class TestGetAuthProvider:
    def test_mock(self, monkeypatch):
        monkeypatch.setenv("AUTH_PROVIDER", "mock")

        assert isinstance(get_auth_provider(), MockAuthProvider)

    def test_shotgrid(self, monkeypatch):
        monkeypatch.setenv("AUTH_PROVIDER", "ShotGrid")
        with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun"):
            assert isinstance(get_auth_provider(), ShotgridAuthProvider)

    @pytest.mark.parametrize("value", ["", "none", "google"])
    def test_unknown_or_retired_provider_raises(self, monkeypatch, value):
        monkeypatch.setenv("AUTH_PROVIDER", value)

        with pytest.raises(ValueError, match="Unknown auth provider"):
            get_auth_provider()

    def test_independent_of_prodtrack_provider(self, monkeypatch):
        monkeypatch.setenv("AUTH_PROVIDER", "mock")
        monkeypatch.setenv("PRODTRACK_PROVIDER", "shotgrid")

        assert isinstance(get_auth_provider(), MockAuthProvider)


class TestMockAuthProvider:
    def test_email_username_is_used_as_email(self):
        user = MockAuthProvider().authenticate("jdoe@example.com", "anything")

        assert user == CurrentUser(
            sub="jdoe@example.com", email="jdoe@example.com", name="jdoe@example.com"
        )

    def test_plain_username_gets_localhost_email(self):
        user = MockAuthProvider().authenticate(" jdoe ", "")

        assert user == CurrentUser(sub="jdoe", email="jdoe@localhost", name="jdoe")

    def test_blank_username_rejected(self):
        with pytest.raises(AuthenticationError):
            MockAuthProvider().authenticate("   ", "pw")


class TestShotgridAuthProvider:
    @pytest.fixture
    def mock_shotgun(self):
        with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun") as mock_sg:
            yield mock_sg

    @pytest.fixture
    def sg_provider(self):
        provider = mock.MagicMock()
        provider.sg.authenticate_human_user.return_value = {"id": 42, "login": "jdoe"}
        provider.get_user_by_id.return_value = User(
            id="42", name="Jane Doe", email="jdoe@example.com", login="jdoe"
        )
        return provider

    def test_uses_auth_shotgrid_settings(self, monkeypatch, mock_shotgun):
        monkeypatch.setenv("SHOTGRID_URL", "https://tracker.example.com")
        monkeypatch.setenv("SHOTGRID_SCRIPT_NAME", "tracker_script")
        monkeypatch.setenv("SHOTGRID_API_KEY", "tracker_key")
        monkeypatch.setenv("AUTH_SHOTGRID_URL", "https://auth.example.com")
        monkeypatch.setenv("AUTH_SHOTGRID_SCRIPT_NAME", "auth_script")
        monkeypatch.setenv("AUTH_SHOTGRID_API_KEY", "auth_key")

        ShotgridAuthProvider()

        mock_shotgun.assert_called_once_with(
            "https://auth.example.com", "auth_script", "auth_key"
        )

    def test_falls_back_to_shotgrid_settings(self, monkeypatch, mock_shotgun):
        monkeypatch.setenv("SHOTGRID_URL", "https://tracker.example.com")
        monkeypatch.setenv("SHOTGRID_SCRIPT_NAME", "tracker_script")
        monkeypatch.setenv("SHOTGRID_API_KEY", "tracker_key")
        for key in (
            "AUTH_SHOTGRID_URL",
            "AUTH_SHOTGRID_SCRIPT_NAME",
            "AUTH_SHOTGRID_API_KEY",
        ):
            monkeypatch.delenv(key, raising=False)

        ShotgridAuthProvider()

        mock_shotgun.assert_called_once_with(
            "https://tracker.example.com",
            "tracker_script",
            "tracker_key",
        )

    def test_valid_credentials_return_identity(self, sg_provider):
        user = ShotgridAuthProvider(sg_provider).authenticate("jdoe", "secret")

        sg_provider.sg.authenticate_human_user.assert_called_once_with("jdoe", "secret")
        sg_provider.get_user_by_id.assert_called_once_with("42")
        assert user == CurrentUser(
            sub="jdoe", email="jdoe@example.com", name="Jane Doe"
        )

    def test_rejected_credentials_raise(self, sg_provider):
        sg_provider.sg.authenticate_human_user.return_value = None

        with pytest.raises(AuthenticationError, match="Invalid username or password"):
            ShotgridAuthProvider(sg_provider).authenticate("jdoe", "wrong")

    @pytest.mark.parametrize("username,password", [("", "pw"), ("jdoe", "")])
    def test_missing_credentials_raise_without_calling_shotgrid(
        self, sg_provider, username, password
    ):
        with pytest.raises(AuthenticationError, match="required"):
            ShotgridAuthProvider(sg_provider).authenticate(username, password)

        sg_provider.sg.authenticate_human_user.assert_not_called()

    def test_user_without_email_raises(self, sg_provider):
        sg_provider.get_user_by_id.return_value = User(
            id="42", name="Jane Doe", email=None, login="jdoe"
        )

        with pytest.raises(AuthenticationError, match="no email"):
            ShotgridAuthProvider(sg_provider).authenticate("jdoe", "secret")
