"""Tests for the SendGrid email provider."""

from unittest.mock import MagicMock, patch

import pytest

from dna.email_providers.sendgrid_provider import SendGridProvider
from dna.models.entity import Playlist, Project, User


def _provider() -> SendGridProvider:
    with patch.dict(
        "os.environ",
        {
            "SENDGRID_API_KEY": "sg-test",
            "SENDGRID_FROM_EMAIL": "from@example.com",
        },
        clear=True,
    ):
        return SendGridProvider()


class TestSendGridProvider:
    """Tests for SendGridProvider configuration and delivery."""

    def test_missing_api_key_raises(self):
        """Creating a client without SENDGRID_API_KEY fails before any request."""
        with patch.dict("os.environ", {}, clear=True):
            provider = SendGridProvider()
            with pytest.raises(ValueError, match="SENDGRID_API_KEY"):
                provider._get_provider_client()

    def test_client_uses_api_key(self):
        """The SendGrid client is constructed with the configured API key."""
        provider = _provider()
        with patch(
            "dna.email_providers.sendgrid_provider.SendGridAPIClient"
        ) as client_cls:
            provider._get_provider_client()

        client_cls.assert_called_once_with(api_key="sg-test")

    @pytest.mark.asyncio
    async def test_build_message_uses_email_builder(self):
        """SendGrid summaries use the shared email builder."""
        provider = _provider()
        subject, text, _html = await provider.build_message(
            Playlist(id="1", code="Dailies"),
            Project(id="1", name="Show"),
            User(id="1", email="sender@example.com"),
            [],
            [],
            "https://example.com/playlist/1",
        )
        assert subject == "Dailies Summary: Dailies - Show"
        assert "sender@example.com" in text

    @pytest.mark.asyncio
    async def test_send_returns_message_id(self):
        """A successful send returns the SendGrid message id."""
        provider = _provider()
        response = MagicMock(status_code=202, headers={"X-Message-Id": "sg-1"})
        client = MagicMock()
        client.send.return_value = response
        provider._client = client

        message_id = await provider.send(
            to="to@example.com",
            subject="Hello",
            html_content="<p>Hi</p>",
            cc="cc@example.com",
            inline_images={"logo": b"png-bytes"},
        )

        assert message_id == "sg-1"
        client.send.assert_called_once()
        sent = client.send.call_args.args[0]
        payload = sent.get()
        assert payload["subject"] == "Hello"
        assert payload["from"]["email"] == "from@example.com"
        personalization = payload["personalizations"][0]
        assert personalization["to"][0]["email"] == "to@example.com"
        assert personalization["cc"][0]["email"] == "cc@example.com"
        assert payload["attachments"][0]["disposition"] == "inline"
        assert payload["attachments"][0]["content_id"] == "logo"

    @pytest.mark.asyncio
    async def test_send_raises_on_error_status(self):
        """HTTP error statuses from SendGrid become a RuntimeError."""
        provider = _provider()
        response = MagicMock(status_code=401, body="unauthorized", headers={})
        client = MagicMock()
        client.send.return_value = response
        provider._client = client

        with pytest.raises(RuntimeError, match="SendGrid returned 401"):
            await provider.send(
                to="to@example.com",
                subject="Hello",
                html_content="<p>Hi</p>",
            )
