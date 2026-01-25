"""Tests for base provider classes and additional coverage."""

from dna.llm_providers.llm_provider_base import LLMProviderBase
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
)


class TestLLMProviderBase:
    """Tests for the LLMProviderBase class."""

    def test_init_stores_model_and_api_key(self):
        """Test that LLMProviderBase stores model and api_key."""
        provider = LLMProviderBase(model="gpt-4", api_key="test-key")
        assert provider.model == "gpt-4"
        assert provider.api_key == "test-key"

    def test_connect_does_nothing(self):
        """Test that connect method exists and can be called."""
        provider = LLMProviderBase(model="gpt-4", api_key="test-key")
        result = provider.connect()
        assert result is None

    def test_generate_notes_returns_empty_string(self):
        """Test that generate_notes returns empty string by default."""
        provider = LLMProviderBase(model="gpt-4", api_key="test-key")
        result = provider.generate_notes("Generate notes for this transcript")
        assert result == ""


class TestTranscriptionProviderBase:
    """Tests for the TranscriptionProviderBase class."""

    def test_init_exists(self):
        """Test that TranscriptionProviderBase can be instantiated."""
        provider = TranscriptionProviderBase()
        assert provider is not None
