"""Tests for the noop email provider."""

import pytest

from dna.email_providers.noop_provider import NoopProvider
from dna.models.entity import Playlist, Project, User


class TestNoopProvider:
    """Tests for NoopProvider."""

    def test_client_is_unused(self):
        """The noop provider does not open a remote client."""
        provider = NoopProvider()
        assert provider.client is None

    @pytest.mark.asyncio
    async def test_build_message_returns_placeholder_content(self):
        """The noop builder returns fixed placeholder content."""
        provider = NoopProvider()
        subject, text, html = await provider.build_message(
            Playlist(id="1", code="Dailies"),
            Project(id="1", name="Show"),
            User(id="1", email="sender@example.com"),
            [],
            [],
            "https://example.com/playlist/1",
        )
        assert subject == "Summary Email"
        assert text == "Text content"
        assert html == "<html>HTML content</html>"

    @pytest.mark.asyncio
    async def test_send_returns_noop_id(self):
        """send reports a noop message id and does not raise."""
        provider = NoopProvider()
        message_id = await provider.send(
            "to@example.com",
            "Subject",
            "<p>Hi</p>",
            cc="cc@example.com",
        )
        assert message_id == "noop"
