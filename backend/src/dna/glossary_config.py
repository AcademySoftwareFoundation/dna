"""Load the studio-editable glossary YAML files used as note-generation context.

Two glossaries are supported:

* ``glossary_global``  — industry-wide VFX terms and shorthand.
* ``glossary_project`` — terms unique to the current production.

Each file's raw text is injected verbatim into the note prompt (via the
``{{ glossary_global }}`` / ``{{ glossary_project }}`` placeholders), so the
files are kept human-readable rather than parsed into structured data.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

_CONFIG_DIR = Path(__file__).resolve().parent / "config"
_DEFAULT_GLOBAL = _CONFIG_DIR / "glossary_global.yaml"
_DEFAULT_PROJECT = _CONFIG_DIR / "glossary_project.yaml"


def default_glossary_global_path() -> Path:
    """Path to the global glossary (override with DNA_GLOSSARY_GLOBAL_PATH)."""
    override = os.environ.get("DNA_GLOSSARY_GLOBAL_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return _DEFAULT_GLOBAL.resolve()


def default_glossary_project_path() -> Path:
    """Path to the project glossary (override with DNA_GLOSSARY_PROJECT_PATH)."""
    override = os.environ.get("DNA_GLOSSARY_PROJECT_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return _DEFAULT_PROJECT.resolve()


@lru_cache(maxsize=16)
def _read_glossary_cached(resolved_path: str, mtime: float) -> str:
    return Path(resolved_path).read_text(encoding="utf-8").strip()


def _read_glossary(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"Glossary config not found: {path}")
    return _read_glossary_cached(str(path), path.stat().st_mtime)


def get_default_glossary_global() -> str:
    """Return the configured default global glossary text (file changes picked up)."""
    return _read_glossary(default_glossary_global_path())


def get_default_glossary_project() -> str:
    """Return the configured default project glossary text (file changes picked up)."""
    return _read_glossary(default_glossary_project_path())


def clear_glossary_cache() -> None:
    """Clear loader cache (for tests)."""
    _read_glossary_cached.cache_clear()


def inject_glossaries(
    prompt: str,
    glossary_global: str,
    glossary_project: str,
) -> str:
    """Substitute glossary placeholders, appending a labeled block when absent.

    If the prompt already references ``{{ glossary_global }}`` /
    ``{{ glossary_project }}`` (either spacing style), the placeholder is
    replaced in place. Otherwise any non-empty glossary text is appended under a
    labeled heading so every generated note receives glossary context, even when
    a user's custom prompt omits the placeholders.
    """
    has_global = "{{ glossary_global }}" in prompt or "{{glossary_global}}" in prompt
    has_project = "{{ glossary_project }}" in prompt or "{{glossary_project}}" in prompt

    result = prompt
    result = result.replace("{{ glossary_global }}", glossary_global)
    result = result.replace("{{glossary_global}}", glossary_global)
    result = result.replace("{{ glossary_project }}", glossary_project)
    result = result.replace("{{glossary_project}}", glossary_project)

    appendix = ""
    if glossary_global.strip() and not has_global:
        appendix += f"\n\nGlossary — Global Terms:\n{glossary_global.strip()}"
    if glossary_project.strip() and not has_project:
        appendix += f"\n\nGlossary — Project Terms:\n{glossary_project.strip()}"

    return result + appendix
