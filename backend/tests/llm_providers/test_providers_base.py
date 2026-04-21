"""Tests for provider base classes and LLM provider factory behavior."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from dna.llm_providers.gemini_provider import GeminiProvider
from dna.llm_providers.llm_provider_base import LLMProviderBase, get_llm_provider
from dna.llm_providers.openai_provider import OpenAIProvider
from dna.prompts.generate_note_prompt import GENERATE_NOTE_PROMPT
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
)


class MissingPrefixProvider(LLMProviderBase):
    """Provider with no LLM_PROVIDER_NAME  for validation tests."""


class StubProvider(LLMProviderBase):
    """Concrete test provider for base-class behavior."""

    LLM_PROVIDER_NAME = "STUB"
    DEFAULT_MODEL = "stub-model"

    def _get_provider_client(self):
        return AsyncMock()


class TestLLMProviderBase:
    """Tests for the LLMProviderBase class."""

    def test_instantiation_requires_llm_provider_name(self):
        """Base subclasses must define an environment prefix."""
        with pytest.raises(NotImplementedError, match="missing an LLM_PROVIDER_NAME "):
            MissingPrefixProvider(api_key="test-key")

    def test_init_reads_configuration_from_environment(self):
        """Provider configuration should load from matching env vars."""
        with patch.dict(
            "os.environ",
            {
                "STUB_API_KEY": "env-key",
                "STUB_MODEL": "env-model",
                "STUB_TIMEOUT": "12.5",
            },
            clear=True,
        ):
            provider = StubProvider()

        assert provider.api_key == "env-key"
        assert provider.model == "env-model"
        assert provider.timeout == 12.5

    def test_init_raises_without_api_key(self):
        """Providers should fail fast when no API key is configured."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="API key not provided"):
                StubProvider()

    def test_client_property_caches_provider_client(self):
        """The shared client property should lazily cache the client."""
        provider = StubProvider(api_key="test-key")

        first_client = provider.client
        second_client = provider.client

        assert first_client is second_client

    def test_substitute_template_replaces_supported_placeholders(self):
        """Prompt template substitution should support both spacing styles."""
        provider = StubProvider(api_key="test-key")

        result = provider._substitute_template(
            prompt=(
                "Transcript: {{ transcript }} / {{transcript}}\n"
                "Context: {{ context }} / {{context}}\n"
                "Notes: {{ notes }} / {{notes}}"
            ),
            transcript="hello",
            context="ctx",
            existing_notes="notes",
        )

        assert result == (
            "Transcript: hello / hello\n" "Context: ctx / ctx\n" "Notes: notes / notes"
        )

    @pytest.mark.asyncio
    async def test_generate_note_appends_additional_instructions(self):
        """Shared note generation should pass formatted messages to the client."""
        provider = StubProvider(api_key="test-key", model="stub-model")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Generated note"

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        result = await provider.generate_note(
            prompt="{{ transcript }} -- {{ context }} -- {{ notes }}",
            transcript="Transcript",
            context="Context",
            existing_notes="Notes",
            additional_instructions="Be concise",
        )

        assert result == "Generated note"
        mock_client.chat.completions.create.assert_called_once_with(
            model="stub-model",
            messages=[
                {
                    "role": "system",
                    "content": GENERATE_NOTE_PROMPT,
                },
                {
                    "role": "user",
                    "content": "Transcript -- Context -- Notes\n\nAdditional Instructions: Be concise",
                },
            ],
            temperature=0.7,
            max_tokens=1024,
        )

    @pytest.mark.asyncio
    async def test_close_cleans_up_existing_client(self):
        """Shared close implementation should close and clear the client."""
        provider = StubProvider(api_key="test-key")
        mock_client = AsyncMock()
        provider._client = mock_client

        await provider.close()

        mock_client.close.assert_called_once()
        assert provider._client is None


class TestGetLLMProvider:
    """Tests for the LLM provider factory."""

    def test_returns_openai_provider_by_default(self):
        """The factory should default to OpenAI when unset."""
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}, clear=True):
            provider = get_llm_provider()

        assert isinstance(provider, OpenAIProvider)

    def test_returns_gemini_provider_when_configured(self):
        """The factory should return Gemini when configured."""
        with patch.dict(
            "os.environ",
            {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"},
            clear=True,
        ):
            provider = get_llm_provider()

        assert isinstance(provider, GeminiProvider)

    def test_raises_for_unknown_provider_type(self):
        """The factory should reject unsupported provider values."""
        with patch.dict("os.environ", {"LLM_PROVIDER": "unknown"}, clear=True):
            with pytest.raises(ValueError, match="Unknown LLM provider: unknown"):
                get_llm_provider()


class TestTranscriptionProviderBase:
    """Tests for the TranscriptionProviderBase class."""

    def test_init_exists(self):
        """Test that TranscriptionProviderBase can be instantiated."""
        provider = TranscriptionProviderBase()
        assert provider is not None
