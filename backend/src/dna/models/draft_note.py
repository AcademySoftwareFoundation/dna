"""Draft Note Models.

Pydantic models for draft notes stored in the storage provider.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# Sentinel version_id for a playlist-level "scratch" note: the draft belongs to
# the playlist itself rather than any version, and publishes as a note linked
# only to the Playlist entity.
SCRATCH_VERSION_ID = "-1"


_LINK_EXAMPLE = {
    "entity_type": "Shot",
    "entity_id": "1207",
    "entity_name": "mk020_0010",
}

_DRAFT_BODY_EXAMPLE = {
    "subject": "mk020_0010_comp_v003 - comp notes",
    "content": (
        "Edge of the matte is crawling on frames 1042-1060; soften the key and "
        "recheck against the plate. Otherwise good to move on to lighting."
    ),
    "links": [_LINK_EXAMPLE],
    "version_status": "rev",
    "attachment_ids": ["8c6a2f0e-7d3b-4f1a-9e2c-5b8d1a0c3e47"],
}


class DraftNoteLink(BaseModel):
    """Reference to a DNA entity to link to the note."""

    model_config = ConfigDict(json_schema_extra={"examples": [_LINK_EXAMPLE]})

    entity_type: str
    entity_id: str
    entity_name: str = ""


class DraftNoteBase(BaseModel):
    """Base model for draft note data."""

    content: Optional[str] = ""
    subject: Optional[str] = ""
    to: str = ""
    cc: str = ""
    links: list[DraftNoteLink] = Field(default_factory=list)
    version_status: str = ""
    published: bool = False
    edited: bool = False
    published_at: Optional[datetime] = None
    published_note_id: Optional[str] = None
    attachment_ids: list[str] = Field(default_factory=list)


class DraftNoteCreate(DraftNoteBase):
    """Model for creating a new draft note."""

    user_email: str
    playlist_id: str
    version_id: str


class DraftNote(DraftNoteBase):
    """Full draft note model with all fields."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c2d9e4b0a1b2c3d4e5f6",
                    "user_email": "sam.reviewer@studio.example",
                    "playlist_id": "45",
                    "version_id": "6990",
                    **_DRAFT_BODY_EXAMPLE,
                    "to": "",
                    "cc": "",
                    "published": False,
                    "edited": False,
                    "published_at": None,
                    "published_note_id": None,
                    "created_at": "2026-10-14T17:05:12.410Z",
                    "updated_at": "2026-10-14T17:21:48.003Z",
                }
            ]
        },
    )

    id: str = Field(alias="_id")
    user_email: str
    playlist_id: str
    version_id: str
    updated_at: datetime
    created_at: datetime


class DraftNoteUpdate(BaseModel):
    """Model for updating an existing draft note."""

    model_config = ConfigDict(json_schema_extra={"examples": [_DRAFT_BODY_EXAMPLE]})

    content: Optional[str] = None
    subject: Optional[str] = None
    to: Optional[str] = None
    cc: Optional[str] = None
    links: Optional[list[DraftNoteLink]] = None
    version_status: Optional[str] = None
    published: Optional[bool] = None
    edited: Optional[bool] = None
    published_at: Optional[datetime] = None
    published_note_id: Optional[str] = None
    attachment_ids: Optional[list[str]] = None
