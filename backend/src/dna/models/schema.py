"""Normalised production-tracking schema models.

Providers convert their native schema (ShotGrid first) into this shape so the
frontend can render and edit fields that are not on the DNA entity models.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def _examples(*values: dict[str, Any]) -> ConfigDict:
    return ConfigDict(json_schema_extra={"examples": list(values)})


class SchemaFieldOption(BaseModel):
    """One acceptable value for a choice or entity field."""

    model_config = _examples({"value": "rev", "label": "Pending Review"})

    value: str = Field(description="Stored value (status code or entity type name)")
    label: str = Field(description="Label to show for this value")


class SchemaField(BaseModel):
    """A field on an entity, either on the DNA model or provider-only."""

    model_config = _examples(
        {
            "code": "sg_cut_in",
            "display_name": "Cut In",
            "data_type": "number",
            "editable": True,
            "acceptable_values": None,
            "source": "provider",
        }
    )

    code: str = Field(
        description=(
            "Field code. For provider fields this is the provider code "
            "(e.g. 'sg_cut_in'); for DNA fields it is the DNA model attribute."
        )
    )
    source: Literal["dna", "provider"] = Field(
        default="provider",
        description=(
            "'dna' for fields on the DNA model (written via `fields`), "
            "'provider' for provider-only fields (written via `additional_fields`)."
        ),
    )
    display_name: str = Field(description="Human-readable field name")
    data_type: str = Field(
        description="Provider data type, e.g. 'text', 'number', 'entity', 'status_list'"
    )
    editable: bool = Field(
        description="Whether the provider allows writes to this field"
    )
    acceptable_values: Optional[list[SchemaFieldOption]] = Field(
        default=None,
        description=(
            "Allowed values for list, status, entity, and multi-entity fields. "
            "Null for free-form fields."
        ),
    )
