"""Gemini LLM Provider.

Google Gemini implementation of the LLM provider interface.
"""

import os
from typing import Optional

from google import genai
from google.genai import types

from dna.llm_providers.llm_provider_base import LLMProviderBase

DEFAULT_MODEL = "gemini-2.0-flash"


class GeminiProvider(LLMProviderBase):
    """Google Gemini implementation of the LLM provider."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.model = model or os.getenv("GEMINI_MODEL", DEFAULT_MODEL)

        if not self.api_key:
            raise ValueError(
                "Gemini API key not provided. Set GEMINI_API_KEY environment variable."
            )

        self._client: Optional[genai.Client] = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    async def generate_note(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
        additional_instructions: Optional[str] = None,
    ) -> str:
        """Generate a note suggestion using Google Gemini."""
        user_message = self._substitute_template(
            prompt, transcript, context, existing_notes
        )

        if additional_instructions:
            user_message += f"\n\nAdditional Instructions: {additional_instructions}"

        system_instruction = (
            "You are an assistant helping generate professional "
            "review notes for visual effects and animation work. "
            "Generate concise, actionable notes based on the "
            "transcript and context provided."
        )

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
                max_output_tokens=1024,
            ),
        )

        return response.text or ""

    async def close(self) -> None:
        """Clean up Gemini client resources."""
        # The google-genai client doesn't require explicit cleanup
        self._client = None
