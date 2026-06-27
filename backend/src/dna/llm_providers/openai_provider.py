"""OpenAI LLM Provider.

OpenAI implementation of the LLM provider interface.
"""

import logging
from typing import Any

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase

logger = logging.getLogger(__name__)

OPENAI_CHAT_PREFIXES = ("gpt-", "o1", "o3", "o4", "chatgpt-")


class OpenAIProvider(LLMProviderBase):
    """OpenAI implementation of the LLM provider."""

    LLM_PROVIDER_NAME = "OPENAI"

    DEFAULT_MODEL = "gpt-4o-mini"

    def _get_provider_client(self):
        """Construct an instance of the LLM provider's client."""
        return AsyncOpenAI(api_key=self.api_key, timeout=self.timeout)

    async def get_available_models(self) -> dict[str, Any]:
        """Fetch available chat-completion models from OpenAI API."""
        try:
            response = await self.client.models.list()
            model_ids = sorted(
                m.id
                for m in response.data
                if m.id.startswith(OPENAI_CHAT_PREFIXES)
            )
        except Exception:
            logger.warning("Failed to fetch models from OpenAI API, using default")
            model_ids = [self.model]

        return {
            "provider": "openai",
            "models": model_ids,
            "default": self.model,
        }
