"""Tests for the session provider contract and factory."""

import pytest

from dna.session_providers.session_provider_base import (
    SessionProviderBase,
    get_session_provider,
)


class IncompleteSessionProvider(SessionProviderBase):
    """Subclass that implements none of the abstract methods."""


class TestSessionProviderBase:
    """The base class cannot be used until every method is implemented."""

    def test_incomplete_subclass_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            IncompleteSessionProvider()


class TestGetSessionProvider:
    """SESSION_PROVIDER selects the implementation."""

    def test_default_is_disabled(self, monkeypatch):
        monkeypatch.delenv("SESSION_PROVIDER", raising=False)
        assert get_session_provider() is None

    def test_none_is_disabled(self, monkeypatch):
        monkeypatch.setenv("SESSION_PROVIDER", "none")
        assert get_session_provider() is None

    def test_mock_returns_mock_provider(self, monkeypatch):
        from dna.session_providers.mock_session_provider import MockSessionProvider

        monkeypatch.setenv("SESSION_PROVIDER", "mock")
        provider = get_session_provider()
        assert isinstance(provider, MockSessionProvider)

    def test_unknown_provider_raises(self, monkeypatch):
        monkeypatch.setenv("SESSION_PROVIDER", "nope")
        with pytest.raises(ValueError, match="Unknown session provider"):
            get_session_provider()
