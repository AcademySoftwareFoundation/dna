"""Tests for the ProdtrackProviderBase abstract surface."""

from datetime import date

import pytest

from dna.prodtrack_providers.prodtrack_provider_base import ProdtrackProviderBase


class TestProdtrackProviderBaseTranscriptContract:
    """Base class transcript methods must raise NotImplementedError."""

    def test_publish_transcript_raises_not_implemented(self):
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError):
            provider.publish_transcript(
                project_id=1,
                playlist_id=10,
                version_id=100,
                meeting_id="m-1",
                meeting_date=date(2026, 4, 15),
                platform="google_meet",
                body="Speaker: hi",
            )

    def test_update_transcript_raises_not_implemented(self):
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError):
            provider.update_transcript(
                entity_type="CustomEntity01",
                entity_id=9001,
                body="Speaker: updated",
                meeting_date=date(2026, 4, 15),
            )


class TestProdtrackProviderBaseVideoSegmentContract:
    """Base class video-segment method must raise NotImplementedError."""

    def test_attach_clip_versions_raises_not_implemented(self):
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError):
            provider.attach_clip_versions(
                entity_type="CustomEntity14",
                entity_id=9001,
                project_id=1,
                clips=[],
            )
