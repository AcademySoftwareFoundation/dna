"""LLM Provider Base.

Abstract base class for LLM providers and factory function.
"""

import os
from typing import Optional


class LLMProviderBase:
    """Abstract base class for LLM providers."""

    DEFAULT_PROMPT = """Generate notes on the following conversation, notes that were taken, and context for the version. transcript: {{{{ transcript }}}}, context: {{{{ context }}}}, notes: {{{{ notes }}}}"""

    def _substitute_template(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
    ) -> str:
        """Substitute template placeholders in the prompt.

        Supports both spaced ({{ var }}) and non-spaced ({{var}}) placeholders.
        """
        result = prompt
        result = result.replace("{{ transcript }}", transcript)
        result = result.replace("{{transcript}}", transcript)
        result = result.replace("{{ context }}", context)
        result = result.replace("{{context}}", context)
        result = result.replace("{{ notes }}", existing_notes)
        result = result.replace("{{notes}}", existing_notes)
        return result

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

    if provider_type == "gemini":
        from dna.llm_providers.gemini_provider import GeminiProvider

        return GeminiProvider()

    raise ValueError(f"Unknown LLM provider: {provider_type}")
