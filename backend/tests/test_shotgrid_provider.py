"""Tests for ShotgridProvider refactoring."""

import os
from unittest import mock

import pytest
from shotgun_api3 import Shotgun

from dna.prodtrack_providers.prodtrack_provider_base import UserNotFoundError
from dna.prodtrack_providers.shotgrid import ShotgridProvider


class TestShotgridProviderRefactor:
    """Tests for ShotgridProvider refactoring (sudo support)."""

    @pytest.fixture
    def mock_shotgun(self):
        """Mock shotgun_api3.Shotgun class."""
        with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun") as mock_sg:
            yield mock_sg

    @pytest.fixture
    def provider(self, mock_shotgun):
        """Create a ShotgridProvider instance."""
        with mock.patch.dict(
            os.environ,
            {
                "SHOTGRID_URL": "https://test.shotgunstudio.com",
                "SHOTGRID_SCRIPT_NAME": "test_script",
                "SHOTGRID_API_KEY": "test_key",
            },
        ):
            return ShotgridProvider(connect=True)

    def test_init_connects_by_default(self, mock_shotgun):
        """Test that __init__ connects by default."""
        with mock.patch.dict(
            os.environ,
            {
                "SHOTGRID_URL": "https://test.shotgunstudio.com",
                "SHOTGRID_SCRIPT_NAME": "test_script",
                "SHOTGRID_API_KEY": "test_key",
            },
        ):
            provider = ShotgridProvider()
            mock_shotgun.assert_called_once_with(
                "https://test.shotgunstudio.com",
                "test_script",
                "test_key",
                sudo_as_login=None,
            )
            assert provider.sg is not None

    def test_init_with_sudo_user(self, mock_shotgun):
        """Test that __init__ accepts sudo_user."""
        with mock.patch.dict(
            os.environ,
            {
                "SHOTGRID_URL": "https://test.shotgunstudio.com",
                "SHOTGRID_SCRIPT_NAME": "test_script",
                "SHOTGRID_API_KEY": "test_key",
            },
        ):
            provider = ShotgridProvider(sudo_user="admin")
            mock_shotgun.assert_called_once_with(
                "https://test.shotgunstudio.com",
                "test_script",
                "test_key",
                sudo_as_login="admin",
            )
            assert provider.sudo_user == "admin"

    def test_set_sudo_user_reconnects(self, provider, mock_shotgun):
        """Test that set_sudo_user updates sudo_user and reconnects."""
        # Reset mock to clear init call
        mock_shotgun.reset_mock()

        provider.set_sudo_user("new_admin")

        assert provider.sudo_user == "new_admin"
        mock_shotgun.assert_called_once_with(
            "https://test.shotgunstudio.com",
            "test_script",
            "test_key",
            sudo_as_login="new_admin",
        )

    def test_sudo_context_manager(self, provider, mock_shotgun):
        """Test that sudo context manager temporarily switches user."""
        # Main connection
        assert provider._sg == provider.sg

        # Configure mock_shotgun to return valid mocks that are different
        # We need this because provider.sudo() creates a NEW Shotgun instance
        # and we leverage that reference equality to check if we switched connections
        mock_shotgun.side_effect = [mock.MagicMock(), mock.MagicMock()]

        # Reset mock to clear previous calls
        mock_shotgun.reset_mock()

        with provider.sudo("temp_user"):
            # Inside context, _sg should be the temporary connection
            assert provider._sg != provider.sg
            assert provider._sudo_connection is not None

            # Verify temporary connection was created with correct user
            mock_shotgun.assert_called_with(
                "https://test.shotgunstudio.com",
                "test_script",
                "test_key",
                sudo_as_login="temp_user",
            )

            # Verify logic uses _sg (mocked Find call)
            provider._sg.find.return_value = []
            provider.find("shot", [])
            provider._sg.find.assert_called()

        # After context, should revert to main connection
        assert provider._sg == provider.sg
        assert provider._sudo_connection is None

    def test_sudo_context_manager_nested_or_exception(self, provider, mock_shotgun):
        """Test sudo context manager cleanup on exception."""
        original_sg = provider.sg

        try:
            with provider.sudo("error_user"):
                raise ValueError("Oops")
        except ValueError:
            pass

        # Should cleanly revert
        assert provider._sg == original_sg
        assert provider._sudo_connection is None

    def test_publish_note_creates_note(self, provider, mock_shotgun):
        """Test publish_note creates a note with correct data."""
        # Setup mocks
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        # Mock version find
        mock_sg_instance.find_one.side_effect = [
            # 1. Version lookup
            {"id": 101, "project": {"type": "Project", "id": 1}},
            # 2. Duplicate check (None = no duplicate)
            None,
            # 3. User lookup (if applicable) - skipped if email is None
        ]

        mock_sg_instance.create.return_value = {"id": 200}

        # Execute
        note_id = provider.publish_note(
            version_id=101,
            content="Test content",
            subject="Test subject",
            to_users=[],
            cc_users=[],
            links=[],
        )

        assert note_id == 200
        mock_sg_instance.create.assert_called_once()
        call_args = mock_sg_instance.create.call_args
        assert call_args[0][0] == "Note"
        data = call_args[0][1]
        assert data["content"] == "Test content"
        assert data["subject"] == "Test subject"
        assert data["project"] == {"type": "Project", "id": 1}

    def test_publish_note_handles_duplicate(self, provider, mock_shotgun):
        """Test publish_note returns existing ID if duplicate found."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        mock_sg_instance.find_one.side_effect = [
            # 1. Version lookup
            {"id": 101, "project": {"type": "Project", "id": 1}},
            # 2. Duplicate check (Finds existing)
            {"id": 999},
        ]

        note_id = provider.publish_note(
            version_id=101,
            content="Check",
            subject="Check",
            to_users=[],
            cc_users=[],
            links=[],
        )

        assert note_id == 999
        mock_sg_instance.create.assert_not_called()

    def test_publish_note_with_author(self, provider, mock_shotgun):
        """Test publish_note uses sudo when author is provided."""
        mock_sg_instance = mock_shotgun.return_value
        # Reset side effect connection mocking issues
        # provider._sg accesses self._sudo_connection or self.sg.
        # self.sg comes from init.
        # We need to ensure logic flow works.

        # Mock find calls
        # We need flexible side_effect because sudo() might trigger new Shotgun() calls

        # Let's mock the main connection's methods
        provider.sg.find_one.side_effect = [
            # 1. Version lookup (main conn)
            {"id": 101, "project": {"type": "Project", "id": 1}},
            # 2. Duplicate check (main conn)
            None,
        ]

        # Mock get_user_by_email
        with mock.patch.object(provider, "get_user_by_email") as mock_get_user:
            mock_user = mock.Mock()
            mock_user.login = "author_login"
            mock_get_user.return_value = mock_user

            # Use real sudo logic which creates new Shotgun instance
            # We want to verify that create is called on the NEW instance

            note_id = provider.publish_note(
                version_id=101,
                content="C",
                subject="S",
                to_users=[],
                cc_users=[],
                links=[],
                author_email="auth@ex.com",
            )

            # verify sudo call
            # mock_shotgun was called for init, then for sudo.
            # last call to Shotgun class should have sudo_as_login='author_login'
            assert mock_shotgun.call_args[1]["sudo_as_login"] == "author_login"

            # Verify create called on the returned instance
            sudo_instance = mock_shotgun.return_value
            sudo_instance.create.assert_called()

    def test_publish_note_raises_error_when_author_not_found(
        self, provider, mock_shotgun
    ):
        """Test publish_note raises error when author email is not found."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        # Mock find calls
        provider.sg.find_one.side_effect = [
            # 1. Version lookup
            {"id": 101, "project": {"type": "Project", "id": 1}},
            # 2. Duplicate check (None = no duplicate)
            None,
            # 3. User lookup (raising ValueError)
        ]

        # Mock get_user_by_email to raise ValueError
        with mock.patch.object(provider, "get_user_by_email") as mock_get_user:
            mock_get_user.side_effect = ValueError("User not found")

            # Expect UserNotFoundError (which wraps the ValueError)
            with pytest.raises(
                UserNotFoundError,
                match="Author not found in ShotGrid: unknown@example.com",
            ):
                provider.publish_note(
                    version_id=101,
                    content="Test",
                    subject="Test",
                    to_users=[],
                    cc_users=[],
                    links=[],
                    author_email="unknown@example.com",
                )
