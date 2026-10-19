"""Models for user-defined note QC checks and run results."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from dna.models.draft_note import DraftNoteLink

NoteQCSeverity = Literal["warning", "error"]

_CHECK_EXAMPLE = {
    "name": "Action Item Check",
    "prompt": (
        "Fail if the transcript assigns an action to someone the note does not "
        "name as the owner."
    ),
    "severity": "warning",
    "enabled": True,
}

_RESULT_EXAMPLE = {
    "check_id": "67f0c3a1e4b0a1b2c3d4e612",
    "check_name": "Action Item Check",
    "severity": "warning",
    "passed": False,
    "issue": "The transcript assigns the matte fix to Alex but the note names no owner.",
    "evidence": '"Alex, can you take the edge on 1042?"',
    "note_suggestion": (
        "Edge of the matte is crawling on frames 1042-1060 - "
        "@[Alex Artist](user:17) to soften the key and recheck against the plate."
    ),
    "attribute_suggestion": {
        "to": '[{"type":"User","id":"17","name":"Alex Artist"}]',
    },
}


class NoteQCCheckCreate(BaseModel):
    """Payload for creating a QC check."""

    model_config = ConfigDict(json_schema_extra={"examples": [_CHECK_EXAMPLE]})

    name: str
    prompt: str
    severity: NoteQCSeverity
    enabled: bool = True


class NoteQCCheckUpdate(BaseModel):
    """Partial update for a QC check."""

    name: Optional[str] = None
    prompt: Optional[str] = None
    severity: Optional[NoteQCSeverity] = None
    enabled: Optional[bool] = None


class NoteQCCheck(BaseModel):
    """Stored QC check definition."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "_id": "67f0c3a1e4b0a1b2c3d4e612",
                    "user_email": "sam.reviewer@studio.example",
                    **_CHECK_EXAMPLE,
                    "created_at": "2026-10-01T10:30:00Z",
                    "updated_at": "2026-10-01T10:30:00Z",
                }
            ]
        },
    )

    id: str = Field(alias="_id")
    user_email: str
    name: str
    prompt: str
    severity: NoteQCSeverity
    enabled: bool = True
    created_at: datetime
    updated_at: datetime


class NoteQCAttributeSuggestion(BaseModel):
    """Suggested updates to draft note metadata."""

    to: Optional[str] = Field(
        default=None,
        description=(
            "Primary recipients when the note is directed at specific users. "
            'JSON string of a JSON array: [{"type":"User","id":123,"name":"Name"}]. '
            "Resolve users via search_entities before suggesting."
        ),
    )
    cc: Optional[str] = Field(
        default=None,
        description=(
            "Users who should see the note but are not primary To recipients "
            "(mentioned in passing, stakeholders). Same JSON array string format as to. "
            "Do not duplicate users already in to."
        ),
    )
    subject: Optional[str] = Field(
        default=None,
        description="Suggested subject line; only when the check implies it should change.",
    )
    version_status: Optional[str] = Field(
        default=None,
        description="Suggested version status (maps to draft version_status).",
    )
    links: Optional[list[DraftNoteLink]] = Field(
        default=None,
        description=(
            "Non-user entity links (Shot, Asset, Version, Task, Playlist). "
            "Do not put users here—use to or cc for users."
        ),
    )


class NoteQCLLMOutput(BaseModel):
    """Structured QC verdict returned by the LLM (instructor-validated)."""

    passed: bool = Field(
        description="True only if the check passes and no draft changes are needed.",
    )
    issue: Optional[str] = Field(
        default=None,
        description="What failed; required when passed is false.",
    )
    evidence: Optional[str] = Field(
        default=None,
        description="Quote or reference from transcript/draft supporting the issue.",
    )
    note_suggestion: Optional[str] = Field(
        default=None,
        description=(
            "Full corrected note body when content must change. Use @[Name](type:id) "
            "for mentions (e.g. user:484). Omit when only metadata changes."
        ),
    )
    attribute_suggestion: Optional[NoteQCAttributeSuggestion] = Field(
        default=None,
        description=(
            "Metadata fixes only: include fields that differ from the current draft. "
            "Use to for direct addressees, cc for other users, links for non-user entities."
        ),
    )


class NoteQCResult(BaseModel):
    """Outcome of running one check against a draft."""

    model_config = ConfigDict(json_schema_extra={"examples": [_RESULT_EXAMPLE]})

    check_id: str
    check_name: str
    severity: NoteQCSeverity
    passed: bool
    issue: Optional[str] = None
    evidence: Optional[str] = None
    note_suggestion: Optional[str] = None
    attribute_suggestion: Optional[NoteQCAttributeSuggestion] = None


class RunQCChecksRequest(BaseModel):
    """Body for run-qc-checks; playlist/version are path params."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"user_email": "sam.reviewer@studio.example"}]}
    )

    user_email: str


class RunQCChecksResponse(BaseModel):
    """QC results for one draft note."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"results": [_RESULT_EXAMPLE]}]}
    )

    results: list[NoteQCResult]


DEFAULT_ACTION_ITEM_CHECK = NoteQCCheckCreate(
    name="Action Item Check",
    prompt=(
        "Review the transcript and draft note. If the transcript mentions an action "
        "item, task, owner, or decision that is missing or unclear in the note, fail "
        "the check. Suggest a corrected note body that includes the missing items. "
        "If someone is assigned the action, add them to To; if others are only "
        "mentioned for visibility, add them to Cc. The check only passes when the note "
        "fully captures all action items and owners from the transcript."
    ),
    severity="warning",
    enabled=True,
)
