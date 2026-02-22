"""Tests for the OpenAI LLM provider."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from dna.llm_providers.openai_provider import OpenAIProvider


class TestOpenAIProviderInit:
    """Tests for OpenAI provider initialization."""

    def test_init_with_api_key(self):
        """Test initialization with explicit API key."""
        provider = OpenAIProvider(api_key="test-key", model="gpt-4")
        assert provider.api_key == "test-key"
        assert provider.model == "gpt-4"

    def test_init_from_env_var(self):
        """Test initialization from environment variables."""
        with patch.dict(
            "os.environ",
            {"OPENAI_API_KEY": "env-key", "OPENAI_MODEL": "gpt-3.5-turbo"},
        ):
            provider = OpenAIProvider(api_key="env-key", model="gpt-3.5-turbo")
            assert provider.api_key == "env-key"
            assert provider.model == "gpt-3.5-turbo"

    def test_init_default_model(self):
        """Test that default model is gpt-4o-mini."""
        provider = OpenAIProvider(api_key="test-key")
        assert provider.model == "gpt-4o-mini"

    def test_init_raises_without_api_key(self):
        """Test that initialization raises without API key."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="OpenAI API key not provided"):
                OpenAIProvider()


class TestOpenAIProviderTemplateSubstitution:
    """Tests for prompt template substitution."""

    def test_substitute_template_with_spaces(self):
        """Test substitution with spaced placeholders."""
        provider = OpenAIProvider(api_key="test-key")
        result = provider._substitute_template(
            prompt="Transcript: {{ transcript }}\nContext: {{ context }}\nNotes: {{ notes }}",
            transcript="Hello world",
            context="Version 1",
            existing_notes="My notes",
        )
        assert result == "Transcript: Hello world\nContext: Version 1\nNotes: My notes"

    def test_substitute_template_without_spaces(self):
        """Test substitution with non-spaced placeholders."""
        provider = OpenAIProvider(api_key="test-key")
        result = provider._substitute_template(
            prompt="{{transcript}} {{context}} {{notes}}",
            transcript="test",
            context="ctx",
            existing_notes="notes",
        )
        assert result == "test ctx notes"


class TestOpenAIProviderGenerateNote:
    """Tests for the generate_note method."""

    @pytest.mark.asyncio
    async def test_generate_note_calls_api(self):
        """Test that generate_note calls the OpenAI API correctly."""
        provider = OpenAIProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Generated note"

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch.object(provider, "_client", mock_client):
            result = await provider.generate_note(
                prompt="{{ transcript }} {{ context }}",
                transcript="Test transcript",
                context="Test context",
                existing_notes="",
            )

        assert result == "Generated note"
        mock_client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_note_handles_empty_content(self):
        """Test that generate_note handles None content."""
        provider = OpenAIProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = None

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch.object(provider, "_client", mock_client):
            result = await provider.generate_note(
                prompt="test",
                transcript="",
                context="",
                existing_notes="",
            )

        assert result == ""


class TestOpenAIProviderClose:
    """Tests for the close method."""

    @pytest.mark.asyncio
    async def test_close_cleans_up_client(self):
        """Test that close cleans up the client."""
        provider = OpenAIProvider(api_key="test-key")

        mock_client = AsyncMock()
        provider._client = mock_client

        await provider.close()

        mock_client.close.assert_called_once()
        assert provider._client is None

    @pytest.mark.asyncio
    async def test_close_handles_no_client(self):
        """Test that close handles no client gracefully."""
        provider = OpenAIProvider(api_key="test-key")
        provider._client = None

        await provider.close()
        assert provider._client is None
