"""
SMTP Email Provider.
"""

import os
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from dna.email_providers.email_builder import EmailBuilder
from dna.email_providers.email_provider_base import EmailProviderBase


class SMTPProvider(EmailProviderBase):
    EMAIL_PROVIDER_NAME = "SMTP"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.from_email = os.getenv("SMTP_FROM_EMAIL", "noreply@example.com")

    def _get_provider_client(self):
        return aiosmtplib.SMTP(
            hostname=os.getenv("SMTP_HOST", "smtp.gmail.com"),
            port=int(os.getenv("SMTP_PORT", "587")),
            username=os.getenv("SMTP_USERNAME"),
            password=os.getenv("SMTP_PASSWORD"),
            start_tls=os.getenv("SMTP_START_TLS", "true").lower() == "true",
        )

    async def send_email(
        self,
        *,
        to: str,
        subject: str,
        text: str | None = None,
        html: str | None = None,
        from_email: str | None = None,
    ) -> str:
        msg = MIMEMultipart()
        msg["From"] = from_email or self.from_email
        msg["To"] = to
        msg["Subject"] = subject
        if html:
            msg.attach(MIMEText(html, "html"))
        if text:
            msg.attach(MIMEText(text, "plain"))

        await self.client.connect()
        await self.client.send_message(msg)
        await self.client.quit()
        return "smtp"

    async def build_mime_obj(
        self,
        to: str,
        subject: str,
        html_content: str,
        cc: Optional[str] = None,
        inline_images: Optional[dict[str, bytes]] = None,
    ) -> MIMEMultipart:
        msg = MIMEMultipart()
        msg["From"] = self.from_email
        msg["To"] = to
        msg["Subject"] = subject

        if cc:
            msg["Cc"] = cc

        # Add HTML content
        html_part = MIMEText(html_content, "html")
        msg.attach(html_part)

        # Add inline images
        if inline_images:
            for cid, image_data in inline_images.items():
                image = MIMEImage(image_data)
                image.add_header("Content-ID", f"<{cid}>")
                msg.attach(image)

        return msg

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
        msg = await self.build_mime_obj(to, subject, html_content, cc, inline_images)
        await self.client.connect()
        await self.client.send_message(msg)
        await self.client.quit()
        return "smtp"
