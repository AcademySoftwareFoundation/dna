"""API response models for user settings (includes configured default prompt)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserSettingsResponse(BaseModel):
    """User settings returned from the API, including the configured default note prompt."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    user_email: str
    note_prompt: str = ""
    default_note_prompt: str = ""
    regenerate_on_version_change: bool = False
    regenerate_on_transcript_update: bool = False
    sync_prodtrack_tab_on_version_change: bool = True
    updated_at: datetime
    created_at: datetime
