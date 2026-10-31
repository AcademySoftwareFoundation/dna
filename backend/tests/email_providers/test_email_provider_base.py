"""Tests for email provider base classes and factory behavior."""

from unittest.mock import patch

import pytest

from dna.email_providers.email_builder import EmailBuilder
from dna.email_providers.email_provider_base import (
    EmailProviderBase,
    get_email_provider,
)
from dna.models.entity import Playlist, Project, User


class DummyEmailProvider(EmailProviderBase):
    """Concrete implementation used for testing the abstract base class."""

    EMAIL_PROVIDER_NAME = "dummy"

    def _get_provider_client(self):
        return None

    async def send_email(
        self,
        *,
        to: str,
        subject: str,
        text: str | None = None,
        html: str | None = None,
        from_email: str | None = None,
    ) -> str:
        raise NotImplementedError()

    async def build_mime_obj(
        self,
        to: str,
        subject: str,
        html_content: str,
        cc=None,
        inline_images=None,
    ):
        raise NotImplementedError()

    async def build_message(
        self,
        playlist,
        project,
        sent_by,
        versions,
        drafts,
        playlist_url,
    ):
        raise NotImplementedError()

    async def send(
        self,
        to,
        subject,
        html_content,
        cc=None,
        inline_images=None,
    ):
        raise NotImplementedError()


class TestGetEmailProvider:
    """Tests for EmailProviderBase methods."""

    def test_returns_noop_provider_by_default(self):
        """The factory should default to NoopProvider when unset."""
        with patch.dict("os.environ", {}, clear=True):
            from dna.email_providers.noop_provider import NoopProvider

            provider = get_email_provider()

        assert isinstance(provider, NoopProvider)

    def test_returns_noop_provider_when_configured(self):
        """The factory should return NoopProvider when configured."""
        with patch.dict("os.environ", {"EMAIL_PROVIDER": "noop"}, clear=True):
            from dna.email_providers.noop_provider import NoopProvider

            provider = get_email_provider()

        assert isinstance(provider, NoopProvider)

    def test_returns_sendgrid_provider_when_configured(self):
        """The factory should return SendGridProvider when configured."""
        pytest.importorskip(
            "sendgrid",
            reason="sendgrid package is not installed",
        )

        with patch.dict(
            "os.environ",
            {
                "EMAIL_PROVIDER": "sendgrid",
                "SENDGRID_API_KEY": "test-key",
            },
            clear=True,
        ):
            from dna.email_providers.sendgrid_provider import SendGridProvider

            provider = get_email_provider()

        assert isinstance(provider, SendGridProvider)

    def test_returns_resend_provider_when_configured(self):
        """The factory should return ResendProvider when configured."""
        with patch.dict(
            "os.environ",
            {
                "EMAIL_PROVIDER": "resend",
                "RESEND_API_KEY": "test-key",
            },
            clear=True,
        ):
            from dna.email_providers.resend_provider import ResendProvider

            provider = get_email_provider()

        assert isinstance(provider, ResendProvider)

    def test_returns_smtp_provider_when_configured(self):
        """The factory should return SMTPProvider when configured."""
        pytest.importorskip(
            "aiosmtplib",
            reason="aiosmtplib package is not installed",
        )

        with patch.dict(
            "os.environ",
            {"EMAIL_PROVIDER": "smtp"},
            clear=True,
        ):
            from dna.email_providers.smtp_provider import SMTPProvider

            provider = get_email_provider()

        assert isinstance(provider, SMTPProvider)

    def test_raises_for_unknown_provider_type(self):
        """The factory should reject unsupported provider values."""
        with patch.dict("os.environ", {"EMAIL_PROVIDER": "unknown"}, clear=True):
            with pytest.raises(ValueError, match="Unknown email provider: unknown"):
                get_email_provider()


class TestEmailProviderBase:
    """Tests for EmailProviderBase methods."""

    @pytest.mark.asyncio
    async def test_build_mime_obj_raises_not_implemented(self):
        """Test that build_mime_obj raises NotImplementedError."""
        provider = DummyEmailProvider()
        with pytest.raises(NotImplementedError):
            await provider.build_mime_obj("to@example.com", "Subject", "<html>")

    @pytest.mark.asyncio
    async def test_build_message_raises_not_implemented(self):
        """Test that build_message raises NotImplementedError."""
        provider = DummyEmailProvider()
        with pytest.raises(NotImplementedError):
            await provider.build_message(
                playlist=Playlist(id="1", code="Test Playlist"),
                project=Project(id="1", name="Test Project"),
                sent_by=User(id="1", email="user@example.com"),
                versions=[],
                drafts=[],
                playlist_url="https://example.com/playlist/1",
            )

    @pytest.mark.asyncio
    async def test_send_raises_not_implemented(self):
        """Test that send raises NotImplementedError."""
        provider = DummyEmailProvider()
        with pytest.raises(NotImplementedError):
            await provider.send("to@example.com", "Subject", "<html>")


class TestEmailBuilder:
    """Tests for the provider-independent email builder."""

    def test_build_subject(self):
        """Test that build_subject creates a proper subject line."""
        subject = EmailBuilder.build_subject(
            Playlist(id="1", code="Test Playlist"),
            Project(id="1", name="Test Project"),
        )
        assert subject == "Dailies Summary: Test Playlist - Test Project"

    def test_build_text_content(self):
        """Test that build_text_content creates text content."""
        text = EmailBuilder.build_text_content(
            Playlist(id="1", code="Test Playlist"),
            Project(id="1", name="Test Project"),
            User(id="1", email="user@example.com"),
            [],
            [],
            "https://example.com/playlist/1",
        )
        assert "Test Playlist" in text
        assert "Test Project" in text
        assert "https://example.com/playlist/1" in text

    def test_build_html_content(self):
        """Test that build_html_content creates HTML content."""
        html = EmailBuilder.build_html_content(
            Playlist(id="1", code="Test Playlist"),
            Project(id="1", name="Test Project"),
            User(id="1", email="user@example.com"),
            [],
            [],
            "https://example.com/playlist/1",
        )
        assert "<html" in html
        assert "Test Playlist" in html
        assert "Test Project" in html
        assert "https://example.com/playlist/1" in html
