"""Tests for QC system prompt assembly."""

from dna.qc.qc_prompt import (
    QC_EXTRACTION_USER_MESSAGE,
    QC_SYSTEM_INSTRUCTIONS,
    build_qc_system_prompt,
)


def test_build_qc_system_prompt_includes_context_blocks():
    prompt = build_qc_system_prompt("Version: v1", "Speaker: hello", '{"content":""}')
    assert QC_SYSTEM_INSTRUCTIONS in prompt
    assert "Version: v1" in prompt
    assert "Speaker: hello" in prompt
    assert '{"content":""}' in prompt


def test_qc_system_instructions_cover_field_routing():
    assert "attribute_suggestion.to" in QC_SYSTEM_INSTRUCTIONS
    assert "attribute_suggestion.cc" in QC_SYSTEM_INSTRUCTIONS
    assert "attribute_suggestion.links" in QC_SYSTEM_INSTRUCTIONS
    assert "note_suggestion" in QC_SYSTEM_INSTRUCTIONS


def test_qc_extraction_user_message_requires_suggestions_on_fail():
    assert "passed is false" in QC_EXTRACTION_USER_MESSAGE
    assert "note_suggestion" in QC_EXTRACTION_USER_MESSAGE
    assert "attribute_suggestion" in QC_EXTRACTION_USER_MESSAGE
