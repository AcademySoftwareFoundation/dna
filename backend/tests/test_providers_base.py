"""Tests for base provider classes and additional coverage."""

from unittest import mock

import pytest

from dna.llm_providers.llm_provider_base import LLMProviderBase
from dna.prodtrack_providers.prodtrack_provider_base import (
    AUTH_MODE_PASSWORDLESS,
    AuthModeNotImplementedError,
    authenticate_user,
    get_shotgrid_auth_mode,
)
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
)


class TestLLMProviderBase:
    """Tests for the LLMProviderBase class."""

    def test_instantiation(self):
        """Test that LLMProviderBase can be instantiated."""
        provider = LLMProviderBase()
        assert provider is not None

    @pytest.mark.asyncio
    async def test_generate_note_raises_not_implemented(self):
        """Test that generate_note raises NotImplementedError by default."""
        provider = LLMProviderBase()
        with pytest.raises(NotImplementedError):
            await provider.generate_note(
                prompt="test prompt",
                transcript="test transcript",
                context="test context",
                existing_notes="test notes",
            )

    @pytest.mark.asyncio
    async def test_close_does_nothing(self):
        """Test that close method exists and can be called."""
        provider = LLMProviderBase()
        result = await provider.close()
        assert result is None


class TestTranscriptionProviderBase:
    """Tests for the TranscriptionProviderBase class."""

    def test_init_exists(self):
        """Test that TranscriptionProviderBase can be instantiated."""
        provider = TranscriptionProviderBase()
        assert provider is not None


class TestShotgridAuthModes:
    """Tests for auth mode selection helpers."""

    def test_get_shotgrid_auth_mode_defaults_to_passwordless(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            assert get_shotgrid_auth_mode() == AUTH_MODE_PASSWORDLESS

    def test_get_shotgrid_auth_mode_rejects_invalid_mode(self):
        with mock.patch.dict("os.environ", {"SHOTGRID_AUTH_MODE": "invalid-mode"}):
            with pytest.raises(ValueError, match="Invalid SHOTGRID_AUTH_MODE"):
                get_shotgrid_auth_mode()

    def test_authenticate_user_passwordless(self):
        with mock.patch.dict(
            "os.environ",
            {"PRODTRACK_PROVIDER": "shotgrid", "SHOTGRID_AUTH_MODE": "passwordless"},
        ):
            with mock.patch(
                "dna.prodtrack_providers.shotgrid_auth.ShotgridAuthenticationProvider.authenticate_passwordless"
            ) as mock_auth:
                mock_auth.return_value = {"token": None, "email": "test@example.com"}
                result = authenticate_user("test@example.com")

                assert result["email"] == "test@example.com"
                assert result["token"] is None
                assert result["mode"] == "passwordless"
                mock_auth.assert_called_once_with("test@example.com")

    def test_authenticate_user_self_hosted(self):
        with mock.patch.dict(
            "os.environ",
            {"PRODTRACK_PROVIDER": "shotgrid", "SHOTGRID_AUTH_MODE": "self_hosted"},
        ):
            with mock.patch(
                "dna.prodtrack_providers.shotgrid_auth.ShotgridAuthenticationProvider.authenticate"
            ) as mock_auth:
                mock_auth.return_value = {
                    "token": "session-token",
                    "email": "test@example.com",
                }
                result = authenticate_user("testuser", "password")

                assert result["email"] == "test@example.com"
                assert result["token"] == "session-token"
                assert result["mode"] == "self_hosted"
                mock_auth.assert_called_once_with("testuser", "password")

    def test_authenticate_user_sso_not_implemented(self):
        with mock.patch.dict(
            "os.environ",
            {"PRODTRACK_PROVIDER": "shotgrid", "SHOTGRID_AUTH_MODE": "sso"},
        ):
            with pytest.raises(AuthModeNotImplementedError, match="not implemented"):
                authenticate_user("testuser", "password")
