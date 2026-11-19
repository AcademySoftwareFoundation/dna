"""Tests for the Resend email provider."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from dna.email_providers.resend_provider import ResendProvider
from dna.models.entity import Playlist, Project, User


def _provider() -> ResendProvider:
    with patch.dict(
        "os.environ",
        {"RESEND_API_KEY": "re_test", "RESEND_FROM_EMAIL": "from@example.com"},
        clear=True,
    ):
        return ResendProvider()


class TestResendProvider:
    """Tests for ResendProvider configuration and delivery."""

    def test_missing_api_key_raises(self):
        """Creating a client without RESEND_API_KEY fails before any request."""
        with patch.dict("os.environ", {}, clear=True):
            provider = ResendProvider()
            with pytest.raises(ValueError, match="RESEND_API_KEY"):
                provider._get_provider_client()

    def test_client_targets_resend_api(self):
        """The HTTP client uses the Resend API origin."""
        provider = _provider()
        with patch(
            "dna.email_providers.resend_provider.httpx.AsyncClient"
        ) as client_cls:
            provider._get_provider_client()

        client_cls.assert_called_once_with(base_url="https://api.resend.com")

    @pytest.mark.asyncio
    async def test_build_message_uses_email_builder(self):
        """Resend summaries use the shared email builder."""
        provider = _provider()
        subject, _text, html = await provider.build_message(
            Playlist(id="1", code="Dailies"),
            Project(id="1", name="Show"),
            User(id="1", email="sender@example.com"),
            [],
            [],
            "https://example.com/playlist/1",
        )
        assert subject == "Dailies Summary: Dailies - Show"
        assert "Dailies" in html

    @pytest.mark.asyncio
    async def test_send_posts_message_and_inline_images(self):
        """send posts the HTML message, CC, and inline images to Resend."""
        provider = _provider()
        response = MagicMock()
        response.json.return_value = {"id": "re_123"}
        client = AsyncMock()
        client.post.return_value = response
        provider._client = client

        message_id = await provider.send(
            to="to@example.com",
            subject="Hello",
            html_content="<p>Hi</p>",
            cc="cc@example.com",
            inline_images={"logo": b"png-bytes"},
            from_email="override@example.com",
        )

        assert message_id == "re_123"
        response.raise_for_status.assert_called_once()
        _, kwargs = client.post.await_args
        assert kwargs["headers"]["Authorization"] == "Bearer re_test"
        assert kwargs["json"]["from"] == "override@example.com"
        assert kwargs["json"]["to"] == ["to@example.com"]
        assert kwargs["json"]["cc"] == ["cc@example.com"]
        assert kwargs["json"]["subject"] == "Hello"
        assert kwargs["json"]["html"] == "<p>Hi</p>"
        attachment = kwargs["json"]["attachments"][0]
        assert attachment["filename"] == "logo"
        assert attachment["disposition"] == "inline"
        assert attachment["content"]
