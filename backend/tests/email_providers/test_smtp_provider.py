"""Tests for the SMTP email provider."""

import base64
from email.mime.multipart import MIMEMultipart
from unittest.mock import AsyncMock, patch

import pytest

from dna.email_providers.smtp_provider import SMTPProvider
from dna.models.entity import Playlist, Project, User

ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _provider() -> SMTPProvider:
    with patch.dict(
        "os.environ",
        {
            "SMTP_FROM_EMAIL": "from@example.com",
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "from@example.com",
            "SMTP_PASSWORD": "app-password",
            "SMTP_START_TLS": "true",
        },
        clear=True,
    ):
        return SMTPProvider()


class TestSMTPProvider:
    """Tests for SMTPProvider configuration and delivery."""

    def test_client_uses_configured_server(self):
        """The SMTP client is built from the SMTP_* environment variables."""
        with patch.dict(
            "os.environ",
            {
                "SMTP_FROM_EMAIL": "from@example.com",
                "SMTP_HOST": "smtp.gmail.com",
                "SMTP_PORT": "587",
                "SMTP_USERNAME": "from@example.com",
                "SMTP_PASSWORD": "app-password",
                "SMTP_START_TLS": "true",
            },
            clear=True,
        ):
            provider = SMTPProvider()
            with patch("dna.email_providers.smtp_provider.aiosmtplib.SMTP") as smtp:
                provider._get_provider_client()

        smtp.assert_called_once_with(
            hostname="smtp.gmail.com",
            port=587,
            username="from@example.com",
            password="app-password",
            start_tls=True,
        )

    def test_client_defaults_to_gmail_starttls(self):
        """Missing SMTP settings fall back to Gmail on port 587 with STARTTLS."""
        with patch.dict("os.environ", {}, clear=True):
            provider = SMTPProvider()
            with patch("dna.email_providers.smtp_provider.aiosmtplib.SMTP") as smtp:
                provider._get_provider_client()

        smtp.assert_called_once_with(
            hostname="smtp.gmail.com",
            port=587,
            username=None,
            password=None,
            start_tls=True,
        )
        assert provider.from_email == "noreply@example.com"

    def test_starttls_can_be_disabled(self):
        """SMTP_START_TLS=false leaves the connection without STARTTLS."""
        with patch.dict("os.environ", {"SMTP_START_TLS": "false"}, clear=True):
            provider = SMTPProvider()
            with patch("dna.email_providers.smtp_provider.aiosmtplib.SMTP") as smtp:
                provider._get_provider_client()

        assert smtp.call_args.kwargs["start_tls"] is False

    @pytest.mark.asyncio
    async def test_build_message_uses_email_builder(self):
        """SMTP summaries use the shared email builder."""
        provider = _provider()
        subject, text, html = await provider.build_message(
            Playlist(id="1", code="Dailies"),
            Project(id="1", name="Show"),
            User(id="1", email="sender@example.com"),
            [],
            [],
            "https://example.com/playlist/1",
        )
        assert subject == "Dailies Summary: Dailies - Show"
        assert "sender@example.com" in text
        assert "https://example.com/playlist/1" in html

    @pytest.mark.asyncio
    async def test_send_connects_and_delivers_mime(self):
        """send connects, delivers a MIME message, and closes the session."""
        provider = _provider()
        client = AsyncMock()
        provider._client = client

        message_id = await provider.send(
            to="to@example.com",
            subject="Hello",
            html_content="<p>Hi</p>",
            cc="cc@example.com",
            inline_images={"logo": ONE_PIXEL_PNG},
        )

        client.connect.assert_awaited_once()
        client.quit.assert_awaited_once()
        sent = client.send_message.await_args.args[0]
        assert isinstance(sent, MIMEMultipart)
        assert sent["From"] == "from@example.com"
        assert sent["To"] == "to@example.com"
        assert sent["Cc"] == "cc@example.com"
        assert sent["Subject"] == "Hello"
        assert message_id == "smtp"
