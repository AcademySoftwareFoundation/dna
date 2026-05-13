"""Models for user-defined note QC checks and run results."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from dna.models.draft_note import DraftNoteLink

NoteQCSeverity = Literal["warning", "error"]


class NoteQCCheckCreate(BaseModel):
    """Payload for creating a QC check."""

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

    model_config = ConfigDict(populate_by_name=True)

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

    to: Optional[str] = None
    cc: Optional[str] = None
    subject: Optional[str] = None
    version_status: Optional[str] = Field(
        default=None,
        description="Suggested version status (maps to draft version_status).",
    )
    links: Optional[list[DraftNoteLink]] = None


class NoteQCResult(BaseModel):
    """Outcome of running one check against a draft."""

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

    user_email: str


class RunQCChecksResponse(BaseModel):
    """QC results for one draft note."""

    results: list[NoteQCResult]


DEFAULT_ACTION_ITEM_CHECK = NoteQCCheckCreate(
    name="Action Item Check",
    prompt=(
        "Review the transcript and note below. "
        "If the transcript mentions an action item, task, or decision that is NOT "
        "reflected in the note, report it. Otherwise respond with passed=true."
    ),
    severity="warning",
    enabled=True,
)
