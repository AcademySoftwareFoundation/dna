"""User Settings Models.

Pydantic models for user settings stored in the storage provider.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from dna.models.transcription import DEFAULT_TRANSCRIPTION_LANGUAGE


class UserSettingsUpdate(BaseModel):
    """Model for updating user settings."""

    note_prompt: Optional[str] = Field(
        default=None, description="Custom prompt for generating notes"
    )
    preferred_model: Optional[str] = Field(
        default=None,
        description="Preferred LLM model for note generation; empty means use server default",
    )
    regenerate_on_version_change: Optional[bool] = Field(
        default=None,
        description="Regenerate AI note when switching review versions",
    )
    regenerate_on_transcript_update: Optional[bool] = Field(
        default=None,
        description="Regenerate AI note when transcript segments are updated",
    )
    sync_prodtrack_tab_on_version_change: Optional[bool] = Field(
        default=None,
        description="When true, DNA tells the browser extension to open the PT "
        "version page whenever the selected version changes",
    )
    prodtrack_page_type: Optional[str] = Field(
        default=None,
        description="Which PT page to sync: 'version' for Version Detail, 'entity' for Shot/Asset Detail",
    )
    transcription_language: Optional[str] = Field(
        default=None,
        pattern=r"^([a-z]{2,3})?$",
        description="ISO 639-1 language forced on the transcriber at session "
        "start (e.g. 'en'); empty string means auto-detect per window",
    )


class UserSettings(BaseModel):
    """Full user settings model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    user_email: str
    note_prompt: str = ""
    preferred_model: str = ""
    regenerate_on_version_change: bool = False
    regenerate_on_transcript_update: bool = False
    sync_prodtrack_tab_on_version_change: bool = True
    prodtrack_page_type: str = "version"
    # Users can switch to auto-detect ("") in Settings; see the constant for
    # why English rather than auto is the default.
    transcription_language: str = DEFAULT_TRANSCRIPTION_LANGUAGE
    updated_at: datetime
    created_at: datetime
