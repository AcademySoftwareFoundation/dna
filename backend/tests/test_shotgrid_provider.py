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

    def test_update_version_status_success(self, provider, mock_shotgun):
        """Test update_version_status calls ShotGrid update and returns True."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        provider._sudo_connection = None

        result = provider.update_version_status(101, "rev")

        assert result is True
        mock_sg_instance.update.assert_called_once_with(
            "Version", 101, {"sg_status_list": "rev"}
        )

    def test_update_version_status_failure(self, provider, mock_shotgun):
        """Test update_version_status returns False when ShotGrid raises."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        provider._sudo_connection = None
        mock_sg_instance.update.side_effect = Exception("ShotGrid error")

        result = provider.update_version_status(101, "rev")

        assert result is False

    def test_update_version_status_not_connected(self, provider, mock_shotgun):
        """Test update_version_status raises when not connected."""
        provider.sg = None
        provider._sudo_connection = None

        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.update_version_status(101, "rev")


class TestShotgridProviderPublishTranscript:
    """publish_transcript / update_transcript write transcripts to the configured SG custom entity."""

    @pytest.fixture
    def mock_shotgun(self):
        with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun") as mock_sg:
            yield mock_sg

    @pytest.fixture
    def provider(self, mock_shotgun):
        with mock.patch.dict(
            os.environ,
            {
                "SHOTGRID_URL": "https://test.shotgunstudio.com",
                "SHOTGRID_SCRIPT_NAME": "test_script",
                "SHOTGRID_API_KEY": "test_key",
            },
        ):
            return ShotgridProvider(connect=True)

    def test_publish_transcript_creates_row_with_default_entity_type(
        self, provider, mock_shotgun
    ):
        """Default entity slot is CustomEntity01."""
        from datetime import date as date_

        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        mock_sg_instance.create.return_value = {"id": 9001}

        entity_id = provider.publish_transcript(
            project_id=1,
            playlist_id=42,
            version_id=101,
            meeting_id="m-abc",
            meeting_date=date_(2026, 4, 15),
            platform="google_meet",
            body="Cameron: hello",
        )

        assert entity_id == 9001
        call_args = mock_sg_instance.create.call_args
        assert call_args[0][0] == "CustomEntity01"
        payload = call_args[0][1]
        assert payload["project"] == {"type": "Project", "id": 1}
        assert payload["sg_playlist"] == {"type": "Playlist", "id": 42}
        assert payload["sg_version_in_review"] == {"type": "Version", "id": 101}
        assert payload["sg_meeting_id"] == "m-abc"
        assert payload["sg_platform"] == "google_meet"
        assert payload["sg_transcript_body"] == "Cameron: hello"
        assert payload["sg_meeting_date"] == "2026-04-15"
        assert "code" in payload and payload["code"]

    def test_publish_transcript_honours_env_override(self, provider, mock_shotgun):
        """SHOTGRID_TRANSCRIPT_ENTITY env var switches the target slot."""
        from datetime import date as date_

        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        mock_sg_instance.create.return_value = {"id": 9002}

        with mock.patch.dict(
            os.environ, {"SHOTGRID_TRANSCRIPT_ENTITY": "CustomEntity05"}
        ):
            provider.publish_transcript(
                project_id=1,
                playlist_id=42,
                version_id=101,
                meeting_id="m-abc",
                meeting_date=date_(2026, 4, 15),
                platform="google_meet",
                body="hello",
            )

        assert mock_sg_instance.create.call_args[0][0] == "CustomEntity05"

    def test_publish_transcript_not_connected_raises(self, provider, mock_shotgun):
        """When not connected, raise a clear error rather than leaking AttributeError."""
        from datetime import date as date_

        provider.sg = None
        provider._sudo_connection = None
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.publish_transcript(
                project_id=1,
                playlist_id=42,
                version_id=101,
                meeting_id="m-abc",
                meeting_date=date_(2026, 4, 15),
                platform="google_meet",
                body="hello",
            )

    def test_update_transcript_only_patches_body_and_date(self, provider, mock_shotgun):
        """Update only patches body and meeting_date; other fields stay untouched."""
        from datetime import date as date_

        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        ok = provider.update_transcript(
            entity_type="CustomEntity01",
            entity_id=9001,
            body="Cameron: updated",
            meeting_date=date_(2026, 4, 16),
        )

        assert ok is True
        call_args = mock_sg_instance.update.call_args
        assert call_args[0][0] == "CustomEntity01"
        assert call_args[0][1] == 9001
        patch = call_args[0][2]
        assert patch == {
            "sg_transcript_body": "Cameron: updated",
            "sg_meeting_date": "2026-04-16",
        }

    def test_update_transcript_uses_caller_supplied_entity_type(
        self, provider, mock_shotgun
    ):
        """entity_type must come from the caller, not from the current env."""
        from datetime import date as date_

        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        with mock.patch.dict(
            os.environ, {"SHOTGRID_TRANSCRIPT_ENTITY": "CustomEntity99"}
        ):
            provider.update_transcript(
                entity_type="CustomEntity01",
                entity_id=9001,
                body="x",
                meeting_date=date_(2026, 4, 16),
            )

        assert mock_sg_instance.update.call_args[0][0] == "CustomEntity01"

    def test_update_transcript_swallows_sg_errors_and_returns_false(
        self, provider, mock_shotgun
    ):
        """Swallow SG write errors and return False so the endpoint can decide based on body_hash."""
        from datetime import date as date_

        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        mock_sg_instance.update.side_effect = Exception("sg boom")

        ok = provider.update_transcript(
            entity_type="CustomEntity01",
            entity_id=9001,
            body="x",
            meeting_date=date_(2026, 4, 16),
        )

        assert ok is False


class TestShotgridProviderPublishVideoSegments:
    """publish/update_video_segments create clip Versions linked to a row."""

    @pytest.fixture
    def mock_shotgun(self):
        with mock.patch("dna.prodtrack_providers.shotgrid.Shotgun") as mock_sg:
            yield mock_sg

    @pytest.fixture
    def provider(self, mock_shotgun):
        with mock.patch.dict(
            os.environ,
            {
                "SHOTGRID_URL": "https://test.shotgunstudio.com",
                "SHOTGRID_SCRIPT_NAME": "test_script",
                "SHOTGRID_API_KEY": "test_key",
            },
        ):
            return ShotgridProvider(connect=True)

    @staticmethod
    def _clips(n=2):
        from dna.models.meeting_recording import VideoSegmentClipPayload

        return [
            VideoSegmentClipPayload(
                code=f"clip-{i}",
                file_path=f"/tmp/clip-{i}.mp4",
                video_in_seconds=float(i * 10),
                video_out_seconds=float(i * 10 + 5),
                duration_seconds=5.0,
            )
            for i in range(n)
        ]

    def test_publish_creates_row_with_default_entity_and_clip_versions(
        self, provider, mock_shotgun
    ):
        """Default slot CustomEntity14; one Version per clip is created+uploaded."""
        from datetime import date as date_

        sg = mock_shotgun.return_value
        provider.sg = sg
        # First create() is the row; subsequent create() calls are clip Versions.
        sg.create.side_effect = [{"id": 7000}, {"id": 8001}, {"id": 8002}]

        entity_id = provider.publish_video_segments(
            project_id=1,
            playlist_id=42,
            version_id=101,
            meeting_id="m-abc",
            meeting_date=date_(2026, 4, 15),
            platform="zoom",
            clips=self._clips(2),
        )

        assert entity_id == 7000

        # Row creation: first create call, default entity slot + expected fields.
        row_call = sg.create.call_args_list[0]
        assert row_call[0][0] == "CustomEntity14"
        row_payload = row_call[0][1]
        assert row_payload["project"] == {"type": "Project", "id": 1}
        assert row_payload["sg_playlist"] == {"type": "Playlist", "id": 42}
        assert row_payload["sg_version_in_review"] == {"type": "Version", "id": 101}
        assert row_payload["sg_meeting_id"] == "m-abc"
        assert row_payload["sg_meeting_date"] == "2026-04-15"
        assert row_payload["sg_platform"] == "zoom"
        assert row_payload["code"]

        # Two clip Versions created.
        version_calls = [c for c in sg.create.call_args_list if c[0][0] == "Version"]
        assert len(version_calls) == 2

        # Each clip MP4 uploaded to the configured movie field.
        assert sg.upload.call_count == 2
        up = sg.upload.call_args_list[0]
        assert up[0][0] == "Version"
        assert up[0][1] == 8001
        assert up[0][2] == "/tmp/clip-0.mp4"
        assert up.kwargs["field_name"] == "sg_uploaded_movie"

        # Clips linked back onto the row via the link field.
        link_update = sg.update.call_args
        assert link_update[0][0] == "CustomEntity14"
        assert link_update[0][1] == 7000
        assert link_update[0][2]["sg_clips"] == [
            {"type": "Version", "id": 8001},
            {"type": "Version", "id": 8002},
        ]

    def test_publish_honours_entity_and_field_env_overrides(
        self, provider, mock_shotgun
    ):
        from datetime import date as date_

        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.create.side_effect = [{"id": 7001}, {"id": 8003}]

        with mock.patch.dict(
            os.environ,
            {
                "SHOTGRID_VIDEO_SEGMENT_ENTITY": "CustomEntity07",
                "SHOTGRID_CLIP_MOVIE_FIELD": "sg_movie",
                "SHOTGRID_CLIP_LINK_FIELD": "sg_linked_clips",
            },
        ):
            provider.publish_video_segments(
                project_id=1,
                playlist_id=42,
                version_id=101,
                meeting_id="m-abc",
                meeting_date=date_(2026, 4, 15),
                platform="zoom",
                clips=self._clips(1),
            )

        assert sg.create.call_args_list[0][0][0] == "CustomEntity07"
        assert sg.upload.call_args.kwargs["field_name"] == "sg_movie"
        assert "sg_linked_clips" in sg.update.call_args[0][2]

    def test_publish_with_no_clips_skips_link_update(self, provider, mock_shotgun):
        from datetime import date as date_

        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.create.return_value = {"id": 7002}

        entity_id = provider.publish_video_segments(
            project_id=1,
            playlist_id=42,
            version_id=101,
            meeting_id="m-abc",
            meeting_date=date_(2026, 4, 15),
            platform="zoom",
            clips=[],
        )

        assert entity_id == 7002
        sg.upload.assert_not_called()
        sg.update.assert_not_called()

    def test_publish_not_connected_raises(self, provider, mock_shotgun):
        from datetime import date as date_

        provider.sg = None
        provider._sudo_connection = None
        with pytest.raises(ValueError, match="Not connected to ShotGrid"):
            provider.publish_video_segments(
                project_id=1,
                playlist_id=42,
                version_id=101,
                meeting_id="m-abc",
                meeting_date=date_(2026, 4, 15),
                platform="zoom",
                clips=self._clips(1),
            )

    def test_update_uses_caller_entity_type_not_env(self, provider, mock_shotgun):
        from datetime import date as date_

        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.create.return_value = {"id": 8005}

        with mock.patch.dict(
            os.environ, {"SHOTGRID_VIDEO_SEGMENT_ENTITY": "CustomEntity99"}
        ):
            ok = provider.update_video_segments(
                entity_type="CustomEntity02",
                entity_id=7000,
                project_id=1,
                meeting_date=date_(2026, 4, 16),
                clips=self._clips(1),
            )

        assert ok is True
        # Pinned to the bookkeeping slot, not the (now different) env slot.
        assert sg.update.call_args[0][0] == "CustomEntity02"
        patch = sg.update.call_args[0][2]
        assert patch["sg_meeting_date"] == "2026-04-16"
        assert patch["sg_clips"] == [{"type": "Version", "id": 8005}]

    def test_update_not_connected_returns_false(self, provider, mock_shotgun):
        from datetime import date as date_

        provider.sg = None
        provider._sudo_connection = None
        ok = provider.update_video_segments(
            entity_type="CustomEntity02",
            entity_id=7000,
            project_id=1,
            meeting_date=date_(2026, 4, 16),
            clips=self._clips(1),
        )
        assert ok is False

    def test_update_swallows_sg_errors_and_returns_false(self, provider, mock_shotgun):
        from datetime import date as date_

        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.create.side_effect = Exception("sg boom")

        ok = provider.update_video_segments(
            entity_type="CustomEntity02",
            entity_id=7000,
            project_id=1,
            meeting_date=date_(2026, 4, 16),
            clips=self._clips(1),
        )
        assert ok is False
