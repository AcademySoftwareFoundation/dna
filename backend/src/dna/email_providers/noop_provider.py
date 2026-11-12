from dna.email_providers.email_provider_base import EmailProviderBase


class NoopProvider(EmailProviderBase):

    EMAIL_PROVIDER_NAME = "NOOP"

    def _get_provider_client(self):
        return None

    async def build_message(self, *args, **kwargs) -> tuple[str, str, str]:
        return ("Summary Email", "Text content", "<html>HTML content</html>")

    async def send(self, *args, **kwargs) -> str:
        print(f"Email sent (noop): args={args}, kwargs={kwargs}")
        return "noop"
