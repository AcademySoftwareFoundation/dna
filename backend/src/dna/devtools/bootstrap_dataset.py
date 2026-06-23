"""Bootstrap a standalone demo dataset into local development stores.

This script seeds:
- the mock prodtrack SQLite database used by the mock provider
- MongoDB collections used by /generate-note and transcript viewing

"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from pymongo import AsyncMongoClient

from dna.models.stored_segment import generate_segment_id

BACKEND_ROOT = Path(__file__).resolve().parents[3]


DEFAULT_SQLITE_PATH = BACKEND_ROOT / ".local" / "mock.db"
SCHEMA_PATH = (
    Path(__file__).resolve().parents[1]
    / "prodtrack_providers"
    / "mock_data"
    / "schema.sql"
)


@dataclass(slots=True)
class DatasetPlan:
    dataset_name: str
    dataset_path: Path
    project_id: int
    project_code: str
    project_name: str
    playlist: DatasetPlaylist
    users: list[DatasetUser]
    shots: list[DatasetShot]
    tasks: list[DatasetTask]
    versions: list[DatasetVersion]
    segments: list[DatasetSegment]
    in_review_version_id: int
    sample_user_email: str
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class DatasetPlaylist:
    id: int
    code: str
    description: str
    created_at: str
    updated_at: str
    version_ids: list[int]


@dataclass(slots=True)
class DatasetSegment:
    segment_id: str
    playlist_id: int
    version_id: int
    speaker: str
    text: str
    absolute_start_time: str
    absolute_end_time: str


@dataclass(slots=True)
class DatasetShot:
    id: int
    name: str
    description: str


@dataclass(slots=True)
class DatasetTask:
    id: int
    name: str
    status: str
    pipeline_step_name: str
    entity_type: str
    entity_id: int


@dataclass(slots=True)
class DatasetUser:
    id: int
    name: str
    email: str
    login: str


@dataclass(slots=True)
class DatasetVersion:
    id: int
    source_id: int
    code: str
    description: str
    status: str
    created_at: Optional[str]
    updated_at: Optional[str]
    user_id: Optional[int]
    shot_id: Optional[int]
    task_id: Optional[int]
    thumbnail: Optional[str]
    movie_path: Optional[str] = None
    frame_path: Optional[str] = None


@dataclass(slots=True)
class InReviewEvent:
    ts: str
    review_item: str


def _assign_utterances_to_in_review_events(
    utterances: list[dict[str, Any]], events: list[InReviewEvent]
) -> list[tuple[str, int, dict[str, Any]]]:
    event_offsets = [_parse_hms(event.ts) for event in events]
    assignments: list[tuple[str, int, dict[str, Any]]] = []

    event_index = -1
    for utterance_index, utterance in enumerate(utterances):
        utterance_ts = utterance.get("ts")
        if not isinstance(utterance_ts, str) or not utterance_ts:
            raise ValueError(
                f"transcript.json utterance at index {utterance_index} is missing a valid 'ts'."
            )

        utterance_offset = _parse_hms(utterance_ts)
        while (
            event_index + 1 < len(event_offsets)
            and event_offsets[event_index + 1] <= utterance_offset
        ):
            event_index += 1

        if event_index < 0:
            continue

        assignments.append(
            (events[event_index].review_item, utterance_index, utterance)
        )

    return assignments


def _build_dataset_plan(dataset_path: Path) -> DatasetPlan:
    session_path = dataset_path / "session.json"
    shotgrid_path = dataset_path / "shotgrid_data.json"
    transcript_path = dataset_path / "transcript.json"

    for required_path in (session_path, shotgrid_path, transcript_path):
        if not required_path.exists():
            raise FileNotFoundError(f"Required dataset file not found: {required_path}")

    session = json.loads(session_path.read_text())
    shotgrid_data = json.loads(shotgrid_path.read_text())
    transcript_data = json.loads(transcript_path.read_text())
    in_review_events = _load_in_review_events(dataset_path)

    warnings: list[str] = []

    session_id = str(session.get("session_id") or dataset_path.name)
    transcript_session_id = transcript_data.get("session_id")
    if transcript_session_id and transcript_session_id != session_id:
        raise ValueError(
            f"session.json session_id ({session_id}) does not match transcript.json session_id ({transcript_session_id})."
        )

    project = session.get("project") or {}
    project_code = project.get("code") or "DEMO"
    project_name = project.get("name") or "Demo Project"
    project_id = _stable_id(session_id, "project", f"{project_code}:{project_name}")

    version_rows = shotgrid_data.get("versions") or []
    versions_by_review_name = {
        row.get("entity", {}).get("name"): row
        for row in version_rows
        if row.get("entity", {}).get("name")
    }

    review_set = session.get("review_set") or []
    if not review_set:
        raise ValueError("session.json does not contain a review_set.")
    for event in in_review_events:
        if event.review_item not in review_set:
            raise ValueError(
                f"in_review.json review_item {event.review_item} is not present in session.json review_set."
            )

    session_dt_raw = session.get("date_utc")
    if not session_dt_raw:
        raise ValueError("session.json does not contain date_utc.")
    session_dt = datetime.fromisoformat(session_dt_raw.replace("Z", "+00:00"))

    utterance_assignments = _assign_utterances_to_in_review_events(
        transcript_data.get("utterances") or [], in_review_events
    )

    users_by_name: dict[str, DatasetUser] = {}

    def ensure_user(name: str, hint: str) -> DatasetUser:
        existing = users_by_name.get(name)
        if existing:
            return existing
        user = DatasetUser(
            id=_stable_id(session_id, "user", hint),
            name=name,
            email=f"{_slugify(name)}@example.com",
            login=_slugify(name),
        )
        users_by_name[name] = user
        return user

    for participant in session.get("participants") or []:
        participant_name = participant.get("name")
        if participant_name:
            ensure_user(participant_name, f"participant:{participant_name}")

    shots: list[DatasetShot] = []
    tasks: list[DatasetTask] = []
    versions: list[DatasetVersion] = []
    segments: list[DatasetSegment] = []
    version_ids_for_playlist: list[int] = []

    version_id_by_review_name: dict[str, int] = {}

    for review_name in review_set:
        version_row = versions_by_review_name.get(review_name)
        if version_row is None:
            raise ValueError(
                f"No version metadata found in shotgrid_data.json for review_set item {review_name}."
            )

        shot_row = version_row.get("entity") or {}
        shot_id = _stable_id(session_id, "shot", str(shot_row.get("id") or review_name))
        task_row = version_row.get("sg_task") or {}
        task_id = _stable_id(
            session_id,
            "task",
            str(
                task_row.get("id") or f"{review_name}:{task_row.get('name') or 'task'}"
            ),
        )
        version_id = _stable_id(
            session_id, "version", str(version_row.get("id") or version_row.get("code"))
        )
        version_user_row = version_row.get("user") or {}
        version_user = None
        if version_user_row.get("name"):
            version_user = ensure_user(
                version_user_row["name"],
                f"shotgrid-user:{version_user_row.get('id') or version_user_row['name']}",
            )

        shots.append(
            DatasetShot(
                id=shot_id,
                name=shot_row.get("name") or review_name,
                description=version_row.get("description") or "",
            )
        )
        tasks.append(
            DatasetTask(
                id=task_id,
                name=task_row.get("name") or "Review",
                status=version_row.get("sg_status_list") or "rev",
                pipeline_step_name=task_row.get("step")
                or task_row.get("name")
                or "Review",
                entity_type="Shot",
                entity_id=shot_id,
            )
        )
        versions.append(
            DatasetVersion(
                id=version_id,
                source_id=int(version_row.get("id") or 0),
                code=version_row.get("code") or review_name,
                description=version_row.get("description") or "",
                status=version_row.get("sg_status_list") or "rev",
                created_at=version_row.get("created_at"),
                updated_at=version_row.get("created_at"),
                user_id=version_user.id if version_user else None,
                shot_id=shot_id,
                task_id=task_id,
                thumbnail=None,
            )
        )
        version_id_by_review_name[review_name] = version_id
        version_ids_for_playlist.append(version_id)

    if not versions:
        raise ValueError("No versions could be built from the dataset review_set.")

    playlist_id = _stable_id(session_id, "playlist", session_id)
    playlist = DatasetPlaylist(
        id=playlist_id,
        code=session_id,
        description=f"Seeded demo dataset for {project_name}",
        created_at=_isoformat_utc(session_dt),
        updated_at=_isoformat_utc(session_dt),
        version_ids=version_ids_for_playlist,
    )

    final_review_item = in_review_events[-1].review_item
    in_review_version_id = version_id_by_review_name.get(final_review_item)
    if in_review_version_id is None:
        raise ValueError(
            f"No version metadata found for final in_review item {final_review_item}."
        )

    utterances = transcript_data.get("utterances") or []
    for review_name, utterance_index, utterance in utterance_assignments:
        version_id = version_id_by_review_name.get(review_name)
        if version_id is None:
            raise ValueError(
                f"No version metadata found in shotgrid_data.json for review item {review_name}."
            )

        start_offset = _parse_hms(utterance["ts"])
        next_offset = None
        if utterance_index + 1 < len(utterances):
            next_offset = _parse_hms(utterances[utterance_index + 1]["ts"])
        if next_offset is None or next_offset <= start_offset:
            next_offset = start_offset + 5

        start_dt = session_dt + timedelta(seconds=start_offset)
        end_dt = session_dt + timedelta(seconds=next_offset)
        start_iso = _isoformat_utc(start_dt)
        end_iso = _isoformat_utc(end_dt)
        segments.append(
            DatasetSegment(
                segment_id=generate_segment_id(playlist.id, version_id, start_iso),
                playlist_id=playlist.id,
                version_id=version_id,
                speaker=utterance.get("speaker") or "Unknown",
                text=(utterance.get("text") or "").strip(),
                absolute_start_time=start_iso,
                absolute_end_time=end_iso,
            )
        )

    sample_user = users_by_name.get("Cameron") or next(
        iter(users_by_name.values()), None
    )
    if sample_user is None:
        sample_user = ensure_user("Demo User", "fallback-demo-user")

    deduped_shots = list({shot.id: shot for shot in shots}.values())
    deduped_tasks = list({task.id: task for task in tasks}.values())
    deduped_versions = list({version.id: version for version in versions}.values())
    deduped_users = list({user.id: user for user in users_by_name.values()}.values())

    return DatasetPlan(
        dataset_name=session_id,
        dataset_path=dataset_path,
        project_id=project_id,
        project_code=project_code,
        project_name=project_name,
        playlist=playlist,
        users=sorted(deduped_users, key=lambda user: user.name),
        shots=sorted(deduped_shots, key=lambda shot: shot.name),
        tasks=sorted(deduped_tasks, key=lambda task: task.name),
        versions=deduped_versions,
        segments=segments,
        in_review_version_id=in_review_version_id,
        sample_user_email=sample_user.email,
        warnings=warnings,
    )


def _find_default_dataset_path() -> Optional[Path]:
    candidates = [
        Path.cwd() / "sample_dailies_dataset",
        BACKEND_ROOT / "sample_dailies_dataset",
        BACKEND_ROOT.parent / "sample_dailies_dataset",
    ]

    dev_datasets_dir = BACKEND_ROOT / "dev_datasets"
    if dev_datasets_dir.exists():
        candidates.extend(
            sorted(path for path in dev_datasets_dir.iterdir() if path.is_dir())
        )

    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if _is_dataset_dir(resolved):
            return resolved
    return None


def _format_plan_summary(plan: DatasetPlan) -> str:
    version_lookup = {version.id: version for version in plan.versions}
    segment_counts: dict[int, int] = {version.id: 0 for version in plan.versions}
    for segment in plan.segments:
        segment_counts[segment.version_id] = (
            segment_counts.get(segment.version_id, 0) + 1
        )

    lines = [
        f"Dataset: {plan.dataset_name}",
        f"Path: {plan.dataset_path}",
        f"Project: {plan.project_name} ({plan.project_code})",
        f"Playlist: {plan.playlist.code} [id={plan.playlist.id}]",
        f"Users: {len(plan.users)}",
        f"Shots: {len(plan.shots)}",
        f"Tasks: {len(plan.tasks)}",
        f"Versions: {len(plan.versions)}",
        f"Segments: {len(plan.segments)}",
        f"Sample user email: {plan.sample_user_email}",
        f"In-review version id: {plan.in_review_version_id}",
        "",
        "Version transcript coverage:",
    ]

    for version in plan.versions:
        lines.append(
            f"- {version.code} [id={version.id}]: {segment_counts.get(version.id, 0)} segments"
        )

    lines.extend(
        [
            "",
            "Example generate-note payload:",
            json.dumps(
                {
                    "playlist_id": plan.playlist.id,
                    "version_id": plan.in_review_version_id,
                    "user_email": plan.sample_user_email,
                },
                indent=2,
            ),
        ]
    )

    if plan.warnings:
        lines.append("")
        lines.append("Warnings:")
        lines.extend(f"- {warning}" for warning in plan.warnings)

    return "\n".join(lines)


def _is_dataset_dir(path: Path) -> bool:
    return all(
        (path / name).exists()
        for name in (
            "session.json",
            "shotgrid_data.json",
            "transcript.json",
            "in_review.json",
        )
    )


def _isoformat_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_in_review_events(dataset_path: Path) -> list[InReviewEvent]:
    in_review_path = dataset_path / "in_review.json"
    if not in_review_path.exists():
        raise FileNotFoundError(f"Required dataset file not found: {in_review_path}")

    raw_events = json.loads(in_review_path.read_text())
    if not isinstance(raw_events, list) or not raw_events:
        raise ValueError("in_review.json must contain a non-empty list of events.")

    events: list[InReviewEvent] = []
    previous_offset: Optional[int] = None
    for index, raw_event in enumerate(raw_events):
        if not isinstance(raw_event, dict):
            raise ValueError(
                f"in_review.json event at index {index} must be an object."
            )

        ts = raw_event.get("ts")
        review_item = raw_event.get("review_item")
        if not isinstance(ts, str) or not ts:
            raise ValueError(
                f"in_review.json event at index {index} is missing a valid 'ts'."
            )
        if not isinstance(review_item, str) or not review_item:
            raise ValueError(
                f"in_review.json event at index {index} is missing a valid 'review_item'."
            )

        offset = _parse_hms(ts)
        if previous_offset is not None and offset <= previous_offset:
            raise ValueError(
                "in_review.json events must be strictly ordered by ascending timestamp."
            )
        previous_offset = offset
        events.append(InReviewEvent(ts=ts, review_item=review_item))

    return events


def _parse_hms(value: str) -> int:
    hours, minutes, seconds = value.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds)


async def _seed_mongo(plan: DatasetPlan) -> None:
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    mongo_db_name = os.getenv("MONGODB_DB", "dna")
    client: AsyncMongoClient[Any] = AsyncMongoClient(mongo_url)
    try:
        db = client[mongo_db_name]
        now = datetime.now(timezone.utc)

        await db.playlist_metadata.find_one_and_update(
            {"playlist_id": plan.playlist.id},
            {
                "$set": {
                    "in_review": plan.in_review_version_id,
                    "transcription_paused": False,
                },
                "$setOnInsert": {"playlist_id": plan.playlist.id},
            },
            upsert=True,
        )

        for segment in plan.segments:
            await db.segments.find_one_and_update(
                {
                    "segment_id": segment.segment_id,
                    "playlist_id": segment.playlist_id,
                    "version_id": segment.version_id,
                },
                {
                    "$set": {
                        "text": segment.text,
                        "speaker": segment.speaker,
                        "absolute_start_time": segment.absolute_start_time,
                        "absolute_end_time": segment.absolute_end_time,
                        "updated_at": now,
                    },
                    "$setOnInsert": {
                        "created_at": now,
                        "segment_id": segment.segment_id,
                        "playlist_id": segment.playlist_id,
                        "version_id": segment.version_id,
                    },
                },
                upsert=True,
            )

        await db.user_settings.find_one_and_update(
            {"user_email": plan.sample_user_email},
            {
                "$set": {"updated_at": now},
                "$setOnInsert": {
                    "created_at": now,
                    "user_email": plan.sample_user_email,
                    "note_prompt": "",
                    "regenerate_on_version_change": False,
                    "regenerate_on_transcript_update": False,
                },
            },
            upsert=True,
        )
    finally:
        await client.close()


def _seed_sqlite(plan: DatasetPlan, db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if not os.access(db_path.parent, os.W_OK):
        raise PermissionError(
            "SQLite output directory is not writable: "
            f"{db_path.parent}. Use --output-sqlite-path to choose a writable path, "
            "or fix the directory permissions."
        )

    try:
        conn = sqlite3.connect(db_path)
    except sqlite3.OperationalError as exc:
        raise RuntimeError(
            f"Could not open SQLite database at {db_path}: {exc}. "
            "Use --output-sqlite-path to choose a writable path, or fix the directory permissions."
        ) from exc

    try:
        conn.executescript(SCHEMA_PATH.read_text())

        conn.execute(
            "INSERT OR REPLACE INTO projects (id, name) VALUES (?, ?)",
            (plan.project_id, plan.project_name),
        )

        for user in plan.users:
            conn.execute(
                "INSERT OR REPLACE INTO users (id, name, email, login) VALUES (?, ?, ?, ?)",
                (user.id, user.name, user.email, user.login),
            )
            conn.execute(
                "INSERT OR IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)",
                (plan.project_id, user.id),
            )

        for shot in plan.shots:
            conn.execute(
                "INSERT OR REPLACE INTO shots (id, name, description, project_id) VALUES (?, ?, ?, ?)",
                (shot.id, shot.name, shot.description, plan.project_id),
            )

        for task in plan.tasks:
            conn.execute(
                """INSERT OR REPLACE INTO tasks (
                       id, name, status, pipeline_step_id, pipeline_step_name,
                       project_id, entity_type, entity_id
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    task.id,
                    task.name,
                    task.status,
                    None,
                    task.pipeline_step_name,
                    plan.project_id,
                    task.entity_type,
                    task.entity_id,
                ),
            )

        for version in plan.versions:
            conn.execute(
                """INSERT OR REPLACE INTO versions (
                       id, name, description, status, user_id, created_at, updated_at,
                       movie_path, frame_path, thumbnail, project_id, entity_type, entity_id, task_id
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    version.id,
                    version.code,
                    version.description,
                    version.status,
                    version.user_id,
                    version.created_at,
                    version.updated_at,
                    version.movie_path,
                    version.frame_path,
                    version.thumbnail,
                    plan.project_id,
                    "Shot" if version.shot_id else None,
                    version.shot_id,
                    version.task_id,
                ),
            )

        conn.execute(
            "DELETE FROM playlist_versions WHERE playlist_id = ?", (plan.playlist.id,)
        )
        conn.execute(
            """INSERT OR REPLACE INTO playlists (
                   id, code, description, project_id, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?)""",
            (
                plan.playlist.id,
                plan.playlist.code,
                plan.playlist.description,
                plan.project_id,
                plan.playlist.created_at,
                plan.playlist.updated_at,
            ),
        )
        for version_id in plan.playlist.version_ids:
            conn.execute(
                "INSERT OR IGNORE INTO playlist_versions (playlist_id, version_id) VALUES (?, ?)",
                (plan.playlist.id, version_id),
            )

        status_codes = sorted({version.status or "rev" for version in plan.versions})
        for status_code in status_codes:
            conn.execute(
                "INSERT OR REPLACE INTO version_statuses (code, name, project_id) VALUES (?, ?, ?)",
                (status_code, status_code.upper(), plan.project_id),
            )

        conn.commit()
    finally:
        conn.close()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "user"


def _stable_id(dataset_name: str, category: str, source_key: str) -> int:
    digest = hashlib.sha256(
        f"{dataset_name}:{category}:{source_key}".encode("utf-8")
    ).hexdigest()
    return 100_000_000 + int(digest[:7], 16)


async def _run_import(plan: DatasetPlan, sqlite_path: Path) -> None:
    _seed_sqlite(plan, sqlite_path)
    await _seed_mongo(plan)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bootstrap a standalone demo dataset into local dev stores.",
    )
    parser.add_argument(
        "dataset_path",
        nargs="?",
        type=Path,
        default=None,
        help=(
            "Path to a dataset directory containing session.json, shotgrid_data.json, "
            "transcript.json, and in_review.json. If omitted, the script searches common dataset locations."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse the dataset and print what would be seeded without writing anything.",
    )
    parser.add_argument(
        "--output-sqlite-path",
        type=Path,
        default=DEFAULT_SQLITE_PATH,
        help=(
            "SQLite DB path to write for the mock prodtrack provider "
            "(default: backend/.local/mock.db)"
        ),
    )
    args = parser.parse_args()

    try:
        dataset_path = (
            args.dataset_path.resolve()
            if args.dataset_path is not None
            else _find_default_dataset_path()
        )
        if dataset_path is None:
            raise FileNotFoundError(
                "Could not find a default dataset directory. Pass dataset_path explicitly."
            )
        plan = _build_dataset_plan(dataset_path)
        print(_format_plan_summary(plan))
        if args.dry_run:
            return 0
        sqlite_path = args.output_sqlite_path
        if not sqlite_path.is_absolute():
            sqlite_path = (BACKEND_ROOT / sqlite_path).resolve()
        asyncio.run(_run_import(plan, sqlite_path))
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print("")
    print(f"Seeded SQLite: {sqlite_path}")
    print(
        f"Seeded MongoDB URL: {os.getenv('MONGODB_URL', 'mongodb://localhost:27017')}"
    )
    print(
        "Reminder: set MOCK_PRODTRACK_DB_PATH=/app/.local/mock.db in "
        "backend/docker-compose.local.yml and restart the stack if you want "
        "the app to use this bootstrapped SQLite DB."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
