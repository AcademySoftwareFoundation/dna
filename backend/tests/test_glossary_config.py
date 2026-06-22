"""Tests for glossary YAML loading and prompt injection."""

import os
from pathlib import Path

import pytest

from dna.glossary_config import (
    clear_glossary_cache,
    default_glossary_global_path,
    default_glossary_project_path,
    get_default_glossary_global,
    get_default_glossary_project,
    inject_glossaries,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_glossary_cache()
    yield
    clear_glossary_cache()


def test_get_default_glossaries_load_packaged_yaml():
    assert "Screen right" in get_default_glossary_global()
    assert "Carryall" in get_default_glossary_project()


def test_default_paths_are_under_dna_config():
    assert default_glossary_global_path().name == "glossary_global.yaml"
    assert default_glossary_project_path().name == "glossary_project.yaml"


def test_global_path_override(tmp_path: Path):
    custom = tmp_path / "g.yaml"
    custom.write_text("foo: bar\n", encoding="utf-8")
    old = os.environ.get("DNA_GLOSSARY_GLOBAL_PATH")
    os.environ["DNA_GLOSSARY_GLOBAL_PATH"] = str(custom)
    clear_glossary_cache()
    try:
        assert get_default_glossary_global() == "foo: bar"
    finally:
        if old is None:
            os.environ.pop("DNA_GLOSSARY_GLOBAL_PATH", None)
        else:
            os.environ["DNA_GLOSSARY_GLOBAL_PATH"] = old
        clear_glossary_cache()


def test_missing_file_raises(tmp_path: Path):
    old = os.environ.get("DNA_GLOSSARY_PROJECT_PATH")
    os.environ["DNA_GLOSSARY_PROJECT_PATH"] = str(tmp_path / "nope.yaml")
    clear_glossary_cache()
    try:
        with pytest.raises(FileNotFoundError):
            get_default_glossary_project()
    finally:
        if old is None:
            os.environ.pop("DNA_GLOSSARY_PROJECT_PATH", None)
        else:
            os.environ["DNA_GLOSSARY_PROJECT_PATH"] = old
        clear_glossary_cache()


def test_inject_replaces_both_spacing_styles():
    result = inject_glossaries(
        "G: {{ glossary_global }} / {{glossary_global}}\n"
        "P: {{ glossary_project }} / {{glossary_project}}",
        "GG",
        "PP",
    )
    assert result == "G: GG / GG\nP: PP / PP"


def test_inject_appends_when_placeholders_absent():
    result = inject_glossaries("No placeholders here.", "GG", "PP")
    assert "Glossary — Global Terms:\nGG" in result
    assert "Glossary — Project Terms:\nPP" in result


def test_inject_appends_only_missing_placeholder():
    result = inject_glossaries("{{ glossary_global }}", "GG", "PP")
    assert result == "GG\n\nGlossary — Project Terms:\nPP"


def test_inject_empty_glossaries_are_noops():
    assert inject_glossaries("unchanged", "", "") == "unchanged"
