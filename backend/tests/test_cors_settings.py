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


@pytest.mark.parametrize(
    "cors_env,k_service,expected_creds",
    [
        # Explicit origins: credentials on, so the refresh cookie is sent.
        ("https://app.example.com", None, True),
        ("http://localhost:8080, http://localhost:5173", None, True),
        # Wildcards must never be combined with credentials: any site could
        # then make logged-in requests on a user's behalf.
        ("*", None, False),
        ("", "dna-backend", False),
    ],
)
def test_shotgrid_auth_enables_credentials_only_for_explicit_origins(
    monkeypatch: pytest.MonkeyPatch,
    cors_env: str,
    k_service: str | None,
    expected_creds: bool,
) -> None:
    monkeypatch.setenv("AUTH_PROVIDER", "shotgrid")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("K_REVISION", raising=False)
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", cors_env)
    if k_service is not None:
        monkeypatch.setenv("K_SERVICE", k_service)

    kw = get_cors_middleware_kwargs()

    assert kw["allow_credentials"] == expected_creds
    if kw["allow_credentials"]:
        assert kw["allow_origin_regex"] is None
        assert "*" not in kw["allow_origins"]


def test_shotgrid_auth_with_wildcard_logs_why_refresh_will_fail(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("AUTH_PROVIDER", "shotgrid")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")

    with caplog.at_level("ERROR"):
        get_cors_middleware_kwargs()

    assert "explicit" in caplog.text


def test_google_deploy_cors_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    """The GCP deploy runs AUTH_PROVIDER=google with CORS_ALLOWED_ORIGINS=*."""
    monkeypatch.setenv("AUTH_PROVIDER", "google")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")

    kw = get_cors_middleware_kwargs()

    assert kw["allow_credentials"] is False
    assert kw["allow_origin_regex"] == r".*"
