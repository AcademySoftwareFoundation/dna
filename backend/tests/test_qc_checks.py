"""Tests for note QC checks API and QC runner."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    get_llm_provider_cached,
    get_prodtrack_provider_cached,
    get_storage_provider_cached,
)

from dna.models.draft_note import DraftNote
from dna.models.entity import Version
from dna.models.qc_check import NoteQCCheck, NoteQCCheckCreate, NoteQCLLMOutput


def _sample_check(check_id: str = "507f1f77bcf86cd799439011", **kwargs) -> NoteQCCheck:
    now = datetime.now(timezone.utc)
    data = {
        "_id": check_id,
        "user_email": "test@example.com",
        "name": "Test Check",
        "prompt": "Ensure note mentions transcript.",
        "severity": "warning",
        "enabled": True,
        "created_at": now,
        "updated_at": now,
    }
    data.update(kwargs)
    return NoteQCCheck(**data)


def _sample_draft() -> DraftNote:
    now = datetime.now(timezone.utc)
    return DraftNote(
        _id="draft1",
        user_email="test@example.com",
        playlist_id=1,
        version_id=10,
        content="Hello note",
        subject="Subj",
        to="",
        cc="",
        links=[],
        version_status="ip",
        published=False,
        edited=False,
        updated_at=now,
        created_at=now,
        attachment_ids=[],
    )


def _sample_version() -> Version:
    return Version(
        id=10,
        name="v010",
        notes=[],
    )


class TestQCCheckEndpoints:
    @pytest.fixture
    def mock_storage(self):
        return mock.AsyncMock()

    @pytest.fixture
    def mock_prodtrack(self):
        p = mock.MagicMock()
        p.get_entity.return_value = _sample_version()
        return p

    @pytest.fixture
    def mock_llm(self):
        llm = mock.AsyncMock()
        llm.generate_structured_with_tools = mock.AsyncMock(
            return_value=NoteQCLLMOutput(passed=True)
        )
        return llm

    def test_list_qc_checks_forbidden_wrong_user(
        self, mock_storage, auth_client: TestClient
    ):
        mock_storage.get_qc_checks.return_value = [_sample_check()]
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        try:
            r = auth_client.get("/users/other%40example.com/qc-checks")
            assert r.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_list_qc_checks_ok(self, mock_storage, auth_client: TestClient):
        mock_storage.get_qc_checks.return_value = [_sample_check()]
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        try:
            r = auth_client.get("/users/test%40example.com/qc-checks")
            assert r.status_code == 200
            data = r.json()
            assert len(data) == 1
            assert data[0]["name"] == "Test Check"
        finally:
            app.dependency_overrides.clear()

    def test_create_qc_check(self, mock_storage, auth_client: TestClient):
        created = _sample_check("newid")
        mock_storage.create_qc_check.return_value = created
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        try:
            r = auth_client.post(
                "/users/test%40example.com/qc-checks",
                json={
                    "name": "X",
                    "prompt": "Y",
                    "severity": "error",
                    "enabled": True,
                },
            )
            assert r.status_code == 201
            mock_storage.create_qc_check.assert_called_once()
            call_kw = mock_storage.create_qc_check.call_args
            assert call_kw[0][0] == "test@example.com"
            payload = call_kw[0][1]
            assert payload.name == "X"
            assert payload.severity == "error"
        finally:
            app.dependency_overrides.clear()

    def test_update_qc_check_not_found(self, mock_storage, auth_client: TestClient):
        mock_storage.update_qc_check.return_value = None
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        try:
            r = auth_client.put(
                "/users/test%40example.com/qc-checks/badid",
                json={"name": "Z"},
            )
            assert r.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_delete_qc_check_not_found(self, mock_storage, auth_client: TestClient):
        mock_storage.delete_qc_check.return_value = False
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        try:
            r = auth_client.delete("/users/test%40example.com/qc-checks/badid")
            assert r.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_run_qc_checks_no_draft(
        self, mock_storage, mock_prodtrack, mock_llm, auth_client: TestClient
    ):
        mock_storage.get_draft_note.return_value = None
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_prodtrack
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm
        try:
            r = auth_client.post(
                "/playlists/1/versions/10/run-qc-checks",
                json={"user_email": "test@example.com"},
            )
            assert r.status_code == 200
            assert r.json() == {"results": []}
            mock_llm.generate_structured_with_tools.assert_not_called()
        finally:
            app.dependency_overrides.clear()

    def test_run_qc_checks_with_draft(
        self, mock_storage, mock_prodtrack, mock_llm, auth_client: TestClient
    ):
        mock_storage.get_draft_note.return_value = _sample_draft()
        mock_storage.get_qc_checks.return_value = [_sample_check()]
        mock_storage.get_segments_for_version.return_value = []
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_prodtrack
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm
        try:
            r = auth_client.post(
                "/playlists/1/versions/10/run-qc-checks",
                json={"user_email": "test@example.com"},
            )
            assert r.status_code == 200
            body = r.json()
            assert "results" in body
            assert len(body["results"]) == 1
            assert body["results"][0]["passed"] is True
            mock_llm.generate_structured_with_tools.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_run_qc_checks_forbidden_user_mismatch(
        self, mock_storage, mock_prodtrack, mock_llm, auth_client: TestClient
    ):
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage
        app.dependency_overrides[get_prodtrack_provider_cached] = lambda: mock_prodtrack
        app.dependency_overrides[get_llm_provider_cached] = lambda: mock_llm
        try:
            r = auth_client.post(
                "/playlists/1/versions/10/run-qc-checks",
                json={"user_email": "other@example.com"},
            )
            assert r.status_code == 403
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_run_qc_checks_for_draft_llm_failure_returns_failed_result():
    from dna.qc.qc_runner import run_qc_checks_for_draft

    check = _sample_check()
    draft = _sample_draft()
    version = _sample_version()
    prod = mock.MagicMock()
    prod.search.return_value = []
    prod.get_entity.return_value = version
    llm = mock.AsyncMock()
    llm.generate_structured_with_tools = mock.AsyncMock(
        side_effect=RuntimeError("provider down")
    )

    results = await run_qc_checks_for_draft(
        checks=[check],
        draft=draft,
        transcript_text="t",
        version=version,
        prodtrack_provider=prod,
        llm_provider=llm,
    )
    assert len(results) == 1
    assert results[0].passed is False
    assert results[0].issue == "QC check failed to run."
    assert "provider down" in (results[0].evidence or "")


@pytest.mark.asyncio
async def test_run_qc_checks_skips_disabled():
    from dna.qc.qc_runner import run_qc_checks_for_draft

    check = _sample_check(enabled=False)
    draft = _sample_draft()
    version = _sample_version()
    prod = mock.MagicMock()
    llm = mock.AsyncMock()
    results = await run_qc_checks_for_draft(
        checks=[check],
        draft=draft,
        transcript_text="t",
        version=version,
        prodtrack_provider=prod,
        llm_provider=llm,
    )
    assert results == []
    llm.generate_structured_with_tools.assert_not_called()
