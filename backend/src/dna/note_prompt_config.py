"""Load the default note-generation prompt from studio-editable YAML config."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_CONFIG_DIR = Path(__file__).resolve().parent / "config"
_DEFAULT_RELATIVE = _CONFIG_DIR / "default_note_prompt.yaml"


def default_note_prompt_config_path() -> Path:
    """Path to the default note prompt YAML (override with DNA_DEFAULT_NOTE_PROMPT_PATH)."""
    override = os.environ.get("DNA_DEFAULT_NOTE_PROMPT_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return _DEFAULT_RELATIVE.resolve()


@lru_cache(maxsize=16)
def _read_default_note_prompt_cached(resolved_path: str, mtime: float) -> str:
    path = Path(resolved_path)
    with path.open(encoding="utf-8") as f:
        data: dict[str, Any] = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Invalid default note prompt config (not a mapping): {path}")
    block = data.get("default_note_prompt")
    if not isinstance(block, dict):
        raise ValueError(
            f"Invalid default note prompt config: missing 'default_note_prompt' "
            f"mapping in {path}"
        )
    body = block.get("body")
    if not isinstance(body, str) or not body.strip():
        raise ValueError(
            f"Invalid default note prompt config: 'default_note_prompt.body' "
            f"must be a non-empty string in {path}"
        )
    return body


def get_default_note_prompt() -> str:
    """Return the configured default note prompt template (file changes are picked up)."""
    path = default_note_prompt_config_path()
    if not path.is_file():
        raise FileNotFoundError(
            f"Default note prompt config not found: {path}. "
            "Set DNA_DEFAULT_NOTE_PROMPT_PATH or restore "
            f"{_DEFAULT_RELATIVE.name} under {_CONFIG_DIR}."
        )
    mtime = path.stat().st_mtime
    return _read_default_note_prompt_cached(str(path), mtime)


def clear_default_note_prompt_cache() -> None:
    """Clear loader cache (for tests)."""
    _read_default_note_prompt_cached.cache_clear()
