"""Email Providers package.

Provides email backend for sending emails.
"""

from dna.email_providers.email_provider_base import EmailProviderBase, get_email_provider

__all__ = ["EmailProviderBase", "get_email_provider"]

