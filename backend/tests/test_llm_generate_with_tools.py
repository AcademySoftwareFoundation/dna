"""Tests for LLMProviderBase.generate_with_tools."""

import json
from unittest import mock
from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.llm_providers import llm_provider_base as llm_base
from dna.llm_providers.llm_provider_base import DEFAULT_MAX_TOOL_RESULT_CHARS
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
async def test_generate_with_tools_exhausts_max_iterations_returns_last_text():
    provider = OpenAIProvider(api_key="k")
    tc = MagicMock()
    tc.id = "c1"
    tc.type = "function"
    tc.function.name = "search_entities"
    tc.function.arguments = "{}"

    choice = MagicMock()
    choice.message.content = "partial"
    choice.message.tool_calls = [tc]
    resp = MagicMock()
    resp.choices = [choice]

    provider._client = MagicMock()
    provider._client.chat.completions.create = AsyncMock(return_value=resp)

    out = await provider.generate_with_tools(
        "s",
        "u",
        [{"type": "function", "function": {"name": "search_entities"}}],
        tool_executor=AsyncMock(return_value="{}"),
        max_iterations=2,
    )
    assert out == "partial"


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


def test_safe_parse_tool_arguments_invalid_json():
    args, err = llm_base._safe_parse_tool_arguments("{not json")
    assert args is None
    assert err is not None
    payload = json.loads(err)
    assert "error" in payload


def test_safe_parse_tool_arguments_non_object():
    args, err = llm_base._safe_parse_tool_arguments("[1,2]")
    assert args is None
    assert err is not None


def test_truncate_tool_result():
    long = "x" * (DEFAULT_MAX_TOOL_RESULT_CHARS + 100)
    out = llm_base._truncate_tool_result(long, DEFAULT_MAX_TOOL_RESULT_CHARS)
    assert len(out) <= DEFAULT_MAX_TOOL_RESULT_CHARS
    assert "truncated" in out


def test_truncate_tool_result_short_string_unchanged():
    assert llm_base._truncate_tool_result("short", 100) == "short"


@pytest.mark.asyncio
async def test_generate_with_tools_malformed_arguments_skips_executor():
    provider = OpenAIProvider(api_key="k")
    tc = MagicMock()
    tc.id = "call_1"
    tc.type = "function"
    tc.function.name = "search_entities"
    tc.function.arguments = "{not valid json"

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

    executor = AsyncMock(return_value="{}")

    out = await provider.generate_with_tools(
        "s",
        "u",
        [{"type": "function", "function": {"name": "search_entities"}}],
        tool_executor=executor,
        max_iterations=5,
    )
    assert out == "final"
    executor.assert_not_awaited()


@pytest.mark.asyncio
async def test_generate_structured_hits_max_iterations_then_tool_choice_none(
    caplog: pytest.LogCaptureFixture,
):
    provider = OpenAIProvider(api_key="k")
    tc = MagicMock()
    tc.id = "call_1"
    tc.type = "function"
    tc.function.name = "search_entities"
    tc.function.arguments = "{}"

    tool_round = MagicMock()
    tool_round.message.content = None
    tool_round.message.tool_calls = [tc]

    after_none = MagicMock()
    after_none.message.content = "summary without tools"
    after_none.message.tool_calls = []

    provider._client = MagicMock()
    provider._client.chat.completions.create = AsyncMock(
        side_effect=[
            MagicMock(choices=[tool_round]),
            MagicMock(choices=[after_none]),
        ]
    )

    expected = NoteQCLLMOutput(passed=True)
    inst_client = MagicMock()
    inst_client.chat.completions.create = AsyncMock(return_value=expected)

    with caplog.at_level("WARNING"):
        with mock.patch(
            "dna.llm_providers.llm_provider_base.instructor.from_openai",
            return_value=inst_client,
        ):
            out = await provider.generate_structured_with_tools(
                "system",
                "user",
                [{"type": "function", "function": {"name": "search_entities"}}],
                tool_executor=AsyncMock(return_value="{}"),
                response_model=NoteQCLLMOutput,
                max_iterations=1,
            )

    assert out is expected
    create = provider._client.chat.completions.create
    assert create.await_count == 2
    assert create.await_args_list[0].kwargs["tool_choice"] == "auto"
    assert create.await_args_list[1].kwargs["tool_choice"] == "none"
    assert "max_iterations" in caplog.text
