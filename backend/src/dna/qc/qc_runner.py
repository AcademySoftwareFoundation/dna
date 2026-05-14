"""Run user-defined QC checks against a draft note using the LLM + prodtrack tools."""

from __future__ import annotations

import json
import re
from typing import Any, Optional, cast

from dna.llm_providers.llm_provider_base import LLMProviderBase
from dna.models.entity import Version
from dna.models.qc_check import (
    NoteQCAttributeSuggestion,
    NoteQCCheck,
    NoteQCResult,
)
from dna.prodtrack_providers.prodtrack_provider_base import ProdtrackProviderBase

QC_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_entities",
            "description": (
                "Search the production tracker for entities by text query. "
                "Use to find users, shots, assets, versions, tasks, or playlists."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "entity_types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Lowercase DNA types, e.g. user, shot, asset, version, "
                            "task, playlist"
                        ),
                    },
                    "project_id": {"type": "integer"},
                },
                "required": ["query", "entity_types"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_entity",
            "description": (
                "Fetch a single entity from the production tracker by type and id."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entity_type": {
                        "type": "string",
                        "description": "Lowercase DNA type, e.g. version, shot, user",
                    },
                    "entity_id": {"type": "integer"},
                },
                "required": ["entity_type", "entity_id"],
            },
        },
    },
]

QC_JSON_INSTRUCTIONS = """
Your final message MUST be a single JSON object only (no markdown fences), with keys:
- "passed": boolean, true if the check passes.
- "issue": string, one sentence why the check failed (empty or omit if passed).
- "evidence": string, detailed explanation and evidence (empty or omit if passed).
- "noteSuggestion": string, full suggested note body if failed; if passed, may be empty.
- "attributeSuggestion": object or null; optional fields "to", "cc", "subject",
  "version_status", "links" (array of objects with entity_type, entity_id, entity_name).
"""


def _draft_note_payload(draft: DraftNote) -> dict[str, Any]:
    return {
        "content": draft.content or "",
        "subject": draft.subject or "",
        "to": draft.to or "",
        "cc": draft.cc or "",
        "version_status": draft.version_status or "",
        "links": [link.model_dump() for link in draft.links],
    }


def _extract_json_object(text: str) -> dict[str, Any]:
    """Parse the model's final JSON object, tolerating markdown fences and trailing text."""
    raw = text.strip()
    fence = re.match(
        r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", raw, re.DOTALL | re.IGNORECASE
    )
    if fence:
        raw = fence.group(1).strip()
    else:
        raw = re.sub(r"^```(?:json)?\s*", "", raw, count=1, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```\s*$", "", raw, count=1)
        raw = raw.strip()
    raw = raw.lstrip("\ufeff")
    if not raw.startswith("{"):
        start = raw.find("{")
        if start == -1:
            raise ValueError("No JSON object found in QC response.")
        raw = raw[start:]
    decoder = json.JSONDecoder()
    data, _end = decoder.raw_decode(raw)
    if not isinstance(data, dict):
        raise TypeError("QC response JSON root must be an object.")
    return cast(dict[str, Any], data)


def _normalize_keys(d: dict[str, Any]) -> dict[str, Any]:
    return {str(k).strip().lower(): v for k, v in d.items()}


def _split_note_suggestion_payload(val: Any) -> tuple[Optional[str], dict[str, Any]]:
    """LLM may return noteSuggestion as plain text or as a structured draft object."""
    if val is None:
        return None, {}
    if isinstance(val, str):
        s = val.strip()
        return (s if s else None), {}
    if not isinstance(val, dict):
        return None, {}
    nested = _normalize_keys(val)
    body: Optional[str] = None
    c = nested.get("content")
    if isinstance(c, str) and c.strip():
        body = c.strip()
    extra: dict[str, Any] = {}
    for key in ("subject", "to", "cc", "version_status", "links"):
        if key not in nested:
            continue
        v = nested[key]
        if v is None or v == "" or v == []:
            continue
        extra[key] = v
    return body, extra


def _parse_llm_payload(
    text: str,
) -> tuple[bool, Optional[str], Optional[str], Optional[str], Optional[dict[str, Any]]]:
    data = _extract_json_object(text)
    norm = _normalize_keys(data)
    passed = bool(norm.get("passed", False))
    issue = norm.get("issue")
    evidence = norm.get("evidence")
    note_raw = norm.get("notesuggestion") or norm.get("note_suggestion")
    body, extra_from_note = _split_note_suggestion_payload(note_raw)
    attr = norm.get("attributesuggestion") or norm.get("attribute_suggestion")
    attr_dict: Optional[dict[str, Any]] = None
    merged: dict[str, Any] = dict(extra_from_note)
    if isinstance(attr, dict):
        merged.update(attr)
    if merged:
        attr_dict = merged
    return (
        passed,
        (str(issue) if issue is not None else None),
        (str(evidence) if evidence is not None else None),
        body,
        attr_dict,
    )


def _make_tool_executor(
    prodtrack_provider: ProdtrackProviderBase,
    default_project_id: int | None,
) -> Any:
    async def tool_executor(name: str, args: dict[str, Any]) -> str:
        if name == "search_entities":
            project_id = args.get("project_id")
            if project_id is None:
                project_id = default_project_id
            results = prodtrack_provider.search(
                query=args["query"],
                entity_types=args["entity_types"],
                project_id=project_id,
            )
            return json.dumps(results)
        if name == "get_entity":
            entity = prodtrack_provider.get_entity(
                entity_type=str(args["entity_type"]).lower(),
                entity_id=int(args["entity_id"]),
                resolve_links=False,
            )
            return json.dumps(entity.model_dump(mode="json"))
        return json.dumps({"error": f"Unknown tool: {name}"})

    return tool_executor


def _failed_run_result(
    check: NoteQCCheck, issue: str, evidence: str | None = None
) -> NoteQCResult:
    return NoteQCResult(
        check_id=check.id,
        check_name=check.name,
        severity=check.severity,
        passed=False,
        issue=issue,
        evidence=evidence,
        note_suggestion=None,
        attribute_suggestion=None,
    )


async def _run_one_check(
    check: NoteQCCheck,
    draft: DraftNote,
    transcript_text: str,
    version: Version,
    prodtrack_provider: ProdtrackProviderBase,
    llm_provider: LLMProviderBase,
) -> NoteQCResult:
    version_context = ProdtrackProviderBase.build_version_context(version)
    draft_json = json.dumps(_draft_note_payload(draft), indent=2)
    project_id: int | None = None
    if version.project and isinstance(version.project, dict):
        pid = version.project.get("id")
        if isinstance(pid, int):
            project_id = pid

    system_prompt = (
        "You are a quality-check assistant for VFX dailies notes. "
        "Use the provided version context, transcript, and draft note. "
        "Follow the user's check instructions in the user message. "
        "You may call tools to look up production tracker entities when needed.\n"
        f"{QC_JSON_INSTRUCTIONS}\n\n"
        "--- Version context ---\n"
        f"{version_context}\n\n"
        "--- Transcript ---\n"
        f"{transcript_text}\n\n"
        "--- Current draft note (JSON) ---\n"
        f"{draft_json}\n"
    )
    user_message = f"Check name: {check.name}\n\nCheck instructions:\n{check.prompt}"

    tool_executor = _make_tool_executor(prodtrack_provider, project_id)
    try:
        raw = await llm_provider.generate_with_tools(
            system_prompt=system_prompt,
            user_message=user_message,
            tools=QC_TOOL_DEFINITIONS,
            tool_executor=tool_executor,
            max_iterations=5,
            temperature=0.2,
        )
    except Exception as exc:  # pragma: no cover - network/provider errors
        return _failed_run_result(
            check,
            "QC check failed to run.",
            str(exc),
        )

    if not raw.strip():
        return _failed_run_result(
            check,
            "QC check returned an empty response.",
            None,
        )

    try:
        passed, issue, evidence, note_suggestion, attr_raw = _parse_llm_payload(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        return _failed_run_result(
            check,
            "Could not parse QC response.",
            f"Parse error: {exc}. Raw (truncated): {raw[:500]}",
        )

    attr_model: Optional[NoteQCAttributeSuggestion] = None
    if attr_raw:
        try:
            attr_model = NoteQCAttributeSuggestion.model_validate(attr_raw)
        except Exception:
            attr_model = None

    return NoteQCResult(
        check_id=check.id,
        check_name=check.name,
        severity=check.severity,
        passed=passed,
        issue=None if passed else (issue or "Check did not pass."),
        evidence=None if passed else evidence,
        note_suggestion=None if passed else note_suggestion,
        attribute_suggestion=None if passed else attr_model,
    )


async def run_qc_checks_for_draft(
    checks: list[NoteQCCheck],
    draft: DraftNote,
    transcript_text: str,
    version: Version,
    prodtrack_provider: ProdtrackProviderBase,
    llm_provider: LLMProviderBase,
) -> list[NoteQCResult]:
    """Run all enabled checks sequentially and return per-check results."""
    version = cast(Version, version)
    results: list[NoteQCResult] = []
    for check in checks:
        if not check.enabled:
            continue
        results.append(
            await _run_one_check(
                check,
                draft,
                transcript_text,
                version,
                prodtrack_provider,
                llm_provider,
            )
        )
    return results
