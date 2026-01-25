"""Additional tests for entity.py to increase coverage."""

from unittest import mock

import pytest

from dna.models.entity import (
    Asset,
    Note,
    Playlist,
    Project,
    Shot,
    Task,
    User,
    Version,
)


class TestEntityRepr:
    """Tests for EntityBase.__repr__ method."""

    def test_repr_with_name_attribute(self):
        """Test __repr__ uses name when available."""
        shot = Shot(id=1, name="shot_010")
        result = repr(shot)
        assert result == "<DNA-Shot-shot_010>"

    def test_repr_with_code_attribute(self):
        """Test __repr__ uses code when name is not available."""
        playlist = Playlist(id=1, code="dailies_review")
        result = repr(playlist)
        assert result == "<DNA-Playlist-dailies_review>"

    def test_repr_with_neither_name_nor_code(self):
        """Test __repr__ when neither name nor code is available."""
        project = Project(id=1)
        result = repr(project)
        assert result == "<DNA-Project-None>"


class TestVersionAddNote:
    """Tests for Version.add_note method."""

    def test_add_note_calls_provider(self):
        """Test that add_note calls the prodtrack provider."""
        with mock.patch(
            "dna.models.entity.get_prodtrack_provider"
        ) as mock_get_provider:
            mock_provider = mock.MagicMock()
            mock_get_provider.return_value = mock_provider

            mock_provider.add_entity.return_value = Note(
                id=123, subject="Test Note", content="Test content"
            )

            version = Version(id=1, name="v001")
            note = Note(id=0, subject="Test Note", content="Test content")

            result = version.add_note(note)

            mock_provider.add_entity.assert_called_once_with("note", note)
            assert result.id == 123
            assert result.subject == "Test Note"


class TestProdtrackProviderGetUserByEmail:
    """Tests for get_user_by_email in base class."""

    def test_get_user_by_email_raises_not_implemented(self):
        """Test that get_user_by_email raises NotImplementedError."""
        from dna.prodtrack_providers.prodtrack_provider_base import (
            ProdtrackProviderBase,
        )

        provider = ProdtrackProviderBase()
        with pytest.raises(NotImplementedError, match="Subclasses must implement"):
            provider.get_user_by_email("test@example.com")
