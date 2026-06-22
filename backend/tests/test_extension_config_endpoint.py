"""Tests for extension transcription config endpoint."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test@example.com"}


class TestExtensionConfigEndpoint:
    """Tests for GET /transcription/extension-config."""

    def test_returns_config_from_env(self, client, auth_headers):
        with mock.patch.dict(
            "os.environ",
            {
                "TRANSCRIPTION_STT_URL": "https://stt.example/v1/audio/transcriptions",
                "TRANSCRIPTION_STT_API_KEY": "secret-key",
                "TRANSCRIPTION_STT_MODEL": "whisper-1",
                "TRANSCRIPTION_CHUNK_DURATION_MS": "5000",
                "TRANSCRIPTION_STT_LANGUAGE": "en",
            },
            clear=False,
        ):
            response = client.get(
                "/transcription/extension-config", headers=auth_headers
            )

        assert response.status_code == 200
        data = response.json()
        assert data["stt_url"] == "https://stt.example/v1/audio/transcriptions"
        assert data["stt_api_key"] == "secret-key"
        assert data["stt_model"] == "whisper-1"
        assert data["chunk_duration_ms"] == 5000
        assert data["language"] == "en"

    def test_requires_authentication(self, client):
        with mock.patch.dict("os.environ", {"AUTH_PROVIDER": "google"}, clear=False):
            response = client.get("/transcription/extension-config")
        assert response.status_code == 401

    def test_returns_503_when_stt_key_missing(self, client, auth_headers):
        with mock.patch.dict(
            "os.environ",
            {
                "TRANSCRIPTION_STT_API_KEY": "",
                "TRANSCRIPTION_PROVIDER": "browser_extension",
            },
            clear=False,
        ):
            response = client.get(
                "/transcription/extension-config", headers=auth_headers
            )
        assert response.status_code == 503
