"""Tests for base provider classes and additional coverage."""

import pytest

from dna.llm_providers.llm_provider_base import LLMProviderBase
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
