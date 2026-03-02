"""Tests for the Gemini LLM provider."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from dna.llm_providers.gemini_provider import GeminiProvider


class TestGeminiProviderInit:
    """Tests for Gemini provider initialization."""

    def test_init_with_api_key(self):
        """Test initialization with explicit API key."""
        provider = GeminiProvider(api_key="test-key", model="gemini-1.5-pro")
        assert provider.api_key == "test-key"
        assert provider.model == "gemini-1.5-pro"

    def test_init_from_env_var(self):
        """Test initialization from environment variables."""
        with patch.dict(
            "os.environ",
            {"GEMINI_API_KEY": "env-key", "GEMINI_MODEL": "gemini-1.5-flash"},
        ):
            provider = GeminiProvider(api_key="env-key", model="gemini-1.5-flash")
            assert provider.api_key == "env-key"
            assert provider.model == "gemini-1.5-flash"

    def test_init_default_model(self):
        """Test that default model is gemini-2.0-flash."""
        provider = GeminiProvider(api_key="test-key")
        assert provider.model == "gemini-2.0-flash"

    def test_init_raises_without_api_key(self):
        """Test that initialization raises without API key."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="Gemini API key not provided"):
                GeminiProvider()


class TestGeminiProviderTemplateSubstitution:
    """Tests for prompt template substitution."""

    def test_substitute_template_with_spaces(self):
        """Test substitution with spaced placeholders."""
        provider = GeminiProvider(api_key="test-key")
        result = provider._substitute_template(
            prompt="Transcript: {{ transcript }}\nContext: {{ context }}\nNotes: {{ notes }}",
            transcript="Hello world",
            context="Version 1",
            existing_notes="My notes",
        )
        assert result == "Transcript: Hello world\nContext: Version 1\nNotes: My notes"

    def test_substitute_template_without_spaces(self):
        """Test substitution with non-spaced placeholders."""
        provider = GeminiProvider(api_key="test-key")
        result = provider._substitute_template(
            prompt="{{transcript}} {{context}} {{notes}}",
            transcript="test",
            context="ctx",
            existing_notes="notes",
        )
        assert result == "test ctx notes"


class TestGeminiProviderGenerateNote:
    """Tests for the generate_note method."""

    @pytest.mark.asyncio
    async def test_generate_note_calls_api(self):
        """Test that generate_note calls the Gemini API correctly."""
        provider = GeminiProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.text = "Generated note"

        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(provider, "_client", mock_client):
            result = await provider.generate_note(
                prompt="{{ transcript }} {{ context }}",
                transcript="Test transcript",
                context="Test context",
                existing_notes="",
            )

        assert result == "Generated note"
        mock_client.aio.models.generate_content.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_note_handles_empty_content(self):
        """Test that generate_note handles None content."""
        provider = GeminiProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.text = None

        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(provider, "_client", mock_client):
            result = await provider.generate_note(
                prompt="test",
                transcript="",
                context="",
                existing_notes="",
            )

        assert result == ""


class TestGeminiProviderClose:
    """Tests for the close method."""

    @pytest.mark.asyncio
    async def test_close_cleans_up_client(self):
        """Test that close cleans up the client."""
        provider = GeminiProvider(api_key="test-key")

        mock_client = MagicMock()
        provider._client = mock_client

        await provider.close()

        assert provider._client is None

    @pytest.mark.asyncio
    async def test_close_handles_no_client(self):
        """Test that close handles no client gracefully."""
        provider = GeminiProvider(api_key="test-key")
        provider._client = None

        await provider.close()
        assert provider._client is None
