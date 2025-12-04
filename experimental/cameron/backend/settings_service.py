"""
Settings Service
Manages application settings and .env file persistence
"""

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])

# Path to .env file (in the backend directory)
ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseModel):
    """Application settings model - all configurable via frontend preferences"""

    # ShotGrid Core Settings
    shotgrid_url: Optional[str] = None
    shotgrid_api_key: Optional[str] = None
    shotgrid_script_name: Optional[str] = None
    shotgrid_author_email: Optional[str] = None
    shotgrid_shot_field: Optional[str] = (
        None  # Field for shot/entity (default: "entity")
    )
    shotgrid_version_field: Optional[str] = (
        None  # Field for version name (default: "code")
    )
    prepend_session_header: Optional[bool] = None

    # ShotGrid DNA Transcript Settings
    sg_sync_transcripts: Optional[bool] = None  # Enable transcript syncing
    sg_dna_transcript_entity: Optional[str] = (
        None  # Custom entity type (e.g., "CustomEntity01")
    )
    sg_transcript_field: Optional[str] = (
        None  # Transcript text field (default: "sg_body")
    )
    sg_version_field: Optional[str] = None  # Version link field (default: "sg_version")
    sg_playlist_field: Optional[str] = (
        None  # Playlist link field (default: "sg_playlist")
    )

    # Vexa Transcription
    vexa_api_key: Optional[str] = None
    vexa_api_url: Optional[str] = None

    # LLM API Keys
    openai_api_key: Optional[str] = None
    claude_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # LLM Prompts
    openai_prompt: Optional[str] = None
    claude_prompt: Optional[str] = None
    gemini_prompt: Optional[str] = None

    # UI Settings
    include_statuses: Optional[bool] = None


def load_env_file() -> dict:
    """Load settings from .env file"""
    settings = {}

    if not ENV_FILE.exists():
        return settings

    try:
        with open(ENV_FILE, "r") as f:
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if not line or line.startswith("#"):
                    continue

                # Parse key=value
                if "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip()

                    # Try to parse as JSON first (handles strings, booleans, multiline, etc. properly)
                    try:
                        value = json.loads(value)
                    except (json.JSONDecodeError, ValueError):
                        # If not valid JSON, treat as plain string
                        # Remove quotes if present
                        if value.startswith('"') and value.endswith('"'):
                            value = value[1:-1]
                        elif value.startswith("'") and value.endswith("'"):
                            value = value[1:-1]

                        # Convert boolean strings
                        if value.lower() == "true":
                            value = True
                        elif value.lower() == "false":
                            value = False

                    settings[key] = value

        print(f"✓ Loaded settings from {ENV_FILE}")
        return settings

    except Exception as e:
        print(f"ERROR: Failed to load .env file: {e}")
        return settings


def save_env_file(settings: dict):
    """Save settings to .env file using JSON encoding for proper multiline support"""
    try:
        # Track which keys from settings have been written
        keys_to_write = {k: v for k, v in settings.items() if v is not None}
        written_keys = set()

        # Read existing file to preserve comments
        existing_lines = []
        if ENV_FILE.exists():
            with open(ENV_FILE, "r") as f:
                existing_lines = f.readlines()

        # Write updated file
        with open(ENV_FILE, "w") as f:
            # Write header if file is new
            if not existing_lines:
                f.write("# DNA Dailies Notes Assistant Settings\n")
                f.write("# This file is automatically managed by the application\n\n")

            # Process existing lines
            for line in existing_lines:
                stripped = line.strip()
                # Check if this is a key=value line (not comment or empty)
                if stripped and not stripped.startswith("#") and "=" in stripped:
                    key = stripped.split("=", 1)[0].strip()
                    # If this key is in our settings to write, write the new value
                    if key in keys_to_write:
                        if key not in written_keys:  # Only write each key once
                            value = keys_to_write[key]
                            json_value = json.dumps(value, ensure_ascii=False)
                            f.write(f"{key}={json_value}\n")
                            written_keys.add(key)
                        # Skip the old line (don't write it)
                    else:
                        # Keep lines for keys not in our settings
                        f.write(line)
                elif stripped.startswith("#") and stripped == "# New settings":
                    # Skip the "New settings" comment lines
                    continue
                else:
                    # Preserve comment lines and empty lines
                    f.write(line)

            # Add keys that weren't in the existing file
            new_keys = [k for k in keys_to_write.keys() if k not in written_keys]
            if new_keys:
                for key in new_keys:
                    value = keys_to_write[key]
                    json_value = json.dumps(value, ensure_ascii=False)
                    f.write(f"{key}={json_value}\n")

        print(f"✓ Saved settings to {ENV_FILE}")

    except Exception as e:
        print(f"ERROR: Failed to save .env file: {e}")
        raise


def env_key_to_field(env_key: str) -> str:
    """Convert ENV_KEY to field_name"""
    return env_key.lower()


def field_to_env_key(field_name: str) -> str:
    """Convert field_name to ENV_KEY"""
    return field_name.upper()


@router.get("")
def get_settings():
    """Get current settings from .env file"""
    try:
        env_settings = load_env_file()

        # Convert ENV_KEYS to field_names
        settings_dict = {}
        for env_key, value in env_settings.items():
            field_name = env_key_to_field(env_key)
            settings_dict[field_name] = value

        return {"status": "success", "settings": settings_dict}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
def update_settings(settings: Settings):
    """Update settings and save to .env file"""
    try:
        # Convert field_names to ENV_KEYS
        env_settings = {}
        for field_name, value in settings.model_dump().items():
            if value is not None:  # Only save non-None values
                env_key = field_to_env_key(field_name)
                env_settings[env_key] = value

        # Save to .env file
        save_env_file(env_settings)

        return {"status": "success", "message": "Settings saved successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-partial")
def save_partial_settings(settings: dict):
    """Save partial settings (only provided fields) to .env file"""
    try:
        # Load existing settings
        existing_env = load_env_file()

        # Update with new values (converting field_names to ENV_KEYS)
        for field_name, value in settings.items():
            if value is not None:
                env_key = field_to_env_key(field_name)
                existing_env[env_key] = value

        # Save merged settings
        save_env_file(existing_env)

        return {"status": "success", "message": "Settings saved successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload")
def reload_settings():
    """Reload settings from .env file into runtime configuration"""
    try:
        # Reload environment variables from .env file
        from dotenv import load_dotenv

        load_dotenv(override=True)

        # Update ShotGrid runtime config
        from shotgrid_service import _runtime_config

        _runtime_config["SHOTGRID_URL"] = os.environ.get("SHOTGRID_URL")
        _runtime_config["SCRIPT_NAME"] = os.environ.get("SHOTGRID_SCRIPT_NAME")
        _runtime_config["API_KEY"] = os.environ.get("SHOTGRID_API_KEY")
        _runtime_config["SHOTGRID_VERSION_FIELD"] = os.environ.get(
            "SHOTGRID_VERSION_FIELD", "code"
        )
        _runtime_config["SHOTGRID_SHOT_FIELD"] = os.environ.get(
            "SHOTGRID_SHOT_FIELD", "entity"
        )

        print("✓ Settings reloaded from .env file")
        return {"status": "success", "message": "Settings reloaded successfully"}

    except Exception as e:
        print(f"ERROR: Failed to reload settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))
