"""Server-side configuration for the Chrome transcription extension."""

import os
from typing import Optional

from fastapi import HTTPException

from dna.models.extension_config import ExtensionTranscriptionConfig


def get_extension_transcription_config() -> ExtensionTranscriptionConfig:
    """Load extension STT settings from environment variables."""
    stt_url = os.getenv(
        "TRANSCRIPTION_STT_URL",
        "https://transcription.vexa.ai/v1/audio/transcriptions",
    )
    stt_api_key = os.getenv("TRANSCRIPTION_STT_API_KEY", "")
    stt_model = os.getenv("TRANSCRIPTION_STT_MODEL", "whisper-1")
    chunk_duration_ms = int(os.getenv("TRANSCRIPTION_CHUNK_DURATION_MS", "5000"))
    language = os.getenv("TRANSCRIPTION_STT_LANGUAGE") or None

    provider = os.getenv("TRANSCRIPTION_PROVIDER", "vexa")
    if provider == "browser_extension" and not stt_api_key:
        raise HTTPException(
            status_code=503,
            detail="TRANSCRIPTION_STT_API_KEY is not configured",
        )

    return ExtensionTranscriptionConfig(
        stt_url=stt_url,
        stt_api_key=stt_api_key,
        stt_model=stt_model,
        chunk_duration_ms=chunk_duration_ms,
        language=language,
    )
