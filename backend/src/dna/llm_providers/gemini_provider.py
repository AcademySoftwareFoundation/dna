"""Gemini LLM Provider.

Gemini implementation of the LLM provider interface.
"""

import logging
import os
from typing import Any

from cachetools import TTLCache
from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import MODEL_CACHE_TTL, LLMProviderBase

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProviderBase):
    """Gemini implementation of the LLM provider."""

    LLM_PROVIDER_NAME = "GEMINI"

    DEFAULT_MODEL = "gemini-2.5-flash"
    DEFAULT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._models_cache: TTLCache = TTLCache(maxsize=1, ttl=MODEL_CACHE_TTL)

    def _get_provider_client(self):
        """Construct an instance of the LLM provider's client."""
        return AsyncOpenAI(
            api_key=self.api_key,
            base_url=os.getenv(f"{self.LLM_PROVIDER_NAME }_URL", self.DEFAULT_URL),
            timeout=self.timeout,
        )

    async def get_available_models(self) -> dict[str, Any]:
        """Fetch available models from Gemini API with caching."""
        cache_key = "models"
        if cache_key in self._models_cache:
            return self._models_cache[cache_key]

        try:
            response = await self.client.models.list()
            model_ids = sorted(m.id for m in response.data)
        except Exception:
            logger.warning("Failed to fetch models from Gemini API, using default")
            model_ids = [self.model]

        result = {
            "provider": "gemini",
            "models": model_ids,
            "default": self.model,
        }
        self._models_cache[cache_key] = result
        return result
