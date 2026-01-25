"""LLM Provider Base.

Abstract base class for LLM providers and factory function.
"""

import os
from typing import Optional


class LLMProviderBase:
    """Abstract base class for LLM providers."""

    DEFAULT_PROMPT = """Generate notes on the following conversation, notes that were taken, and context for the version. transcript: {{{{ transcript }}}}, context: {{{{ context }}}}, notes: {{{{ notes }}}}"""

    async def generate_note(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
    ) -> str:
        """Generate a note suggestion from the given inputs.

        Args:
            prompt: The user's prompt template with placeholders.
            transcript: The transcript text for the version.
            context: Version context (entity name, task, status, etc.).
            existing_notes: Any notes the user has already written.

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
