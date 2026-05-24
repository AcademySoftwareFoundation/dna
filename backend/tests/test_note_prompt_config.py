"""Tests for default note prompt YAML loading."""

import os
from pathlib import Path

import pytest

from dna.note_prompt_config import (
    clear_default_note_prompt_cache,
    default_note_prompt_config_path,
    get_default_note_prompt,
)


@pytest.fixture(autouse=True)
def _clear_prompt_cache():
    clear_default_note_prompt_cache()
    yield
    clear_default_note_prompt_cache()


def test_get_default_note_prompt_loads_packaged_yaml():
    text = get_default_note_prompt()
    assert "Purpose and Goals" in text
    assert "{{ transcript }}" in text or "{{transcript}}" in text


def test_dna_default_note_prompt_path_override(tmp_path: Path):
    custom = tmp_path / "custom.yaml"
    custom.write_text(
        "default_note_prompt:\n  body: |\n    Hello {{ transcript }}\n",
        encoding="utf-8",
    )
    old = os.environ.get("DNA_DEFAULT_NOTE_PROMPT_PATH")
    os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = str(custom)
    clear_default_note_prompt_cache()
    try:
        assert get_default_note_prompt().strip() == "Hello {{ transcript }}"
    finally:
        if old is None:
            os.environ.pop("DNA_DEFAULT_NOTE_PROMPT_PATH", None)
        else:
            os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = old
        clear_default_note_prompt_cache()


def test_default_path_is_under_dna_config():
    p = default_note_prompt_config_path()
    assert p.name == "default_note_prompt.yaml"


def test_invalid_yaml_raises(tmp_path: Path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("42\n", encoding="utf-8")
    old = os.environ.get("DNA_DEFAULT_NOTE_PROMPT_PATH")
    os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = str(bad)
    clear_default_note_prompt_cache()
    try:
        with pytest.raises(ValueError, match="not a mapping"):
            get_default_note_prompt()
    finally:
        if old is None:
            os.environ.pop("DNA_DEFAULT_NOTE_PROMPT_PATH", None)
        else:
            os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = old
        clear_default_note_prompt_cache()


def test_default_note_prompt_not_mapping_raises(tmp_path: Path):
    bad = tmp_path / "notmap.yaml"
    bad.write_text("default_note_prompt: not-a-mapping\n", encoding="utf-8")
    old = os.environ.get("DNA_DEFAULT_NOTE_PROMPT_PATH")
    os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = str(bad)
    clear_default_note_prompt_cache()
    try:
        with pytest.raises(ValueError, match="missing 'default_note_prompt'"):
            get_default_note_prompt()
    finally:
        if old is None:
            os.environ.pop("DNA_DEFAULT_NOTE_PROMPT_PATH", None)
        else:
            os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = old
        clear_default_note_prompt_cache()


def test_missing_body_raises(tmp_path: Path):
    bad = tmp_path / "nobody.yaml"
    bad.write_text("default_note_prompt: {}\n", encoding="utf-8")
    old = os.environ.get("DNA_DEFAULT_NOTE_PROMPT_PATH")
    os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = str(bad)
    clear_default_note_prompt_cache()
    try:
        with pytest.raises(ValueError, match="body"):
            get_default_note_prompt()
    finally:
        if old is None:
            os.environ.pop("DNA_DEFAULT_NOTE_PROMPT_PATH", None)
        else:
            os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = old
        clear_default_note_prompt_cache()


def test_missing_file_raises(tmp_path: Path):
    missing = tmp_path / "nope.yaml"
    old = os.environ.get("DNA_DEFAULT_NOTE_PROMPT_PATH")
    os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = str(missing)
    clear_default_note_prompt_cache()
    try:
        with pytest.raises(FileNotFoundError):
            get_default_note_prompt()
    finally:
        if old is None:
            os.environ.pop("DNA_DEFAULT_NOTE_PROMPT_PATH", None)
        else:
            os.environ["DNA_DEFAULT_NOTE_PROMPT_PATH"] = old
        clear_default_note_prompt_cache()
