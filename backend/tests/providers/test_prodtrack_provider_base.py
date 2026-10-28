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

    def test_get_schema_raises_not_implemented(self):
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.get_schema("shot")

    def test_conform_value_defaults_to_passthrough(self):
        provider = ProdtrackProviderBase()
        assert provider.conform_value_to_prodtrack_system("x", "date_time") == "x"

    def test_update_entity_raises_not_implemented(self):
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.update_entity("shot", "1", {}, {})

    def test_update_transcript_raises_not_implemented(self):
        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError):
            provider.update_transcript(
                entity_type="CustomEntity01",
                entity_id=9001,
                body="Speaker: updated",
                meeting_date=date(2026, 4, 15),
            )
