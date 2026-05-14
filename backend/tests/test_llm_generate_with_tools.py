"""Tests for LLMProviderBase.generate_with_tools."""

from unittest import mock
from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.llm_providers.openai_provider import OpenAIProvider
from dna.models.qc_check import NoteQCLLMOutput


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


@pytest.mark.asyncio
async def test_generate_structured_with_tools_returns_model():
    provider = OpenAIProvider(api_key="k")
    choice = MagicMock()
    choice.message.content = "analysis"
    choice.message.tool_calls = []
    resp = MagicMock()
    resp.choices = [choice]
    provider._client = MagicMock()
    provider._client.chat.completions.create = AsyncMock(return_value=resp)

    expected = NoteQCLLMOutput(passed=True)
    inst_client = MagicMock()
    inst_client.chat.completions.create = AsyncMock(return_value=expected)

    with mock.patch(
        "dna.llm_providers.llm_provider_base.instructor.from_openai",
        return_value=inst_client,
    ) as mock_from_openai:
        out = await provider.generate_structured_with_tools(
            "system",
            "user",
            [],
            tool_executor=lambda _n, _a: "",
            response_model=NoteQCLLMOutput,
            max_iterations=3,
        )

    assert out is expected
    mock_from_openai.assert_called_once()
    assert provider._client.chat.completions.create.await_count == 1
    assert inst_client.chat.completions.create.await_count == 1
