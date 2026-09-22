"""Tests for the Gemini LLM provider."""

from unittest.mock import patch

import pytest

from dna.llm_providers.gemini_provider import GeminiProvider


class TestGeminiProviderInit:
    """Tests for Gemini provider initialization."""

    def test_init_with_api_key(self):
        """Test initialization with explicit API key."""
        provider = GeminiProvider(api_key="test-key", model="gemini-custom")
        assert provider.api_key == "test-key"
        assert provider.model == "gemini-custom"

    def test_init_from_env_var(self):
        """Test initialization from environment variables."""
        with patch.dict(
            "os.environ",
            {"GEMINI_API_KEY": "env-key", "GEMINI_MODEL": "gemini-env"},
            clear=True,
        ):
            provider = GeminiProvider()
            assert provider.api_key == "env-key"
            assert provider.model == "gemini-env"

    def test_init_default_model(self):
        """Test that default model is Gemini-specific."""
        provider = GeminiProvider(api_key="test-key")
        assert provider.model == "gemini-2.5-flash"

    @patch("dna.llm_providers.gemini_provider.AsyncOpenAI")
    def test_get_provider_client_uses_default_gemini_endpoint(self, mock_async_openai):
        """Gemini provider should target the compatibility endpoint by default."""
        provider = GeminiProvider(api_key="test-key", timeout=45.0)

        provider._get_provider_client()

        mock_async_openai.assert_called_once_with(
            api_key="test-key",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            timeout=45.0,
        )

    @patch("dna.llm_providers.gemini_provider.AsyncOpenAI")
    def test_get_provider_client_uses_env_override_for_url(self, mock_async_openai):
        """Gemini provider should allow overriding the compatibility endpoint."""
        with patch.dict(
            "os.environ",
            {"GEMINI_URL": "https://example.test/custom-openai/"},
            clear=False,
        ):
            provider = GeminiProvider(api_key="test-key", timeout=45.0)
            provider._get_provider_client()

        mock_async_openai.assert_called_once_with(
            api_key="test-key",
            base_url="https://example.test/custom-openai/",
            timeout=45.0,
        )

    def test_get_provider_client_raises_clear_error_without_api_key(self):
        """Missing GEMINI_API_KEY should raise a clear, Gemini-specific error.

        Without this check, AsyncOpenAI falls back to looking for an
        OPENAI_API_KEY env var, producing a confusing error that never
        mentions Gemini or GEMINI_API_KEY.
        """
        with patch.dict("os.environ", {}, clear=True):
            provider = GeminiProvider(api_key=None)

            with pytest.raises(ValueError, match="GEMINI_API_KEY"):
                provider._get_provider_client()
