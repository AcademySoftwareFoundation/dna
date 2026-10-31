"""
Email Provider Base.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from dna.models.draft_note import DraftNote
    from dna.models.entity import Playlist, Project, User, Version


class EmailProviderBase(ABC):

    EMAIL_PROVIDER_NAME = None

    DEFAULT_TIMEOUT = 30.0

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: Optional[float] = None,
    ):

        if self.EMAIL_PROVIDER_NAME is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} missing EMAIL_PROVIDER_NAME"
            )

        self.api_key = api_key or os.getenv(f"{self.EMAIL_PROVIDER_NAME}_API_KEY")

        self.timeout = timeout or float(
            os.getenv(
                f"{self.EMAIL_PROVIDER_NAME}_TIMEOUT",
                str(self.DEFAULT_TIMEOUT),
            )
        )

        self._client = None

    @property
    def client(self):

        if self._client is None:
            self._client = self._get_provider_client()

        return self._client

    @abstractmethod
    def _get_provider_client(self): ...

    @abstractmethod
    async def send_email(
        self,
        *,
        to: str,
        subject: str,
        text: str | None = None,
        html: str | None = None,
        from_email: str | None = None,
    ) -> str:
        """
        Returns provider message id.
        """

    @abstractmethod
    async def build_mime_obj(
        self,
        to: str,
        subject: str,
        html_content: str,
        cc: Optional[str] = None,
        inline_images: Optional[dict[str, bytes]] = None,
    ) -> MIMEMultipart:
        """Build a MIME multipart email object with optional inline images."""

    @abstractmethod
    async def build_message(
        self,
        playlist: Playlist,
        project: Project,
        sent_by: User,
        versions: list[Version],
        drafts: list[DraftNote],
        playlist_url: str,
    ) -> tuple[str, str, str]:
        """Build the email subject, text, and HTML content for a summary email.

        Returns:
            (subject, text_content, html_content)
        """

    @abstractmethod
    async def send(
        self,
        to: str,
        subject: str,
        html_content: str,
        cc: Optional[str] = None,
        inline_images: Optional[dict[str, bytes]] = None,
    ) -> str:
        """Send an email using the configured provider.

        Args:
            to: Recipient email address
            subject: Email subject
            html_content: HTML content
            cc: Optional CC email address
            inline_images: Optional dict of {cid: image_data} for inline images

        Returns:
            Provider message ID
        """

    async def close(self):

        if self._client and hasattr(self._client, "aclose"):
            await self._client.aclose()

        self._client = None


def get_email_provider() -> EmailProviderBase:
    """Factory function to get the configured email provider."""

    provider = os.getenv("EMAIL_PROVIDER", "noop").lower()

    if provider == "sendgrid":
        from dna.email_providers.sendgrid_provider import SendGridProvider

        return SendGridProvider()

    if provider == "resend":
        from dna.email_providers.resend_provider import ResendProvider

        return ResendProvider()

    if provider == "smtp":
        from dna.email_providers.smtp_provider import SMTPProvider

        return SMTPProvider()

    if provider == "noop":
        from dna.email_providers.noop_provider import NoopProvider

        return NoopProvider()

    raise ValueError(f"Unknown email provider: {provider}")
