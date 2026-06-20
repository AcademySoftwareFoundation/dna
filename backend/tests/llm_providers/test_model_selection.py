"""Tests for model selection feature: get_available_models and model param in generate_note."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.llm_providers.gemini_provider import GeminiProvider
from dna.llm_providers.openai_provider import OpenAIProvider


class TestOpenAIGetAvailableModels:
    """Tests for OpenAIProvider.get_available_models."""

    @pytest.mark.asyncio
    async def test_returns_models_from_api(self):
        """Should return filtered model list from OpenAI API."""
        provider = OpenAIProvider(api_key="test-key")

        mock_model_gpt = MagicMock()
        mock_model_gpt.id = "gpt-4o"
        mock_model_other = MagicMock()
        mock_model_other.id = "dall-e-3"
        mock_model_o1 = MagicMock()
        mock_model_o1.id = "o3-mini"

        mock_response = MagicMock()
        mock_response.data = [mock_model_gpt, mock_model_other, mock_model_o1]

        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        result = await provider.get_available_models()

        assert result["provider"] == "openai"
        assert "gpt-4o" in result["models"]
        assert "o3-mini" in result["models"]
        assert "dall-e-3" not in result["models"]
        assert result["default"] == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_caches_result(self):
        """Should cache the result and not call API again."""
        provider = OpenAIProvider(api_key="test-key")

        mock_model = MagicMock()
        mock_model.id = "gpt-4o"
        mock_response = MagicMock()
        mock_response.data = [mock_model]

        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        await provider.get_available_models()
        await provider.get_available_models()

        assert mock_client.models.list.call_count == 1

    @pytest.mark.asyncio
    async def test_falls_back_on_api_error(self):
        """Should return default model when API call fails."""
        provider = OpenAIProvider(api_key="test-key")

        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(side_effect=Exception("API error"))
        provider._client = mock_client

        result = await provider.get_available_models()

        assert result["provider"] == "openai"
        assert result["models"] == ["gpt-4o-mini"]
        assert result["default"] == "gpt-4o-mini"


class TestGeminiGetAvailableModels:
    """Tests for GeminiProvider.get_available_models."""

    @pytest.mark.asyncio
    async def test_returns_models_from_api(self):
        """Should return model list from Gemini API."""
        provider = GeminiProvider(api_key="test-key")

        mock_model_1 = MagicMock()
        mock_model_1.id = "gemini-2.5-flash"
        mock_model_2 = MagicMock()
        mock_model_2.id = "gemini-2.5-pro"

        mock_response = MagicMock()
        mock_response.data = [mock_model_2, mock_model_1]

        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        result = await provider.get_available_models()

        assert result["provider"] == "gemini"
        assert "gemini-2.5-flash" in result["models"]
        assert "gemini-2.5-pro" in result["models"]
        assert result["default"] == "gemini-2.5-flash"

    @pytest.mark.asyncio
    async def test_caches_result(self):
        """Should cache the result and not call API again."""
        provider = GeminiProvider(api_key="test-key")

        mock_model = MagicMock()
        mock_model.id = "gemini-2.5-flash"
        mock_response = MagicMock()
        mock_response.data = [mock_model]

        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        await provider.get_available_models()
        await provider.get_available_models()

        assert mock_client.models.list.call_count == 1

    @pytest.mark.asyncio
    async def test_falls_back_on_api_error(self):
        """Should return default model when API call fails."""
        provider = GeminiProvider(api_key="test-key")

        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(side_effect=Exception("API error"))
        provider._client = mock_client

        result = await provider.get_available_models()

        assert result["provider"] == "gemini"
        assert result["models"] == ["gemini-2.5-flash"]
        assert result["default"] == "gemini-2.5-flash"


class TestGenerateNoteModelParam:
    """Tests for the model parameter in generate_note."""

    @pytest.mark.asyncio
    async def test_uses_override_model_when_provided(self):
        """generate_note should use the provided model override."""
        provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Note"

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        await provider.generate_note(
            prompt="{{ transcript }}",
            transcript="Test",
            context="",
            existing_notes="",
            model="gpt-4o",
        )

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o"

    @pytest.mark.asyncio
    async def test_uses_default_model_when_none(self):
        """generate_note should use self.model when model param is None."""
        provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Note"

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        await provider.generate_note(
            prompt="{{ transcript }}",
            transcript="Test",
            context="",
            existing_notes="",
            model=None,
        )

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"
