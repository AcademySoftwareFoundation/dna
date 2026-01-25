"""Tests for legacy model classes that have 0% coverage."""

from dna.models.playlist import Playlist as LegacyPlaylist
from dna.models.version import Version as LegacyVersion


class TestLegacyPlaylist:
    """Tests for the legacy Playlist class in models/playlist.py."""

    def test_init_exists(self):
        """Test that legacy Playlist can be instantiated."""
        playlist = LegacyPlaylist()
        assert playlist is not None


class TestLegacyVersion:
    """Tests for the legacy Version class in models/version.py."""

    def test_init_exists(self):
        """Test that legacy Version can be instantiated."""
        version = LegacyVersion()
        assert version is not None
