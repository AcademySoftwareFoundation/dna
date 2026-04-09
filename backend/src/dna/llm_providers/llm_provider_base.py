"""LLM Provider Base.

Abstract base class for LLM providers and factory function.
"""

import os
from typing import Optional


class LLMProviderBase:
    """Abstract base class for LLM providers."""

    ENV_PREFIX = None

    DEFAULT_MODEL = None
    DEFAULT_TIMEOUT = 30.0

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        if self.ENV_PREFIX is None:
            raise NotImplementedError(f"{self.__class__.__name__} is missing an ENV_PREFIX")
        
        api_env = f"{self.ENV_PREFIX}_API_KEY"
        self.api_key = api_key or os.getenv(api_env)
        if not self.api_key:
            raise ValueError(
                f"API key not provided. Set {api_env} environment variable."
            )

        self.model = model or os.getenv(f"{self.ENV_PREFIX}_MODEL", self.DEFAULT_MODEL)
        self.timeout = timeout or float(
            os.getenv(f"{self.ENV_PREFIX}_TIMEOUT", str(self.DEFAULT_TIMEOUT))
        )

    async def generate_note(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
        additional_instructions: Optional[str] = None,
    ) -> str:
        """Generate a note suggestion from the given inputs.

        Args:
            prompt: The user's prompt template with placeholders.
            transcript: The transcript text for the version.
            context: Version context (entity name, task, status, etc.).
            existing_notes: Any notes the user has already written.
            additional_instructions: Optional additional instructions to append.

        Returns:
            The generated note suggestion.
        """
        raise NotImplementedError()

    async def close(self) -> None:
        """Clean up any resources."""
        pass


def get_llm_provider() -> LLMProviderBase:
    """Factory function to get the configured LLM provider."""
    provider_type = os.getenv("LLM_PROVIDER", "openai")

    if provider_type == "openai":
        from dna.llm_providers.openai_provider import OpenAIProvider

        return OpenAIProvider()

    raise ValueError(f"Unknown LLM provider: {provider_type}")
