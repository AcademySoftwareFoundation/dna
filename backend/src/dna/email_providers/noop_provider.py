import logging
from email.mime.multipart import MIMEMultipart

from dna.email_providers.email_provider_base import EmailProviderBase

logger = logging.getLogger(__name__)


class NoopProvider(EmailProviderBase):

    EMAIL_PROVIDER_NAME = "NOOP"

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
        logger.info("Email sent (noop): to=%s", to)
        return "noop"

    async def build_mime_obj(self, *args, **kwargs) -> MIMEMultipart:
        return MIMEMultipart()

    async def build_message(self, *args, **kwargs) -> tuple[str, str, str]:
        return ("Summary Email", "Text content", "<html>HTML content</html>")

    async def send(self, *args, **kwargs) -> str:
        logger.info("Email sent (noop): %s", args)
        return "noop"
