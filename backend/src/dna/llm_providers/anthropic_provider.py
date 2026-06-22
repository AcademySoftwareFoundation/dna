"""Anthropic (Claude) LLM Provider.

Native implementation on the official ``anthropic`` SDK (Messages API), rather
than the OpenAI-compatibility shim. The base class is built around the OpenAI
SDK, so this provider reuses the base only for credential/model/timeout
resolution and overrides every request path with Claude-native calls.

Key differences from the OpenAI providers:

* Requests go through ``client.messages.create`` with a top-level ``system``
  prompt and Anthropic content blocks.
* ``temperature`` is intentionally not forwarded — the current Claude models
  (``claude-opus-4-8``/``-4-7``, ``claude-fable-5``) reject it with a 400.
* Tool definitions in OpenAI ``{"type": "function", ...}`` shape are converted
  to Anthropic ``{"name", "description", "input_schema"}`` tools.
* Structured extraction uses ``instructor.from_anthropic`` in TOOLS mode (no
  assistant prefill, which the current models also reject).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Awaitable, Callable, Optional, TypeVar

import instructor
from anthropic import AsyncAnthropic
from pydantic import BaseModel

from dna.llm_providers.llm_provider_base import (
    DEFAULT_MAX_TOOL_RESULT_CHARS,
    LLMProviderBase,
    _truncate_tool_result,
)
from dna.prompts.generate_note_prompt import GENERATE_NOTE_PROMPT

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _to_anthropic_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert OpenAI-style tool definitions to Anthropic tool definitions."""
    converted: list[dict[str, Any]] = []
    for tool in tools:
        fn = tool.get("function", tool)
        converted.append(
            {
                "name": fn["name"],
                "description": fn.get("description", ""),
                "input_schema": fn.get(
                    "parameters", {"type": "object", "properties": {}}
                ),
            }
        )
    return converted


def _text_from_content(content: list[Any]) -> str:
    """Concatenate the text blocks of an Anthropic message's content."""
    return "".join(
        block.text for block in content if getattr(block, "type", None) == "text"
    )


class AnthropicProvider(LLMProviderBase):
    """Claude implementation of the LLM provider, on the native Messages API."""

    LLM_PROVIDER_NAME = "ANTHROPIC"

    DEFAULT_MODEL = "claude-opus-4-8"
    DEFAULT_TIMEOUT = 60.0

    def _get_provider_client(self) -> AsyncAnthropic:  # type: ignore[override]
        """Construct the Anthropic async client."""
        return AsyncAnthropic(api_key=self.api_key, timeout=self.timeout)

    async def generate_note(
        self,
        prompt: str,
        transcript: str,
        context: str,
        existing_notes: str,
        additional_instructions: Optional[str] = None,
        glossary_global: str = "",
        glossary_project: str = "",
    ) -> str:
        """Generate a note suggestion via the Claude Messages API."""
        user_message = self._substitute_template(
            prompt,
            transcript,
            context,
            existing_notes,
            glossary_global,
            glossary_project,
        )
        if additional_instructions:
            user_message += f"\n\nAdditional Instructions: {additional_instructions}"

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=GENERATE_NOTE_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        return _text_from_content(response.content)

    async def _run_tool_loop(
        self,
        system_prompt: str,
        user_message: str,
        anthropic_tools: list[dict[str, Any]],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
        max_iterations: int,
        max_tool_result_chars: int,
        gathered: list[str] | None = None,
    ) -> str:
        """Drive the agentic tool-use loop; return the final assistant text.

        When ``gathered`` is provided, assistant text and tool results are
        appended to it as plain strings for downstream structured extraction.
        """
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": user_message}
        ]
        last_text = ""
        for _ in range(max_iterations):
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system_prompt,
                messages=messages,
                tools=anthropic_tools,
            )
            last_text = _text_from_content(response.content)
            if gathered is not None and last_text:
                gathered.append(last_text)

            tool_uses = [
                block
                for block in response.content
                if getattr(block, "type", None) == "tool_use"
            ]
            if not tool_uses:
                return last_text

            messages.append({"role": "assistant", "content": response.content})
            tool_results: list[dict[str, Any]] = []
            for tool_use in tool_uses:
                try:
                    result = await tool_executor(tool_use.name, tool_use.input or {})
                except Exception as exc:  # surface tool errors back to the model
                    result = json.dumps({"error": str(exc)})
                result = _truncate_tool_result(result, max_tool_result_chars)
                if gathered is not None:
                    gathered.append(f"Result of {tool_use.name}: {result}")
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use.id,
                        "content": result,
                    }
                )
            messages.append({"role": "user", "content": tool_results})

        return last_text

    async def generate_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict[str, Any]],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
        max_iterations: int = 5,
        temperature: float = 0.2,  # accepted for interface parity; not forwarded
        max_tool_result_chars: int = DEFAULT_MAX_TOOL_RESULT_CHARS,
    ) -> str:
        """Run an agentic loop until Claude returns final text."""
        return await self._run_tool_loop(
            system_prompt=system_prompt,
            user_message=user_message,
            anthropic_tools=_to_anthropic_tools(tools),
            tool_executor=tool_executor,
            max_iterations=max_iterations,
            max_tool_result_chars=max_tool_result_chars,
        )

    async def generate_structured_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict[str, Any]],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
        response_model: type[T],
        max_iterations: int = 5,
        temperature: float = 0.2,  # accepted for interface parity; not forwarded
        max_tool_result_chars: int = DEFAULT_MAX_TOOL_RESULT_CHARS,
        extraction_user_message: str | None = None,
    ) -> T:
        """Tool-use phase then instructor-validated structured extraction.

        The tool-use conversation is collected as plain text and replayed to the
        extractor as a single user turn. This avoids replaying ``tool_use`` /
        ``tool_result`` blocks (which would have to be paired exactly) and avoids
        instructor's assistant-prefill JSON mode, which the current models reject.
        """
        gathered: list[str] = []
        await self._run_tool_loop(
            system_prompt=system_prompt,
            user_message=user_message,
            anthropic_tools=_to_anthropic_tools(tools),
            tool_executor=tool_executor,
            max_iterations=max_iterations,
            max_tool_result_chars=max_tool_result_chars,
            gathered=gathered,
        )

        extraction_prompt = extraction_user_message or (
            "Provide your final quality-check result for this draft and check. "
            "Fill every required field in the structured response schema."
        )
        context_blob = "\n\n".join(gathered) if gathered else "(no tool calls were made)"
        extraction_message = (
            f"{user_message}\n\n"
            f"Context gathered while investigating:\n{context_blob}\n\n"
            f"{extraction_prompt}"
        )

        instructor_client = instructor.from_anthropic(
            self.client,
            mode=instructor.Mode.ANTHROPIC_TOOLS,
        )
        return await instructor_client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": extraction_message}],
            response_model=response_model,
        )
