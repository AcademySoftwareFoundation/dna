"""Tests for the Anthropic (Claude) LLM provider."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from dna.llm_providers.anthropic_provider import (
    AnthropicProvider,
    _to_anthropic_tools,
)


def _text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _tool_use_block(block_id: str, name: str, tool_input: dict) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.id = block_id
    block.name = name
    block.input = tool_input
    return block


class TestAnthropicProviderInit:
    def test_init_with_api_key(self):
        provider = AnthropicProvider(api_key="test-key", model="claude-sonnet-4-6")
        assert provider.api_key == "test-key"
        assert provider.model == "claude-sonnet-4-6"

    def test_init_default_model(self):
        provider = AnthropicProvider(api_key="test-key")
        assert provider.model == "claude-opus-4-8"

    def test_init_raises_without_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="API key not provided"):
                AnthropicProvider()


class TestToolConversion:
    def test_converts_openai_tools_to_anthropic(self):
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": "search_entities",
                    "description": "Search the tracker.",
                    "parameters": {
                        "type": "object",
                        "properties": {"query": {"type": "string"}},
                        "required": ["query"],
                    },
                },
            }
        ]
        result = _to_anthropic_tools(openai_tools)
        assert result == [
            {
                "name": "search_entities",
                "description": "Search the tracker.",
                "input_schema": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            }
        ]


class TestGenerateNote:
    @pytest.mark.asyncio
    async def test_generate_note_calls_messages_api_without_temperature(self):
        """generate_note should hit the Messages API and not forward temperature."""
        provider = AnthropicProvider(api_key="test-key", model="claude-opus-4-8")

        mock_response = MagicMock()
        mock_response.content = [_text_block("Generated note")]
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        provider._client = mock_client

        result = await provider.generate_note(
            prompt="{{ transcript }} / {{ context }} / {{ notes }}",
            transcript="T",
            context="C",
            existing_notes="N",
        )

        assert result == "Generated note"
        kwargs = mock_client.messages.create.call_args.kwargs
        assert kwargs["model"] == "claude-opus-4-8"
        assert "temperature" not in kwargs
        assert kwargs["messages"][0]["content"] == "T / C / N"


class TestGenerateWithTools:
    @pytest.mark.asyncio
    async def test_tool_loop_executes_tools_then_returns_text(self):
        """The loop should run a tool round, then return the final text."""
        provider = AnthropicProvider(api_key="test-key", model="claude-opus-4-8")

        first = MagicMock()
        first.content = [_tool_use_block("tu_1", "search_entities", {"query": "x"})]
        second = MagicMock()
        second.content = [_text_block("Done")]

        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=[first, second])
        provider._client = mock_client

        executor = AsyncMock(return_value='{"results": []}')

        result = await provider.generate_with_tools(
            system_prompt="sys",
            user_message="find x",
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "search_entities",
                        "description": "search",
                        "parameters": {"type": "object", "properties": {}},
                    },
                }
            ],
            tool_executor=executor,
            max_iterations=3,
        )

        assert result == "Done"
        executor.assert_awaited_once_with("search_entities", {"query": "x"})
        # No temperature forwarded on either call.
        for call in mock_client.messages.create.call_args_list:
            assert "temperature" not in call.kwargs
