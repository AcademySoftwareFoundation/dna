import asyncio
import json
import sqlite3
import sys
from os import PathLike, fsdecode
from pathlib import Path
from typing import Any

import pytest

import dna.devtools.bootstrap_dataset as bootstrap_dataset
from dna.devtools.bootstrap_dataset import (
    _assign_utterances_to_in_review_events,
    _build_dataset_plan,
    _find_default_dataset_path,
    _format_plan_summary,
    _is_dataset_dir,
    _load_in_review_events,
    _parse_hms,
    _seed_mongo,
    _seed_sqlite,
    _slugify,
    _stable_id,
)


def _sample_dataset_path(tmp_path: Path) -> Path:
    dataset_path = tmp_path / "sample_dailies_dataset"
    dataset_path.mkdir(parents=True)

    (dataset_path / "session.json").write_text(
        json.dumps(
            {
                "session_id": "demo_dailies_2025_10_02",
                "project": {"code": "HSM", "name": "Hyperspace Mini"},
                "date_utc": "2025-10-02T16:00:00Z",
                "participants": [
                    {"name": "Cameron", "role": "Supervisor"},
                    {"name": "Sonia", "role": "Lighting"},
                    {"name": "Lars", "role": "Compositor"},
                ],
                "review_set": ["HSM_SATL_0010", "HSM_SATL_0015"],
            }
        )
    )
    (dataset_path / "shotgrid_data.json").write_text(
        json.dumps(
            {
                "versions": [
                    {
                        "id": 6720,
                        "code": "HSM_SATL_0010_TD",
                        "entity": {"id": 1162, "name": "HSM_SATL_0010", "type": "Shot"},
                        "sg_status_list": "rev",
                        "description": "Lighting pass",
                        "created_at": "2016-08-15T14:34:22-04:00",
                        "user": {"id": 123, "name": "Sonia Demo", "type": "HumanUser"},
                        "sg_task": {
                            "id": 5632,
                            "name": "Lighting",
                            "type": "Task",
                            "step": "Light",
                        },
                    },
                    {
                        "id": 6722,
                        "code": "HSM_SATL_0015_TD",
                        "entity": {"id": 1163, "name": "HSM_SATL_0015", "type": "Shot"},
                        "sg_status_list": "rev",
                        "description": "Comp pass",
                        "created_at": "2016-08-15T14:34:23-04:00",
                        "user": {"id": 122, "name": "Lars Demo", "type": "HumanUser"},
                        "sg_task": {
                            "id": 5636,
                            "name": "Compositing",
                            "type": "Task",
                            "step": "Comp",
                        },
                    },
                ]
            }
        )
    )
    (dataset_path / "transcript.json").write_text(
        json.dumps(
            {
                "session_id": "demo_dailies_2025_10_02",
                "utterances": [
                    {
                        "ts": "00:00:00",
                        "speaker": "Cameron",
                        "text": "Let's start with HSM SATL 0010.",
                    },
                    {
                        "ts": "00:00:10",
                        "speaker": "Sonia",
                        "text": "The sun reflection still needs work.",
                    },
                    {
                        "ts": "00:00:20",
                        "speaker": "Cameron",
                        "text": "Next up is HSM SATL 0015 for comp review.",
                    },
                    {
                        "ts": "00:00:30",
                        "speaker": "Lars",
                        "text": "I want to reduce the visor reflection.",
                    },
                ],
            }
        )
    )
    (dataset_path / "in_review.json").write_text(
        json.dumps(
            [
                {"ts": "00:00:16", "review_item": "HSM_SATL_0010"},
                {"ts": "00:00:21", "review_item": "HSM_SATL_0015"},
            ]
        )
    )

    return dataset_path


def test_build_dataset_plan_from_sample_dataset(tmp_path: Path):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))

    assert plan.project_name == "Hyperspace Mini"
    assert plan.project_code == "HSM"
    assert plan.playlist.code == "demo_dailies_2025_10_02"
    assert len(plan.versions) == 2
    assert len(plan.segments) > 0
    assert plan.sample_user_email == "cameron@example.com"
    assert plan.warnings == []
    assert plan.in_review_version_id == plan.versions[1].id


def test_build_dataset_plan_assigns_segments_to_each_review_version(tmp_path: Path):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))

    segment_counts: dict[int, int] = {version.id: 0 for version in plan.versions}
    for segment in plan.segments:
        segment_counts[segment.version_id] += 1

    assert all(count > 0 for count in segment_counts.values())


def test_format_plan_summary_contains_generate_note_payload(tmp_path: Path):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))

    summary = _format_plan_summary(plan)

    assert "Example generate-note payload" in summary
    assert str(plan.playlist.id) in summary
    assert plan.sample_user_email in summary


def test_seed_sqlite_writes_playlist_and_versions(tmp_path: Path):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))
    db_path = tmp_path / "seeded.db"

    _seed_sqlite(plan, db_path)

    conn = sqlite3.connect(db_path)
    try:
        playlist_row = conn.execute(
            "SELECT code FROM playlists WHERE id = ?", (plan.playlist.id,)
        ).fetchone()
        version_count = conn.execute(
            "SELECT COUNT(*) FROM playlist_versions WHERE playlist_id = ?",
            (plan.playlist.id,),
        ).fetchone()[0]
        user_row = conn.execute(
            "SELECT email FROM users WHERE email = ?", (plan.sample_user_email,)
        ).fetchone()
    finally:
        conn.close()

    assert playlist_row == (plan.playlist.code,)
    assert version_count == len(plan.playlist.version_ids)
    assert user_row == (plan.sample_user_email,)


def test_seed_sqlite_rejects_unwritable_output_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))
    db_path = tmp_path / "locked" / "seeded.db"
    db_path.parent.mkdir()

    original_access = bootstrap_dataset.os.access

    def fake_access(
        path: str | bytes | PathLike[str] | PathLike[bytes], mode: int
    ) -> bool:
        if Path(fsdecode(path)) == db_path.parent and mode == bootstrap_dataset.os.W_OK:
            return False
        return original_access(path, mode)

    monkeypatch.setattr(bootstrap_dataset.os, "access", fake_access)

    with pytest.raises(
        PermissionError, match="SQLite output directory is not writable"
    ):
        _seed_sqlite(plan, db_path)


def test_build_dataset_plan_rejects_in_review_item_outside_review_set(tmp_path: Path):
    dataset_path = _sample_dataset_path(tmp_path)
    in_review_path = dataset_path / "in_review.json"
    in_review_path.write_text(
        json.dumps(
            [
                {"ts": "00:00:16", "review_item": "HSM_SATL_0010"},
                {"ts": "00:00:21", "review_item": "HSM_SATL_0099"},
            ]
        )
    )

    with pytest.raises(
        ValueError,
        match="in_review.json review_item HSM_SATL_0099 is not present in session.json review_set",
    ):
        _build_dataset_plan(dataset_path)


def test_build_dataset_plan_rejects_missing_version_metadata_for_review_set_item(
    tmp_path: Path,
):
    dataset_path = _sample_dataset_path(tmp_path)
    shotgrid_path = dataset_path / "shotgrid_data.json"
    shotgrid_data = json.loads(shotgrid_path.read_text())
    shotgrid_data["versions"] = shotgrid_data["versions"][:1]
    shotgrid_path.write_text(json.dumps(shotgrid_data))

    with pytest.raises(
        ValueError,
        match="No version metadata found in shotgrid_data.json for review_set item HSM_SATL_0015",
    ):
        _build_dataset_plan(dataset_path)


def test_build_dataset_plan_requires_in_review_json(tmp_path: Path):
    dataset_path = _sample_dataset_path(tmp_path)
    (dataset_path / "in_review.json").unlink()

    with pytest.raises(FileNotFoundError, match="in_review.json"):
        _build_dataset_plan(dataset_path)


@pytest.mark.parametrize(
    ("payload", "match"),
    [
        ([], "non-empty list of events"),
        (["bad-event"], "must be an object"),
        ([{"review_item": "HSM_SATL_0010"}], "missing a valid 'ts'"),
        ([{"ts": "00:00:16"}], "missing a valid 'review_item'"),
        (
            [
                {"ts": "00:00:16", "review_item": "HSM_SATL_0010"},
                {"ts": "00:00:16", "review_item": "HSM_SATL_0015"},
            ],
            "strictly ordered by ascending timestamp",
        ),
    ],
)
def test_load_in_review_events_validates_input(
    tmp_path: Path, payload: object, match: str
):
    dataset_path = tmp_path / "dataset"
    dataset_path.mkdir()
    (dataset_path / "in_review.json").write_text(json.dumps(payload))

    with pytest.raises(ValueError, match=match):
        _load_in_review_events(dataset_path)


def test_assign_utterances_to_in_review_events_skips_prelude_and_requires_ts():
    events = [
        bootstrap_dataset.InReviewEvent(ts="00:00:05", review_item="HSM_SATL_0010")
    ]
    utterances = [
        {"ts": "00:00:00", "text": "intro"},
        {"ts": "00:00:06", "text": "covered"},
    ]

    assignments = _assign_utterances_to_in_review_events(utterances, events)

    assert assignments == [("HSM_SATL_0010", 1, utterances[1])]

    with pytest.raises(ValueError, match="missing a valid 'ts'"):
        _assign_utterances_to_in_review_events([{"text": "bad"}], events)


def test_build_dataset_plan_rejects_mismatched_transcript_session_id(tmp_path: Path):
    dataset_path = _sample_dataset_path(tmp_path)
    transcript_path = dataset_path / "transcript.json"
    transcript = json.loads(transcript_path.read_text())
    transcript["session_id"] = "different_session"
    transcript_path.write_text(json.dumps(transcript))

    with pytest.raises(ValueError, match="does not match transcript.json session_id"):
        _build_dataset_plan(dataset_path)


def test_build_dataset_plan_requires_review_set_and_date_utc(tmp_path: Path):
    dataset_path = _sample_dataset_path(tmp_path)
    session_path = dataset_path / "session.json"
    session = json.loads(session_path.read_text())
    session["review_set"] = []
    session_path.write_text(json.dumps(session))

    with pytest.raises(ValueError, match="does not contain a review_set"):
        _build_dataset_plan(dataset_path)

    dataset_path = _sample_dataset_path(tmp_path / "other")
    session_path = dataset_path / "session.json"
    session = json.loads(session_path.read_text())
    session.pop("date_utc")
    session_path.write_text(json.dumps(session))

    with pytest.raises(ValueError, match="does not contain date_utc"):
        _build_dataset_plan(dataset_path)


def test_build_dataset_plan_falls_back_to_demo_user_when_no_users_present(
    tmp_path: Path,
):
    dataset_path = _sample_dataset_path(tmp_path)
    session_path = dataset_path / "session.json"
    session = json.loads(session_path.read_text())
    session["participants"] = []
    session_path.write_text(json.dumps(session))

    shotgrid_path = dataset_path / "shotgrid_data.json"
    shotgrid_data = json.loads(shotgrid_path.read_text())
    for version in shotgrid_data["versions"]:
        version["user"] = {}
    shotgrid_path.write_text(json.dumps(shotgrid_data))

    plan = _build_dataset_plan(dataset_path)

    assert plan.sample_user_email == "demo-user@example.com"


def test_find_default_dataset_path_and_is_dataset_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    dataset_path = tmp_path / "sample_dailies_dataset"
    dataset_path.mkdir()
    for name in (
        "session.json",
        "shotgrid_data.json",
        "transcript.json",
        "in_review.json",
    ):
        (dataset_path / name).write_text("{}")

    monkeypatch.setattr(bootstrap_dataset, "BACKEND_ROOT", tmp_path)

    assert _is_dataset_dir(dataset_path) is True
    assert _find_default_dataset_path() == dataset_path.resolve()


def test_format_plan_summary_includes_warnings():
    plan = bootstrap_dataset.DatasetPlan(
        dataset_name="dataset",
        dataset_path=Path("/tmp/dataset"),
        project_id=1,
        project_code="HSM",
        project_name="Hyperspace Mini",
        playlist=bootstrap_dataset.DatasetPlaylist(
            id=10,
            code="demo",
            description="desc",
            created_at="2025-10-02T16:00:00Z",
            updated_at="2025-10-02T16:00:00Z",
            version_ids=[20],
        ),
        users=[],
        shots=[],
        tasks=[],
        versions=[
            bootstrap_dataset.DatasetVersion(
                id=20,
                source_id=1,
                code="HSM_SATL_0010_TD",
                description="desc",
                status="rev",
                created_at=None,
                updated_at=None,
                user_id=None,
                shot_id=None,
                task_id=None,
                thumbnail=None,
            )
        ],
        segments=[],
        in_review_version_id=20,
        sample_user_email="demo@example.com",
        warnings=["warning one"],
    )

    summary = _format_plan_summary(plan)

    assert "Warnings:" in summary
    assert "warning one" in summary


def test_helper_functions_are_stable():
    assert _parse_hms("01:02:03") == 3723
    assert _slugify("Demo User") == "demo-user"
    assert _stable_id("dataset", "version", "abc") == _stable_id(
        "dataset", "version", "abc"
    )


def test_seed_mongo_writes_expected_documents(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))

    class FakeCollection:
        def __init__(self):
            self.calls: list[
                tuple[dict[str, Any], dict[str, Any], bool, dict[str, Any]]
            ] = []

        async def find_one_and_update(self, query, update, upsert=False, **kwargs):
            self.calls.append((query, update, upsert, kwargs))
            return {}

    class FakeDatabase:
        def __init__(self):
            self.playlist_metadata = FakeCollection()
            self.segments = FakeCollection()
            self.user_settings = FakeCollection()

    class FakeClient:
        last_instance = None

        def __init__(self, url: str):
            self.url = url
            self.closed = False
            self.db = FakeDatabase()
            FakeClient.last_instance = self

        def __getitem__(self, name: str) -> FakeDatabase:
            return self.db

        async def close(self):
            self.closed = True

    monkeypatch.setattr(bootstrap_dataset, "AsyncMongoClient", FakeClient)

    asyncio.run(_seed_mongo(plan))

    client = FakeClient.last_instance
    assert client is not None
    assert client.db.playlist_metadata.calls[0][0] == {"playlist_id": plan.playlist.id}
    assert (
        client.db.playlist_metadata.calls[0][1]["$set"]["in_review"]
        == plan.in_review_version_id
    )
    assert len(client.db.segments.calls) == len(plan.segments)
    assert client.db.user_settings.calls[0][0] == {"user_email": plan.sample_user_email}
    assert client.closed is True


def test_run_import_calls_sqlite_then_mongo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    plan = _build_dataset_plan(_sample_dataset_path(tmp_path))
    calls: list[tuple[str, object]] = []

    def fake_seed_sqlite(received_plan, received_path):
        calls.append(("sqlite", received_path))
        assert received_plan == plan

    async def fake_seed_mongo(received_plan):
        calls.append(("mongo", received_plan.playlist.id))
        assert received_plan == plan

    monkeypatch.setattr(bootstrap_dataset, "_seed_sqlite", fake_seed_sqlite)
    monkeypatch.setattr(bootstrap_dataset, "_seed_mongo", fake_seed_mongo)

    asyncio.run(bootstrap_dataset._run_import(plan, tmp_path / "mock.db"))

    assert calls == [("sqlite", tmp_path / "mock.db"), ("mongo", plan.playlist.id)]


def test_main_supports_dry_run_and_reports_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    dataset_path = _sample_dataset_path(tmp_path)

    monkeypatch.setattr(
        sys,
        "argv",
        ["bootstrap_dataset", str(dataset_path), "--dry-run"],
    )
    assert bootstrap_dataset.main() == 0
    captured = capsys.readouterr()
    assert "Dataset: demo_dailies_2025_10_02" in captured.out

    monkeypatch.setattr(sys, "argv", ["bootstrap_dataset"])
    monkeypatch.setattr(bootstrap_dataset, "_find_default_dataset_path", lambda: None)
    assert bootstrap_dataset.main() == 1
    captured = capsys.readouterr()
    assert "Could not find a default dataset directory" in captured.err


def test_main_prints_bootstrap_db_reminder_on_success(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    dataset_path = _sample_dataset_path(tmp_path)

    async def fake_run_import(plan, sqlite_path):
        return None

    monkeypatch.setattr(bootstrap_dataset, "_run_import", fake_run_import)
    monkeypatch.setattr(
        sys,
        "argv",
        ["bootstrap_dataset", str(dataset_path), "--output-sqlite-path", "mock.db"],
    )

    assert bootstrap_dataset.main() == 0
    captured = capsys.readouterr()
    assert "Seeded SQLite:" in captured.out
    assert "MOCK_PRODTRACK_DB_PATH=/app/.local/mock.db" in captured.out
