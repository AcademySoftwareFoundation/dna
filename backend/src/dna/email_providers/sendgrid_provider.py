"""
SendGrid Email Provider.
"""

from __future__ import annotations

from typing import Optional

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Content,
    Email,
    Mail,
    To,
)

from dna.email_providers.email_provider_base import EmailProviderBase


class SendGridProvider(EmailProviderBase):
    """Twilio SendGrid email provider."""

    EMAIL_PROVIDER_NAME = "SENDGRID"

    DEFAULT_TIMEOUT = 30.0

    def _get_provider_client(self) -> SendGridAPIClient:
        if not self.api_key:
            raise ValueError("SENDGRID_API_KEY is not configured.")

        return SendGridAPIClient(api_key=self.api_key)

    async def send_email(
        self,
        *,
        to: str,
        subject: str,
        text: str | None = None,
        html: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
    ) -> str:
        """
        Send an email.

        Returns:
            SendGrid message id.
        """

        if not from_email:
            raise ValueError("from_email is required.")

        message = Mail(
            from_email=Email(from_email, from_name),
            to_emails=To(to),
            subject=subject,
        )

        if text:
            message.add_content(Content("text/plain", text))

        if html:
            message.add_content(Content("text/html", html))

        if reply_to:
            message.reply_to = Email(reply_to)

        response = self.client.send(message)

        if response.status_code >= 400:
            raise RuntimeError(
                f"SendGrid returned {response.status_code}: " f"{response.body}"
            )

        return response.headers.get(
            "X-Message-Id",
            "",
        )
