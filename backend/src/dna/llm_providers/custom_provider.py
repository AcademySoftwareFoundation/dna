"""Custom OpenAI Compatible LLM Provider.

Custom OpenAI Compatible implementation of the LLM provider interface.
"""

import os

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase


class CustomProvider(LLMProviderBase):
    """Custom OpenAI Compatible implementation of the LLM provider."""

    LLM_PROVIDER_NAME = "CUSTOM_LLM"

    DEFAULT_MODEL = "gpt-oss-20b"
    DEFAULT_URL = "http://localhost:11434/v1"

    def _get_provider_client(self):
        """Construct an instance of the LLM provider's client."""
        return AsyncOpenAI(
            api_key=self.api_key,
            base_url=os.getenv(f"{self.LLM_PROVIDER_NAME}_URL", self.DEFAULT_URL),
            timeout=self.timeout,
        )
