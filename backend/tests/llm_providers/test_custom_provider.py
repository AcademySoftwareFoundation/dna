"""Tests for the Custom LLM provider."""

from unittest.mock import patch

from dna.llm_providers.custom_provider import CustomProvider


class TestCustomProviderInit:
    """Tests for Custom provider initialization."""

    def test_init_with_api_key(self):
        """Test initialization with explicit API key."""
        provider = CustomProvider(api_key="test-key", model="custom-model")
        assert provider.api_key == "test-key"
        assert provider.model == "custom-model"

    def test_init_from_env_var(self):
        """Test initialization from environment variables."""
        with patch.dict(
            "os.environ",
            {"CUSTOM_LLM_API_KEY": "env-key", "CUSTOM_LLM_MODEL": "custom-env"},
            clear=True,
        ):
            provider = CustomProvider()
            assert provider.api_key == "env-key"
            assert provider.model == "custom-env"

    def test_init_default_model(self):
        """Test that default model is llama3.2:latest."""
        with patch.dict("os.environ", {}, clear=True):
            provider = CustomProvider(api_key="test-key")
            assert provider.model == "llama3.2:latest"

    # ── URL tests ──────────────────────────────────────────────────────

    @patch("dna.llm_providers.custom_provider.AsyncOpenAI")
    def test_get_provider_client_uses_default_url(self, mock_async_openai):
        """Custom provider should target the default Ollama endpoint by default."""
        with patch.dict("os.environ", {}, clear=True):
            provider = CustomProvider(api_key="test-key", timeout=45.0)
            provider._get_provider_client()

        mock_async_openai.assert_called_once_with(
            api_key="test-key",
            base_url="http://host.docker.internal:11434/v1",
            timeout=45.0,
        )

    @patch("dna.llm_providers.custom_provider.AsyncOpenAI")
    def test_get_provider_client_uses_env_override_for_url(self, mock_async_openai):
        """Custom provider should allow overriding the URL via env var."""
        with patch.dict(
            "os.environ",
            {"CUSTOM_LLM_URL": "https://example.test/v1/"},
            clear=False,
        ):
            provider = CustomProvider(api_key="test-key", timeout=45.0)
            provider._get_provider_client()

        mock_async_openai.assert_called_once_with(
            api_key="test-key",
            base_url="https://example.test/v1/",
            timeout=45.0,
        )
