"""Gemini LLM Provider.

Gemini implementation of the LLM provider interface.
"""

import os

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase


class GeminiProvider(LLMProviderBase):
    """Gemini implementation of the LLM provider."""

    LLM_PROVIDER_NAME = "GEMINI"

    DEFAULT_MODEL = "gemini-2.5-flash"
    DEFAULT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

    def _get_provider_client(self):
        """Construct an instance of the LLM provider's client."""
        return AsyncOpenAI(
            api_key=self.api_key,
            base_url=os.getenv(f"{self.LLM_PROVIDER_NAME }_URL", self.DEFAULT_URL),
            timeout=self.timeout,
        )
