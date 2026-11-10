"""Tests for ShotgridProvider refactoring."""

import os
from unittest import mock

import pytest
from shotgun_api3 import Shotgun

from dna.auth.identity import CurrentUser
from dna.prodtrack_providers.prodtrack_provider_base import UserNotFoundError
from dna.prodtrack_providers.shotgrid import ShotgridProvider

USER = CurrentUser(sub="jdoe", email="jdoe@example.com")


class TestShotgridProviderRefactor:
    """Tests for ShotgridProvider connections, per-user scoping, and writes."""

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

    def test_init_connects_as_script_user(self, mock_shotgun):
        """Test that __init__ opens a plain script connection."""
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
                "https://test.shotgunstudio.com", "test_script", "test_key"
            )
            assert provider.sg is not None

    def test_for_user_runs_as_resolved_login(self, provider, mock_shotgun):
        """for_user resolves the email to a login and connects with sudo_as_login."""
        script_sg = provider.sg
        user_sg = mock.MagicMock()
        mock_shotgun.reset_mock()
        mock_shotgun.return_value = user_sg
        script_sg.find_one.return_value = {
            "id": 42,
            "name": "Jane",
            "email": "jdoe@example.com",
            "login": "jdoe",
        }

        scoped = provider.for_user(USER)

        script_sg.find_one.assert_called_once_with(
            "HumanUser",
            filters=[["email", "is", "jdoe@example.com"]],
            fields=["id", "name", "email", "login"],
        )
        mock_shotgun.assert_called_once_with(
            "https://test.shotgunstudio.com",
            "test_script",
            "test_key",
            sudo_as_login="jdoe",
        )
        assert scoped is not provider
        assert scoped._sg is user_sg
        assert provider._sg is script_sg

        user_sg.find.return_value = []
        scoped.find("shot", [])
        user_sg.find.assert_called_once()
        script_sg.find.assert_not_called()

    def test_for_user_caches_login_and_connection(self, provider, mock_shotgun):
        """Repeat requests for a user reuse the lookup and the sudo connection."""
        script_sg = provider.sg
        mock_shotgun.reset_mock()
        script_sg.find_one.return_value = {"id": 42, "login": "jdoe"}

        first = provider.for_user(USER)
        second = provider.for_user(CurrentUser(sub="jdoe", email="JDoe@Example.com "))

        assert script_sg.find_one.call_count == 1
        assert mock_shotgun.call_count == 1
        assert first._sg is second._sg

    def test_for_user_unknown_email_raises(self, provider):
        """for_user raises UserNotFoundError and does not cache the miss."""
        provider.sg.find_one.return_value = None

        with pytest.raises(UserNotFoundError, match="jdoe@example.com"):
            provider.for_user(USER)

        provider.sg.find_one.return_value = {"id": 42, "login": "jdoe"}
        assert provider.for_user(USER) is not None

    def test_for_user_user_without_login_raises(self, provider):
        """A HumanUser with no login cannot be impersonated."""
        provider.sg.find_one.return_value = {"id": 42, "login": None}

        with pytest.raises(UserNotFoundError, match="no login"):
            provider.for_user(USER)

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
            # 3. Transcript lookup (None = no transcript to link)
            None,
        ]

        mock_sg_instance.create.return_value = {"id": 200}

        # Execute
        note_id = provider.publish_note(
            version_id="101",
            content="Test content",
            subject="Test subject",
            to_users=[],
            cc_users=[],
            links=[],
        )

        assert note_id == "200"
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
            # 3. Transcript lookup
            None,
        ]

        note_id = provider.publish_note(
            version_id="101",
            content="Check",
            subject="Check",
            to_users=[],
            cc_users=[],
            links=[],
        )

        assert note_id == "999"
        mock_sg_instance.create.assert_not_called()

    def test_update_version_status_success(self, provider, mock_shotgun):
        """Test update_version_status calls ShotGrid update and returns True."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        result = provider.update_version_status(101, "rev")

        assert result is True
        mock_sg_instance.update.assert_called_once_with(
            "Version", 101, {"sg_status_list": "rev"}
        )

    def test_update_note_without_links_leaves_note_links_alone(
        self, provider, mock_shotgun
    ):
        """No links argument means note_links is not touched."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance

        result = provider.update_note(note_id="505", content="Body", subject="Sub")

        assert result is True
        mock_sg_instance.find_one.assert_not_called()
        mock_sg_instance.update.assert_called_once_with(
            "Note", 505, {"content": "Body", "subject": "Sub"}
        )

    def test_update_note_merges_links_with_existing(self, provider, mock_shotgun):
        """Requested links are unioned with the note's current links (#222)."""
        from dna.models.entity import Playlist, Shot

        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        mock_sg_instance.find_one.side_effect = [
            # 1. Current note_links
            {
                "id": 505,
                "note_links": [
                    {"type": "Version", "id": 104, "name": "v001"},
                    {"type": "Shot", "id": 7, "name": "added_by_hand"},
                ],
            },
            # 2. Transcript lookup (none to link)
            None,
        ]

        result = provider.update_note(
            note_id="505",
            content="Body",
            version_id="104",
            links=[Shot(id="42"), Playlist(id="100"), Shot(id="7")],
        )

        assert result is True
        assert mock_sg_instance.find_one.call_args_list[0] == mock.call(
            "Note", [["id", "is", 505]], ["note_links"]
        )
        mock_sg_instance.update.assert_called_once_with(
            "Note",
            505,
            {
                "content": "Body",
                "note_links": [
                    {"type": "Version", "id": 104},
                    {"type": "Shot", "id": 7},
                    {"type": "Shot", "id": 42},
                    {"type": "Playlist", "id": 100},
                ],
            },
        )

    def test_update_version_status_failure(self, provider, mock_shotgun):
        """Test update_version_status returns False when ShotGrid raises."""
        mock_sg_instance = mock_shotgun.return_value
        provider.sg = mock_sg_instance
        mock_sg_instance.update.side_effect = Exception("ShotGrid error")

        result = provider.update_version_status(101, "rev")

        assert result is False

    def test_update_version_status_not_connected(self, provider, mock_shotgun):
        """Test update_version_status raises when not connected."""
        provider.sg = None

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

        assert entity_id == "9001"
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


class TestShotgridProviderNoteTranscriptLink:
    """Published notes point at their version's transcript row via sg_linked_transcript.

    The row is found in ShotGrid, not DNA's bookkeeping, and linking is best
    effort: it never fails the note itself.
    """

    VERSION = {"id": 101, "project": {"type": "Project", "id": 1}}
    TRANSCRIPT = {"type": "CustomEntity01", "id": 9001}
    LINK = {"sg_linked_transcript": {"type": "CustomEntity01", "id": 9001}}

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

    def _publish(self, provider, **kwargs):
        return provider.publish_note(
            version_id="101",
            content="Body",
            subject="Sub",
            to_users=[],
            cc_users=[],
            links=[],
            **kwargs,
        )

    def test_publish_note_links_newest_transcript_for_version(
        self, provider, mock_shotgun
    ):
        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.find_one.side_effect = [self.VERSION, None, self.TRANSCRIPT]
        sg.create.return_value = {"id": 200}

        assert self._publish(provider) == "200"

        assert sg.find_one.call_args_list[2] == mock.call(
            "CustomEntity01",
            [["sg_version_in_review", "is", {"type": "Version", "id": 101}]],
            ["id"],
            order=[{"field_name": "updated_at", "direction": "desc"}],
        )
        sg.update.assert_called_once_with("Note", 200, self.LINK)

    def test_publish_note_looks_up_configured_transcript_entity(
        self, provider, mock_shotgun
    ):
        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.find_one.side_effect = [self.VERSION, None, None]
        sg.create.return_value = {"id": 200}

        with mock.patch.dict(
            os.environ, {"SHOTGRID_TRANSCRIPT_ENTITY": "CustomEntity05"}
        ):
            self._publish(provider)

        assert sg.find_one.call_args_list[2][0][0] == "CustomEntity05"

    def test_publish_note_without_transcript_leaves_field_alone(
        self, provider, mock_shotgun
    ):
        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.find_one.side_effect = [self.VERSION, None, None]
        sg.create.return_value = {"id": 200}

        assert self._publish(provider) == "200"
        sg.update.assert_not_called()

    def test_publish_note_still_succeeds_when_linking_fails(
        self, provider, mock_shotgun, caplog
    ):
        """No transcript entity / no Note field on the site: warn, don't fail."""
        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.find_one.side_effect = [self.VERSION, None, Exception("no such entity")]
        sg.create.return_value = {"id": 200}

        with caplog.at_level("WARNING"):
            assert self._publish(provider) == "200"

        sg.update.assert_not_called()
        assert "Could not link note 200" in caplog.text

    def test_publish_note_for_user_runs_entirely_as_that_user(
        self, provider, mock_shotgun
    ):
        """On a scoped provider the create and the link write both use the user's connection."""
        script_sg = mock_shotgun.return_value
        provider.sg = script_sg
        script_sg.find_one.return_value = {"id": 42, "login": "author_login"}
        author_sg = mock.MagicMock()
        author_sg.find_one.side_effect = [self.VERSION, None, self.TRANSCRIPT]
        author_sg.create.return_value = {"id": 200}
        mock_shotgun.return_value = author_sg

        scoped = provider.for_user(CurrentUser(sub="a", email="auth@ex.com"))
        assert self._publish(scoped) == "200"

        author_sg.create.assert_called_once()
        author_sg.update.assert_called_once_with("Note", 200, self.LINK)
        script_sg.create.assert_not_called()
        script_sg.update.assert_not_called()

    def test_publish_note_duplicate_is_linked_too(self, provider, mock_shotgun):
        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.find_one.side_effect = [self.VERSION, {"id": 999}, self.TRANSCRIPT]

        assert self._publish(provider) == "999"

        sg.create.assert_not_called()
        sg.update.assert_called_once_with("Note", 999, self.LINK)

    def test_update_note_links_transcript_on_republish(self, provider, mock_shotgun):
        sg = mock_shotgun.return_value
        provider.sg = sg
        sg.find_one.return_value = self.TRANSCRIPT

        assert provider.update_note(note_id="505", content="Body", version_id="101")

        assert sg.update.call_args_list == [
            mock.call("Note", 505, {"content": "Body"}),
            mock.call("Note", 505, self.LINK),
        ]
