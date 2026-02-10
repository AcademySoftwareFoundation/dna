"""Draft Note Models.

Pydantic models for draft notes stored in the storage provider.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DraftNoteLink(BaseModel):
    """Reference to a DNA entity to link to the note."""

    entity_type: str
    entity_id: int


class DraftNoteBase(BaseModel):
    """Base model for draft note data."""

    content: str = ""
    subject: str = ""
    to: str = ""
    cc: str = ""
    links: list[DraftNoteLink] = Field(default_factory=list)
    version_status: str = ""
    published: bool = False
    published_at: Optional[datetime] = None
    published_note_id: Optional[int] = None


class DraftNoteCreate(DraftNoteBase):
    """Model for creating a new draft note."""

    user_email: str
    playlist_id: int
    version_id: int


class DraftNote(DraftNoteBase):
    """Full draft note model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    user_email: str
    playlist_id: int
    version_id: int
    updated_at: datetime
    created_at: datetime


class DraftNoteUpdate(DraftNoteBase):
    """Model for updating an existing draft note."""

    pass
