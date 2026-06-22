"""Configuration returned to the Chrome transcription extension via DNA."""

from typing import Optional

from pydantic import BaseModel, Field


class ExtensionTranscriptionConfig(BaseModel):
    """STT and capture settings managed server-side and passed to the extension."""

    stt_url: str = Field(
        ...,
        description="OpenAI-compatible transcription endpoint URL",
    )
    stt_api_key: str = Field(
        ...,
        description="API key for the transcription service",
    )
    stt_model: str = Field(default="whisper-1")
    chunk_duration_ms: int = Field(default=5000, ge=1000, le=60000)
    language: Optional[str] = Field(
        default=None,
        description="Optional language hint for STT",
    )
