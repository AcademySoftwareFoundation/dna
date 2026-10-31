import httpx

from dna.email_providers.email_provider_base import EmailProviderBase


class ResendProvider(EmailProviderBase):

    EMAIL_PROVIDER_NAME = "RESEND"

    def _get_provider_client(self):
        return httpx.AsyncClient(base_url="https://api.resend.com")

    async def send_email(
        self,
        *,
        to,
        subject,
        text=None,
        html=None,
        from_email=None,
    ):

        response = await self.client.post(
            "/emails",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "from": from_email,
                "to": [to],
                "subject": subject,
                "text": text,
                "html": html,
            },
        )

        response.raise_for_status()

        return response.json()["id"]
