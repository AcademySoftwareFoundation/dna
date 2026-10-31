from email.message import EmailMessage

import aiosmtplib

from dna.email_providers.email_provider_base import EmailProviderBase


class SMTPProvider(EmailProviderBase):

    EMAIL_PROVIDER_NAME = "SMTP"

    def _get_provider_client(self):

        return aiosmtplib.SMTP(
            hostname="smtp.gmail.com",
            port=587,
            username=self.api_key,
            password="...",
            start_tls=True,
        )

    async def send_email(
        self,
        *,
        to,
        subject,
        text=None,
        html=None,
        from_email=None,
    ):

        msg = EmailMessage()

        msg["From"] = from_email
        msg["To"] = to
        msg["Subject"] = subject

        if text:
            msg.set_content(text)

        if html:
            msg.add_alternative(html, subtype="html")

        await self.client.connect()
        await self.client.send_message(msg)
        await self.client.quit()

        return "smtp"
