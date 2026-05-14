"""Run user-defined QC checks against a draft note using the LLM + prodtrack tools."""

from __future__ import annotations

import json
from typing import Any, cast

from dna.llm_providers.llm_provider_base import LLMProviderBase
from dna.models.draft_note import DraftNote
from dna.models.entity import Version
from dna.models.qc_check import (
    NoteQCCheck,
    NoteQCLLMOutput,
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


def _draft_note_payload(draft: DraftNote) -> dict[str, Any]:
    return {
        "content": draft.content or "",
        "subject": draft.subject or "",
        "to": draft.to or "",
        "cc": draft.cc or "",
        "version_status": draft.version_status or "",
        "links": [link.model_dump() for link in draft.links],
    }


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
        "You may call tools to look up production tracker entities when needed.\n\n"
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
        out = await llm_provider.generate_structured_with_tools(
            system_prompt=system_prompt,
            user_message=user_message,
            tools=QC_TOOL_DEFINITIONS,
            tool_executor=tool_executor,
            response_model=NoteQCLLMOutput,
            max_iterations=5,
            temperature=0.2,
        )
    except Exception as exc:  # pragma: no cover - network/provider errors
        return _failed_run_result(
            check,
            "QC check failed to run.",
            str(exc),
        )

    return NoteQCResult(
        check_id=check.id,
        check_name=check.name,
        severity=check.severity,
        passed=out.passed,
        issue=None if out.passed else (out.issue or "Check did not pass."),
        evidence=None if out.passed else out.evidence,
        note_suggestion=None if out.passed else out.note_suggestion,
        attribute_suggestion=None if out.passed else out.attribute_suggestion,
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
