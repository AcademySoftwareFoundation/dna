"""Tests for the glossary-derived Whisper ``initial_prompt``."""

from datetime import datetime, timezone
from unittest import mock

from fastapi.testclient import TestClient
from main import app, get_storage_provider_cached

from dna.models.project_glossary import ProjectGlossary
from dna.transcription_prompt import build_initial_prompt, extract_glossary_terms

client = TestClient(app)


class TestExtractGlossaryTerms:
    def test_takes_term_side_of_colon_lines(self):
        text = "Carryall: Large transport aircraft.\nHarvester: Spice machine."
        assert extract_glossary_terms(text) == ["Carryall", "Harvester"]

    def test_skips_blank_and_comment_lines(self):
        text = "# Global VFX glossary\n\nSR: Screen right.\n   \ncomp: Compositing."
        assert extract_glossary_terms(text) == ["SR", "comp"]

    def test_keeps_short_bare_lines_as_terms(self):
        text = "Paul Atreides\nArrakeen\nThis is a long explanatory sentence with no separator in it"
        assert extract_glossary_terms(text) == ["Paul Atreides", "Arrakeen"]

    def test_strips_list_bullets(self):
        assert extract_glossary_terms("- Sardaukar: Imperial troops\n* Fremen") == [
            "Sardaukar",
            "Fremen",
        ]

    def test_drops_overlong_terms(self):
        sentence = "x" * 61 + ": not really a term"
        assert extract_glossary_terms(sentence) == []

    def test_dedupes_case_insensitively_preserving_first(self):
        assert extract_glossary_terms("Comp: a\ncomp: b\nBG: c") == ["Comp", "BG"]

    def test_handles_empty_and_none(self):
        assert extract_glossary_terms("") == []
        assert extract_glossary_terms(None) == []  # type: ignore[arg-type]


class TestBuildInitialPrompt:
    def test_empty_when_no_terms(self):
        assert build_initial_prompt("", "") == ("", 0)
        assert build_initial_prompt("# only a comment", "") == ("", 0)

    def test_project_terms_precede_global_terms(self):
        prompt, count = build_initial_prompt(
            "Carryall: aircraft\nHarvester: machine",
            "SR: screen right\ncomp: compositing",
        )
        assert prompt == "Glossary: Carryall, Harvester, SR, comp."
        assert count == 4

    def test_dedupes_across_project_and_global(self):
        prompt, count = build_initial_prompt("comp: project meaning", "comp: global")
        assert prompt == "Glossary: comp."
        assert count == 1

    def test_respects_max_chars_and_keeps_leading_terms(self):
        """Whisper truncates prompts from the left, so the budget must be
        enforced here rather than letting the model drop project terms."""
        project = "\n".join(f"Term{i}: d" for i in range(100))
        prompt, count = build_initial_prompt(project, "", max_chars=60)
        assert len(prompt) <= 60
        assert prompt.startswith("Glossary: Term0, Term1")
        assert prompt.endswith(".")
        assert 0 < count < 100

    def test_returns_empty_when_first_term_does_not_fit(self):
        assert build_initial_prompt("Supercalifragilistic: x", "", max_chars=12) == (
            "",
            0,
        )


class TestTranscriptionPromptEndpoint:
    def _storage(self, content):
        storage = mock.AsyncMock()
        if content is None:
            storage.get_project_glossary.return_value = None
        else:
            now = datetime.now(timezone.utc)
            storage.get_project_glossary.return_value = ProjectGlossary(
                _id="g1",
                project_id="7",
                content=content,
                created_at=now,
                updated_at=now,
            )
        return storage

    def test_combines_project_then_global_glossary(self):
        storage = self._storage("Carryall: aircraft\nHarvester: machine")
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage
        try:
            response = client.get("/projects/7/transcription-prompt")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        body = response.json()
        assert body["prompt"].startswith("Glossary: Carryall, Harvester, ")
        # A term from the packaged global glossary follows the project terms.
        assert "SR" in body["prompt"]
        assert body["term_count"] >= 3
        storage.get_project_glossary.assert_awaited_once_with("7")

    def test_falls_back_to_global_glossary_when_no_project_glossary(self):
        storage = self._storage(None)
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage
        try:
            response = client.get("/projects/7/transcription-prompt")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        body = response.json()
        assert body["prompt"].startswith("Glossary: ")
        assert body["term_count"] > 0

    def test_empty_prompt_when_no_terms_anywhere(self):
        storage = self._storage("")
        app.dependency_overrides[get_storage_provider_cached] = lambda: storage
        with mock.patch("main.get_default_glossary_global", return_value=""):
            try:
                response = client.get("/projects/7/transcription-prompt")
            finally:
                app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json() == {"prompt": "", "term_count": 0}
