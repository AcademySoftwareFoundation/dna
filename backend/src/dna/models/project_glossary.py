"""Project Glossary Models.

Pydantic models for the per-project glossary stored in the storage provider.
Unlike the global glossary (a read-only repo file), the project glossary is
production-specific and keyed by the ShotGrid project id, so switching projects
swaps the glossary the AI receives as context.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectGlossaryUpdate(BaseModel):
    """Model for updating a project glossary."""

    content: str = Field(
        default="",
        description="Project-specific glossary text injected as note context",
    )


class ProjectGlossary(BaseModel):
    """Full project glossary model with all fields."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: int
    content: str = ""
    updated_at: datetime
    created_at: datetime
