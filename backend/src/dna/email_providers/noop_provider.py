import logging

from dna.email_providers.email_provider_base import EmailProviderBase

logger = logging.getLogger(__name__)


class NoopProvider(EmailProviderBase):

    EMAIL_PROVIDER_NAME = "NOOP"

    def _get_provider_client(self):
        return None

    async def send_email(
        self,
        *,
        to,
        subject,
        text=None,
        html=None,
        from_email=None,
    ):

        logger.info(
            "EMAIL\nTo=%s\nSubject=%s\n%s",
            to,
            subject,
            text or html,
        )

        return "noop"
