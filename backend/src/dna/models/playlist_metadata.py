"""Playlist Metadata Models.

Playlist-local metadata only. In-review and transcription live on Session.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PlaylistMetadataUpdate(BaseModel):
    """Model for updating playlist-local metadata."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"has_scratch": True}]})

    has_scratch: Optional[bool] = Field(
        default=None,
        description="Whether the playlist has a scratch tile — a placeholder "
        "for a note on the playlist entity rather than on a version.",
    )


class PlaylistMetadata(BaseModel):
    """Playlist-local metadata."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c31be4b0a1b2c3d4e601",
                    "playlist_id": "45",
                    "has_scratch": False,
                }
            ]
        },
    )

    id: str = Field(alias="_id")
    playlist_id: str
    has_scratch: bool = False
