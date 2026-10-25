"""Error response model.

FastAPI renders every ``HTTPException`` as ``{"detail": ...}``; this model
exists so the OpenAPI document can describe that envelope on 4xx/5xx
responses instead of leaving them undocumented.
"""

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    """Body returned with any 4xx/5xx status."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"detail": "Version not found: 6990"}]}
    )

    detail: str = Field(description="Human-readable reason for the failure")
