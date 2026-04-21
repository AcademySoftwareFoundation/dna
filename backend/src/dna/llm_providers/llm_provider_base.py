"""LLM Provider Base.

Abstract base class for LLM providers and factory function.
"""

import os
from typing import Optional

from openai import AsyncOpenAI

from dna.prompts.generate_note_prompt import GENERATE_NOTE_PROMPT


class LLMProviderBase:
    """Abstract base class for LLM providers."""

    LLM_PROVIDER_NAME = None

    DEFAULT_MODEL = None
    DEFAULT_TIMEOUT = 30.0

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        if self.LLM_PROVIDER_NAME is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} is missing an LLM_PROVIDER_NAME "
            )

        api_env = f"{self.LLM_PROVIDER_NAME }_API_KEY"
        self.api_key = api_key or os.getenv(api_env)
        if not self.api_key:
            raise ValueError(
                f"API key not provided. Set {api_env} environment variable."
            )

        self.model = model or os.getenv(
            f"{self.LLM_PROVIDER_NAME }_MODEL", self.DEFAULT_MODEL
        )
        self.timeout = timeout or float(
            os.getenv(f"{self.LLM_PROVIDER_NAME }_TIMEOUT", str(self.DEFAULT_TIMEOUT))
        )

        self._client = None

    @property
    def client(self) -> AsyncOpenAI:
        """The interface to the LLM service."""
        if self._client is None:
            self._client = self._get_provider_client()
        return self._client

    def _get_provider_client(self) -> AsyncOpenAI:
        """Construct an instance of the LLM provider's client."""
        raise NotImplementedError(f"{self.__class__.__name__} isn't configured.")

    def _substitute_template(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
    ) -> str:
        """Substitute template placeholders in the prompt."""
        result = prompt
        result = result.replace("{{ transcript }}", transcript)
        result = result.replace("{{transcript}}", transcript)
        result = result.replace("{{ context }}", context)
        result = result.replace("{{context}}", context)
        result = result.replace("{{ notes }}", existing_notes)
        result = result.replace("{{notes}}", existing_notes)
        return result

    async def close(self) -> None:
        """Clean up client resources."""
        if self._client is not None:
            await self._client.close()
            self._client = None

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
        user_message = self._substitute_template(
            prompt, transcript, context, existing_notes
        )

        if additional_instructions:
            user_message += f"\n\nAdditional Instructions: {additional_instructions}"

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": GENERATE_NOTE_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=1024,
        )

        return response.choices[0].message.content or ""


def get_llm_provider() -> LLMProviderBase:
    """Factory function to get the configured LLM provider."""
    provider_type = os.getenv("LLM_PROVIDER", "openai").lower()

    if provider_type == "gemini":
        from dna.llm_providers.gemini_provider import GeminiProvider

        return GeminiProvider()

    if provider_type == "openai":
        from dna.llm_providers.openai_provider import OpenAIProvider

        return OpenAIProvider()

    raise ValueError(f"Unknown LLM provider: {provider_type}")
