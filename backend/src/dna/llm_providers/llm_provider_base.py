"""LLM Provider Base.

Abstract base class for LLM providers and factory function.
"""

import json
import logging
import os
from typing import Any, Awaitable, Callable, Optional, TypeVar

import instructor
from openai import AsyncOpenAI
from pydantic import BaseModel

from dna.prompts.generate_note_prompt import GENERATE_NOTE_PROMPT

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

DEFAULT_MAX_TOOL_RESULT_CHARS = 50_000


def _truncate_tool_result(content: str, max_chars: int) -> str:
    if len(content) <= max_chars:
        return content
    suffix = "\n...[truncated]"
    return content[: max_chars - len(suffix)] + suffix


def _safe_parse_tool_arguments(
    raw: str | None,
) -> tuple[dict[str, Any] | None, str | None]:
    text = (raw or "").strip() or "{}"
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        err = json.dumps(
            {
                "error": "Invalid JSON in tool arguments.",
                "detail": str(exc),
            }
        )
        return None, err
    if not isinstance(parsed, dict):
        return None, json.dumps({"error": "Tool arguments must be a JSON object."})
    return parsed, None


def _assistant_message_with_tool_calls(
    msg: Any, tool_calls: list[Any]
) -> dict[str, Any]:
    return {
        "role": "assistant",
        "content": msg.content,
        "tool_calls": [
            {
                "id": tc.id,
                "type": getattr(tc, "type", "function") or "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments or "{}",
                },
            }
            for tc in tool_calls
        ],
    }


async def _append_tool_use_round(
    messages: list[dict[str, Any]],
    msg: Any,
    tool_calls: list[Any],
    tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
    max_tool_result_chars: int,
) -> None:
    messages.append(_assistant_message_with_tool_calls(msg, tool_calls))
    for tc in tool_calls:
        args, parse_error = _safe_parse_tool_arguments(tc.function.arguments)
        if parse_error is not None:
            result = parse_error
        else:
            assert args is not None
            result = await tool_executor(tc.function.name, args)
        result = _truncate_tool_result(result, max_tool_result_chars)
        messages.append(
            {
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            }
        )


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

    async def generate_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict[str, Any]],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
        max_iterations: int = 5,
        temperature: float = 0.2,
        max_tool_result_chars: int = DEFAULT_MAX_TOOL_RESULT_CHARS,
    ) -> str:
        """Run an agentic loop: LLM may call tools until it returns final text."""
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        last_text = ""
        for _ in range(max_iterations):
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=temperature,
                max_tokens=2048,
            )
            choice = response.choices[0]
            msg = choice.message
            last_text = msg.content or ""
            tool_calls = getattr(msg, "tool_calls", None) or []
            if tool_calls:
                await _append_tool_use_round(
                    messages,
                    msg,
                    tool_calls,
                    tool_executor,
                    max_tool_result_chars,
                )
            else:
                return last_text
        return last_text

    async def generate_structured_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict[str, Any]],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
        response_model: type[T],
        max_iterations: int = 5,
        temperature: float = 0.2,
        max_tool_result_chars: int = DEFAULT_MAX_TOOL_RESULT_CHARS,
    ) -> T:
        """Tool-use phase then instructor-validated structured extraction."""
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        hit_limit_with_tools = False
        for i in range(max_iterations):
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=temperature,
                max_tokens=2048,
            )
            choice = response.choices[0]
            msg = choice.message
            tool_calls = getattr(msg, "tool_calls", None) or []
            if tool_calls:
                await _append_tool_use_round(
                    messages,
                    msg,
                    tool_calls,
                    tool_executor,
                    max_tool_result_chars,
                )
                if i == max_iterations - 1:
                    hit_limit_with_tools = True
            else:
                messages.append(
                    {"role": "assistant", "content": msg.content or ""},
                )
                hit_limit_with_tools = False
                break

        if hit_limit_with_tools:
            logger.warning(
                "Tool-use loop reached max_iterations=%s with pending tool rounds; "
                "requesting a final assistant message with tool_choice=none before "
                "structured extraction.",
                max_iterations,
            )
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="none",
                temperature=temperature,
                max_tokens=2048,
            )
            final_msg = response.choices[0].message
            messages.append(
                {"role": "assistant", "content": final_msg.content or ""},
            )

        extraction_messages = list(messages)
        extraction_messages.append(
            {
                "role": "user",
                "content": (
                    "Provide your final quality-check result for this draft and check. "
                    "Fill every required field in the structured response schema."
                ),
            }
        )
        instructor_client = instructor.from_openai(
            self.client,
            mode=instructor.Mode.JSON,
        )
        return await instructor_client.chat.completions.create(
            model=self.model,
            messages=extraction_messages,
            response_model=response_model,
            temperature=temperature,
            max_tokens=2048,
        )


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
