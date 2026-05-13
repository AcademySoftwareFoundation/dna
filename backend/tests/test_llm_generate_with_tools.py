"""Tests for LLMProviderBase.generate_with_tools."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.llm_providers.openai_provider import OpenAIProvider


@pytest.mark.asyncio
async def test_generate_with_tools_returns_assistant_text():
    provider = OpenAIProvider(api_key="k")
    choice = MagicMock()
    choice.message.content = '{"passed": true}'
    choice.message.tool_calls = []
    resp = MagicMock()
    resp.choices = [choice]
    provider._client = MagicMock()
    provider._client.chat.completions.create = AsyncMock(return_value=resp)

    out = await provider.generate_with_tools(
        "system",
        "user",
        [],
        tool_executor=lambda _n, _a: "",
        max_iterations=3,
    )
    assert '{"passed": true}' in out


@pytest.mark.asyncio
async def test_generate_with_tools_runs_tool_then_finishes():
    provider = OpenAIProvider(api_key="k")
    tc = MagicMock()
    tc.id = "call_1"
    tc.type = "function"
    tc.function.name = "search_entities"
    tc.function.arguments = '{"query": "x", "entity_types": ["user"]}'

    first = MagicMock()
    first.message.content = None
    first.message.tool_calls = [tc]

    second = MagicMock()
    second.message.content = "final"
    second.message.tool_calls = []

    provider._client = MagicMock()
    provider._client.chat.completions.create = AsyncMock(
        side_effect=[
            MagicMock(choices=[first]),
            MagicMock(choices=[second]),
        ]
    )

    tool_calls: list[tuple[str, dict]] = []

    async def executor(name: str, args: dict) -> str:
        tool_calls.append((name, args))
        return "{}"

    out = await provider.generate_with_tools(
        "s",
        "u",
        [{"type": "function", "function": {"name": "search_entities"}}],
        tool_executor=executor,
        max_iterations=5,
    )
    assert out == "final"
    assert tool_calls and tool_calls[0][0] == "search_entities"
