"""Tests for email provider base classes and factory behavior."""

from unittest.mock import patch

import pytest

from dna.email_providers.email_provider_base import get_email_provider


class TestGetEmailProvider:
    """Tests for the email provider factory."""

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
        pytest.importorskip("sendgrid")

        with patch.dict(
            "os.environ",
            {"EMAIL_PROVIDER": "sendgrid", "SENDGRID_API_KEY": "test-key"},
            clear=True,
        ):
            from dna.email_providers.sendgrid_provider import SendGridProvider

            provider = get_email_provider()

        assert isinstance(provider, SendGridProvider)

    def test_returns_resend_provider_when_configured(self):
        """The factory should return ResendProvider when configured."""
        with patch.dict(
            "os.environ",
            {"EMAIL_PROVIDER": "resend", "RESEND_API_KEY": "test-key"},
            clear=True,
        ):
            from dna.email_providers.resend_provider import ResendProvider

            provider = get_email_provider()

        assert isinstance(provider, ResendProvider)

    def test_returns_smtp_provider_when_configured(self):
        """The factory should return SMTPProvider when configured."""
        pytest.importorskip("aiosmtplib")

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