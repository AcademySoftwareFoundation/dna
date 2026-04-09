"""OpenAI LLM Provider.

OpenAI implementation of the LLM provider interface.
"""

import os
from typing import Optional

from openai import AsyncOpenAI

from dna.llm_providers.llm_provider_base import LLMProviderBase
from dna.prompts.generate_note_prompt import GENERATE_NOTE_PROMPT


class OpenAIProvider(LLMProviderBase):
    """OpenAI implementation of the LLM provider."""

    ENV_PREFIX = "OPENAI"

    DEFAULT_MODEL = "gpt-4o-mini"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        super().__init__(api_key=api_key, model=model, timeout=timeout)

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
                {"role": "system", "content": GENERATE_NOTE_PROMPT},
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
