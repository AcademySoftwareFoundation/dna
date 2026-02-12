"""OpenAI LLM Provider.

OpenAI implementation of the LLM provider interface.
"""

import os
from typing import Optional

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TIMEOUT = 30.0


class OpenAIProvider(LLMProviderBase):
    """OpenAI implementation of the LLM provider."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
        self.timeout = timeout or float(
            os.getenv("OPENAI_TIMEOUT", str(DEFAULT_TIMEOUT))
        )

        if not self.api_key:
            raise ValueError(
                "OpenAI API key not provided. Set OPENAI_API_KEY environment variable."
            )

        self._client: Optional[AsyncOpenAI] = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self.api_key, timeout=self.timeout)
        return self._client

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

    async def generate_note(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
        additional_instructions: Optional[str] = None,
    ) -> str:
        """Generate a note suggestion using OpenAI."""
        user_message = self._substitute_template(
            prompt, transcript, context, existing_notes
        )

        if additional_instructions:
            user_message += f"\n\nAdditional Instructions: {additional_instructions}"

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an assistant helping generate professional "
                        "review notes for visual effects and animation work. "
                        "Generate concise, actionable notes based on the "
                        "transcript and context provided."
                    ),
                },
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=1024,
        )

        return response.choices[0].message.content or ""

    async def close(self) -> None:
        """Clean up OpenAI client resources."""
        if self._client is not None:
            await self._client.close()
            self._client = None
