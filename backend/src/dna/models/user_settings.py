"""User Settings Models.

Pydantic models for user settings stored in the storage provider.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserSettingsUpdate(BaseModel):
    """Model for updating user settings."""

    note_prompt: Optional[str] = Field(
        default=None, description="Custom prompt for generating notes"
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


class UserSettings(BaseModel):
    """Full user settings model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    user_email: str
    note_prompt: str = ""
    regenerate_on_version_change: bool = False
    regenerate_on_transcript_update: bool = False
    sync_prodtrack_tab_on_version_change: bool = True
    updated_at: datetime
    created_at: datetime
