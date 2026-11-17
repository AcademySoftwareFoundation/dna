"""Tests for session-scoped bot dispatch endpoints."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    get_storage_provider_cached,
    get_transcription_provider_cached,
    get_transcription_service_cached,
)

from dna.models.session import Session
from dna.models.transcription import BotSession, BotStatusEnum, Platform

client = TestClient(app)

SESSION_ID = "507f1f77bcf86cd799439011"


def make_session(**overrides) -> Session:
    data = {
        "_id": SESSION_ID,
        "external_id": None,
        "project_id": "124",
        "name": "Morning",
        "playlist_ids": ["573"],
        "in_review_playlist_id": "573",
        "in_review_version_id": "7",
        "in_review_pinned": False,
        "meeting_id": None,
        "platform": None,
        "vexa_meeting_id": None,
        "transcription_paused": False,
    }
    data.update(overrides)
    return Session(**data)


class TestDispatchSessionBot:
    """POST /sessions/{id}/transcription/bot binds meeting to the DNA session."""

    @pytest.fixture
    def mock_transcription_provider(self):
        provider = mock.AsyncMock()
        provider.dispatch_bot.return_value = BotSession(
            platform=Platform.GOOGLE_MEET,
            meeting_id="abc-def-ghi",
            playlist_id="573",
            status=BotStatusEnum.JOINING,
            vexa_meeting_id=1842,
        )
        return provider

    @pytest.fixture
    def mock_transcription_service(self):
        return mock.AsyncMock()

    @pytest.fixture
    def mock_storage(self):
        return mock.AsyncMock()

    def test_binds_meeting_to_session(
        self, mock_transcription_provider, mock_transcription_service, mock_storage
    ):
        mock_storage.get_session.return_value = make_session()
        mock_storage.update_session.return_value = make_session(
            meeting_id="abc-def-ghi",
            platform="google_meet",
            vexa_meeting_id=1842,
        )

        app.dependency_overrides[get_transcription_provider_cached] = (
            lambda: mock_transcription_provider
        )
        app.dependency_overrides[get_transcription_service_cached] = (
            lambda: mock_transcription_service
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage

        try:
            response = client.post(
                f"/sessions/{SESSION_ID}/transcription/bot",
                json={
                    "platform": "google_meet",
                    "meeting_id": "abc-def-ghi",
                },
            )
            assert response.status_code == 201

            mock_storage.update_session.assert_awaited_once()
            fields = mock_storage.update_session.await_args.args[1]
            assert fields["meeting_id"] == "abc-def-ghi"
            assert fields["platform"] == "google_meet"
            assert fields["vexa_meeting_id"] == 1842

            mock_transcription_service.subscribe_to_meeting.assert_awaited_once_with(
                platform="google_meet",
                meeting_id="abc-def-ghi",
                session_id=SESSION_ID,
            )
        finally:
            app.dependency_overrides.clear()

    def test_404_when_session_missing(
        self, mock_transcription_provider, mock_transcription_service, mock_storage
    ):
        mock_storage.get_session.return_value = None

        app.dependency_overrides[get_transcription_provider_cached] = (
            lambda: mock_transcription_provider
        )
        app.dependency_overrides[get_transcription_service_cached] = (
            lambda: mock_transcription_service
        )
        app.dependency_overrides[get_storage_provider_cached] = lambda: mock_storage

        try:
            response = client.post(
                f"/sessions/{SESSION_ID}/transcription/bot",
                json={
                    "platform": "google_meet",
                    "meeting_id": "abc-def-ghi",
                },
            )
            assert response.status_code == 404
            mock_transcription_provider.dispatch_bot.assert_not_awaited()
        finally:
            app.dependency_overrides.clear()
