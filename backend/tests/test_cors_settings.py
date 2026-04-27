"""Tests for CORS middleware configuration."""

import pytest

from dna.cors_settings import get_cors_middleware_kwargs


@pytest.mark.parametrize(
    "cors_env,k_service,k_revision,expected_origins,expected_regex,expected_creds",
    [
        (
            "*",
            None,
            None,
            [],
            r".*",
            False,
        ),
        (
            "https://app.example.com",
            None,
            None,
            ["https://app.example.com"],
            None,
            False,
        ),
        (
            "https://a.com, https://b.com/",
            None,
            None,
            ["https://a.com", "https://b.com"],
            None,
            False,
        ),
        (
            "",
            "dna-backend",
            None,
            [],
            r".*",
            False,
        ),
        (
            "",
            None,
            "dna-backend-00001",
            [],
            r".*",
            False,
        ),
        (
            "",
            None,
            None,
            ["http://localhost:5173", "http://localhost:3000"],
            None,
            True,
        ),
    ],
)
def test_get_cors_middleware_kwargs(
    monkeypatch: pytest.MonkeyPatch,
    cors_env: str | None,
    k_service: str | None,
    k_revision: str | None,
    expected_origins: list[str],
    expected_regex: str | None,
    expected_creds: bool,
) -> None:
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("K_REVISION", raising=False)
    if cors_env is not None:
        monkeypatch.setenv("CORS_ALLOWED_ORIGINS", cors_env)
    if k_service is not None:
        monkeypatch.setenv("K_SERVICE", k_service)
    if k_revision is not None:
        monkeypatch.setenv("K_REVISION", k_revision)

    kw = get_cors_middleware_kwargs()
    assert kw["allow_origins"] == expected_origins
    assert kw["allow_origin_regex"] == expected_regex
    assert kw["allow_credentials"] == expected_creds
    assert kw["allow_methods"] == ["*"]
    assert kw["allow_headers"] == ["*"]
