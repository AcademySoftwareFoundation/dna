import base64
import os
from email.mime.multipart import MIMEMultipart
from typing import Optional

import httpx

from dna.email_providers.email_builder import EmailBuilder
from dna.email_providers.email_provider_base import EmailProviderBase


class ResendProvider(EmailProviderBase):
    EMAIL_PROVIDER_NAME = "RESEND"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.from_email = os.getenv("RESEND_FROM_EMAIL", "noreply@example.com")

    def _get_provider_client(self):
        return httpx.AsyncClient(base_url="https://api.resend.com")

    async def _post_email(self, payload: dict) -> str:
        """Send a request to the Resend API and return the message ID."""
        response = await self.client.post(
            "/emails",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
        )
        response.raise_for_status()
        return response.json()["id"]

    async def send_email(
        self,
        *,
        to: str,
        subject: str,
        text: str | None = None,
        html: str | None = None,
        from_email: str | None = None,
    ) -> str:
        payload = {
            "from": from_email or self.from_email,
            "to": [to],
            "subject": subject,
        }

        if text:
            payload["text"] = text
        if html:
            payload["html"] = html

        return await self._post_email(payload)

    async def build_mime_obj(self, *args, **kwargs) -> MIMEMultipart:
        raise NotImplementedError("Resend uses its own API")

    async def build_message(self, *args, **kwargs) -> tuple[str, str, str]:
        return EmailBuilder.build_message(*args, **kwargs)

    async def send(
        self,
        to: str,
        subject: str,
        html_content: str,
        cc: Optional[str] = None,
        inline_images: Optional[dict[str, bytes]] = None,
        from_email: Optional[str] = None,
    ) -> str:
        payload = {
            "from": from_email or self.from_email,
            "to": [to],
            "subject": subject,
            "html": html_content,
        }

        if cc:
            payload["cc"] = [cc]

        if inline_images:
            payload["attachments"] = [
                {
                    "content": base64.b64encode(image_data).decode(),
                    "filename": cid,
                    "content_type": "image/png",
                    "disposition": "inline",
                }
                for cid, image_data in inline_images.items()
            ]

        return await self._post_email(payload)
