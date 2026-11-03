"""
SendGrid Email Provider.
"""

import base64
import os
from typing import Optional

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Attachment,
    Cc,
    Email,
    Mail,
    To,
)

from dna.email_providers.email_builder import EmailBuilder
from dna.email_providers.email_provider_base import EmailProviderBase


class SendGridProvider(EmailProviderBase):
    EMAIL_PROVIDER_NAME = "SENDGRID"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.from_email = os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")

    def _get_provider_client(self) -> SendGridAPIClient:
        if not self.api_key:
            raise ValueError("SENDGRID_API_KEY is not configured.")
        return SendGridAPIClient(api_key=self.api_key)

    async def build_message(self, *args, **kwargs) -> tuple[str, str, str]:
        return EmailBuilder.build_message(*args, **kwargs)

    async def send(
        self,
        to: str,
        subject: str,
        html_content: str,
        cc: Optional[str] = None,
        inline_images: Optional[dict[str, bytes]] = None,
    ) -> str:
        message = Mail(
            from_email=Email(self.from_email),
            to_emails=To(to),
            subject=subject,
            html_content=html_content,
        )

        if cc:
            message.add_cc(Cc(cc))

        if inline_images:
            for cid, image_data in inline_images.items():
                attachment = Attachment()
                attachment.file_content = base64.b64encode(image_data).decode()
                attachment.file_type = "image/png"
                attachment.file_name = cid
                attachment.disposition = "inline"
                attachment.content_id = cid
                message.add_attachment(attachment)

        try:
            response = self.client.send(message)
        except Exception as e:
            print(type(e).__name__)
            print(e)
            raise

        if response.status_code >= 400:
            raise RuntimeError(
                f"SendGrid returned {response.status_code}: {response.body}"
            )

        return response.headers.get("X-Message-Id", "")
