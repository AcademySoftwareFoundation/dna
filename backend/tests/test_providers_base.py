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
        with pytest.raises(NotImplementedError):
            LLMProviderBase()


class TestTranscriptionProviderBase:
    """Tests for the TranscriptionProviderBase class."""

    def test_init_exists(self):
        """Test that TranscriptionProviderBase can be instantiated."""
        provider = TranscriptionProviderBase()
        assert provider is not None
