"""Playlist Metadata Models.

Pydantic models for playlist metadata stored in the storage provider.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PlaylistMetadataUpdate(BaseModel):
    """Model for updating playlist metadata."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "in_review": "6990",
                    "meeting_id": "abc-defg-hij",
                    "platform": "google_meet",
                }
            ]
        }
    )

    in_review: Optional[str] = Field(
        default=None, description="Version ID currently in review"
    )
    meeting_id: Optional[str] = Field(default=None, description="Associated meeting ID")
    platform: Optional[str] = Field(default=None, description="Meeting platform")
    vexa_meeting_id: Optional[int] = Field(
        default=None, description="Internal Vexa meeting ID"
    )
    transcription_paused: Optional[bool] = Field(
        default=None, description="Whether transcription storage is paused"
    )
    has_scratch: Optional[bool] = Field(
        default=None,
        description="Whether the playlist has a scratch tile — a placeholder "
        "for a note on the playlist entity rather than on a version.",
    )
    clear_resumed_at: bool = Field(
        default=False,
        description="If True, clears transcription_resumed_at. "
        "Used when starting a new transcription session.",
    )


class PlaylistMetadata(BaseModel):
    """Full playlist metadata model with all fields."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c31be4b0a1b2c3d4e601",
                    "playlist_id": "45",
                    "in_review": "6990",
                    "meeting_id": "abc-defg-hij",
                    "platform": "google_meet",
                    "vexa_meeting_id": 1842,
                    "transcription_paused": False,
                    "has_scratch": False,
                    "transcription_resumed_at": None,
                }
            ]
        },
    )

    id: str = Field(alias="_id")
    playlist_id: str
    in_review: Optional[str] = None
    meeting_id: Optional[str] = None
    platform: Optional[str] = None
    vexa_meeting_id: Optional[int] = None
    transcription_paused: bool = False
    has_scratch: bool = False
    transcription_resumed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when transcription was last resumed. "
        "Segments with start time before this are discarded.",
    )
