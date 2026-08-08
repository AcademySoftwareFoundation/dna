"""RV sync models.

Pydantic models for the RV in-review sync endpoints.
"""

from typing import Optional

from pydantic import BaseModel, Field


class RVScanResult(BaseModel):
    """A networked RV session discovered on the configured host."""

    port: int = Field(description="TCP port the RV session is listening on")
    greeting: str = Field(description="Contact string RV returned at handshake")


class RVSyncConnectRequest(BaseModel):
    """Request to bind a playlist's in_review to a running RV session."""

    playlist_id: int = Field(description="Playlist to keep in sync")
    port: int = Field(description="Port of the RV session (from a scan)")


class RVLaunchInfo(BaseModel):
    """rvlink URL for opening RV with networking on and a playlist loaded."""

    url: str = Field(description="rvlink://baked/… URL to open on the client")
    port: int = Field(description="Network port the launched RV will listen on")


class RVSyncStatus(BaseModel):
    """Current state of a playlist's RV sync session."""

    playlist_id: int
    port: int
    status: str = Field(
        description="connecting | connected | disconnected | error"
    )
    version_id: Optional[int] = Field(
        default=None, description="SG Version ID currently under the playhead"
    )
    version_name: Optional[str] = Field(
        default=None, description="SG Version code currently under the playhead"
    )
    detail: Optional[str] = None
