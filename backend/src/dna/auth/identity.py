"""Provider-agnostic identity carried in DNA access tokens."""

from typing import Optional

from pydantic import BaseModel, Field


class CurrentUser(BaseModel):
    """The authenticated caller, as decoded from a DNA access token.

    Auth providers produce this and production tracking providers consume it,
    so it must not carry fields specific to either.
    """

    sub: str = Field(description="Stable subject identifier from the auth provider")
    email: str = Field(description="The user's email; DNA's key for per-user data")
    name: Optional[str] = Field(default=None, description="Display name")
