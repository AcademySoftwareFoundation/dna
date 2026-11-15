"""Playlist Metadata Models.

Playlist-local metadata only. In-review and transcription live on Session.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Fields this endpoint accepted before sessions, and where they live now.
_MOVED_TO_SESSION = {
    "in_review": "PUT /sessions/{session_id}/in-review",
    "in_review_pinned": "PUT /sessions/{session_id}/in-review",
    "meeting_id": "PUT /sessions/{session_id}/transcription",
}


class PlaylistMetadataUpdate(BaseModel):
    """Model for updating playlist-local metadata.

    Unknown fields are rejected (422) rather than ignored, so clients still
    sending in-review here fail loudly instead of getting a no-op 200.
    """

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"has_scratch": True}]},
    )

    @model_validator(mode="before")
    @classmethod
    def _reject_session_fields(cls, data):
        if isinstance(data, dict):
            moved = [key for key in _MOVED_TO_SESSION if key in data]
            if moved:
                routes = sorted({_MOVED_TO_SESSION[key] for key in moved})
                raise ValueError(
                    f"{', '.join(moved)} moved to DNA sessions; use "
                    f"{' or '.join(routes)}"
                )
        return data

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
