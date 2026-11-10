"""Authentication response models."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from dna.auth.identity import CurrentUser


class LoginResponse(BaseModel):
    """A freshly issued DNA access token and the identity it carries."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                    "token_type": "bearer",
                    "expires_at": "2026-01-01T20:00:00Z",
                    "user": {
                        "sub": "jdoe",
                        "email": "jdoe@example.com",
                        "name": "Jane Doe",
                    },
                }
            ]
        }
    )

    access_token: str = Field(description="Signed JWT to send as a Bearer token")
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime = Field(description="When the token stops being accepted")
    user: CurrentUser
