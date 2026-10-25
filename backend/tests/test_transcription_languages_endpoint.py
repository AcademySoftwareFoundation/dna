"""Tests for GET /transcription/languages.

The endpoint is a thin gateway: whatever the configured transcription provider
reports is what the frontend's Settings dropdown shows.
"""

from main import app, get_transcription_provider_cached

from dna.models.transcription import (
    DEFAULT_TRANSCRIPTION_LANGUAGE,
    DEFAULT_TRANSCRIPTION_LANGUAGES,
    TranscriptionLanguage,
    TranscriptionLanguagesResponse,
)
from dna.transcription_providers.transcription_provider_base import (
    TranscriptionProviderBase,
)


class _FrenchOnlyProvider(TranscriptionProviderBase):
    """Stand-in for a provider that can report its own language support."""

    async def get_transcription_languages(self) -> TranscriptionLanguagesResponse:
        return TranscriptionLanguagesResponse(
            languages=[TranscriptionLanguage(code="fr", label="French")],
            default="fr",
        )


class _BrokenProvider(TranscriptionProviderBase):
    async def get_transcription_languages(self) -> TranscriptionLanguagesResponse:
        raise RuntimeError("upstream unavailable")


def _with_provider(provider: TranscriptionProviderBase):
    app.dependency_overrides[get_transcription_provider_cached] = lambda: provider


class TestGetTranscriptionLanguages:
    def test_returns_base_provider_defaults(self, auth_client):
        _with_provider(TranscriptionProviderBase())
        try:
            response = auth_client.get("/transcription/languages")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["default"] == DEFAULT_TRANSCRIPTION_LANGUAGE
        assert data["languages"] == [
            lang.model_dump() for lang in DEFAULT_TRANSCRIPTION_LANGUAGES
        ]

    def test_passes_through_provider_specific_list(self, auth_client):
        _with_provider(_FrenchOnlyProvider())
        try:
            response = auth_client.get("/transcription/languages")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json() == {
            "languages": [{"code": "fr", "label": "French"}],
            "default": "fr",
        }

    def test_provider_failure_is_a_400(self, auth_client):
        _with_provider(_BrokenProvider())
        try:
            response = auth_client.get("/transcription/languages")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 400
        assert "upstream unavailable" in response.json()["detail"]
