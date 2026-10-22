"""Project Glossary Models.

Pydantic models for the per-project glossary stored in the storage provider.
Unlike the global glossary (a read-only repo file), the project glossary is
production-specific and keyed by the ShotGrid project id, so switching projects
swaps the glossary the AI receives as context.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_GLOSSARY_EXAMPLE = (
    "mk020 - the market sequence\n"
    "DPEL - Digital Production Example Library\n"
    "plate - the scanned live-action background"
)


class ProjectGlossaryUpdate(BaseModel):
    """Model for updating a project glossary."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"content": _GLOSSARY_EXAMPLE}]}
    )

    content: str = Field(
        default="",
        description="Project-specific glossary text injected as note context",
    )


class ProjectGlossary(BaseModel):
    """Full project glossary model with all fields."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c3d2e4b0a1b2c3d4e620",
                    "project_id": "124",
                    "content": _GLOSSARY_EXAMPLE,
                    "created_at": "2026-10-02T14:20:00Z",
                    "updated_at": "2026-10-12T09:48:31Z",
                }
            ]
        },
    )

    id: str = Field(alias="_id")
    project_id: str
    content: str = ""
    updated_at: datetime
    created_at: datetime
