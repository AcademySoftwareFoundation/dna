"""Custom OpenAI Compatible LLM Provider.

Custom OpenAI Compatible implementation of the LLM provider interface.
"""

import logging
import os
from typing import Any

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase

logger = logging.getLogger(__name__)


class CustomProvider(LLMProviderBase):
    """Custom OpenAI Compatible implementation of the LLM provider."""

    LLM_PROVIDER_NAME = "CUSTOM_LLM"

    DEFAULT_MODEL = "llama3.2:latest"
    DEFAULT_URL = "http://host.docker.internal:11434/v1"

    def _get_provider_client(self):
        """Construct an instance of the LLM provider's client."""
        return AsyncOpenAI(
            # Current openai module version (2.36.0) does not support None or "" for api_key
            api_key=self.api_key or "dna",
            base_url=os.getenv(f"{self.LLM_PROVIDER_NAME}_URL", self.DEFAULT_URL),
            timeout=self.timeout,
        )

    async def get_available_models(self) -> dict[str, Any]:
        """Fetch available models from Custom OpenAI Compatible API."""
        try:
            response = await self.client.models.list()
            model_ids = sorted(m.id for m in response.data)
        except Exception:
            logger.warning("Failed to fetch models from API, using default")
            model_ids = [self.model]

        return {
            "provider": "custom",
            "models": model_ids,
            "default": self.model,
        }
