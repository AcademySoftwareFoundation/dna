"""API response models for user settings (includes configured default prompt)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserSettingsResponse(BaseModel):
    """User settings returned from the API, including the configured default note prompt."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c35ae4b0a1b2c3d4e60f",
                    "user_email": "sam.reviewer@studio.example",
                    "note_prompt": "",
                    "preferred_model": "gpt-4o-mini",
                    "default_note_prompt": "You are taking notes in a VFX dailies review...",
                    "regenerate_on_version_change": False,
                    "regenerate_on_transcript_update": True,
                    "sync_prodtrack_tab_on_version_change": True,
                    "prodtrack_page_type": "version",
                    "created_at": "2026-09-30T09:12:00Z",
                    "updated_at": "2026-10-14T17:00:27Z",
                }
            ]
        },
    )

    id: str = Field(alias="_id")
    user_email: str
    note_prompt: str = ""
    preferred_model: str = ""
    default_note_prompt: str = ""
    regenerate_on_version_change: bool = False
    regenerate_on_transcript_update: bool = False
    sync_prodtrack_tab_on_version_change: bool = True
    prodtrack_page_type: str = "version"
    updated_at: datetime
    created_at: datetime
