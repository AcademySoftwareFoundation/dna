"""OpenAI LLM Provider.

OpenAI implementation of the LLM provider interface.
"""

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase


class OpenAIProvider(LLMProviderBase):
    """OpenAI implementation of the LLM provider."""

    ENV_PREFIX = "OPENAI"

    DEFAULT_MODEL = "gpt-4o-mini"

    def _get_provider_client(self):
        """Construct an instance of the LLM provider's client."""
        return AsyncOpenAI(api_key=self.api_key, timeout=self.timeout)
