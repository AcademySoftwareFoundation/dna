from dna.models.draft_note import DraftNote
from dna.models.entity import Playlist, Project, User, Version


class EmailBuilder:
    """Provider-independent summary email builder."""

    @staticmethod
    def build_subject(playlist: Playlist, project: Project) -> str:
        """Build the email subject line."""
        return f"Dailies Summary: {playlist.code} - {project.name}"

    @staticmethod
    def build_text_content(
        playlist: Playlist,
        project: Project,
        sent_by: User,
        versions: list[Version],
        drafts: list[DraftNote],
        playlist_url: str,
    ) -> str:
        """Build the plain text version of the email."""

        return f"""Dailies Summary

    Playlist: {playlist.code}
    Project: {project.name}
    Sent by: {sent_by.email}

    Versions: {len(versions)}
    Draft Notes: {len(drafts)}

    Playlist:
    {playlist_url}
    """

    @staticmethod
    def build_html_content(
        playlist: Playlist,
        project: Project,
        sent_by: User,
        versions: list[Version],
        drafts: list[DraftNote],
        playlist_url: str,
    ) -> str:
        """Build the HTML version of the email."""

        return f"""
    <html>
    <body>
        <h1>Dailies Summary</h1>

        <p><strong>Playlist:</strong> {playlist.code}</p>
        <p><strong>Project:</strong> {project.name}</p>
        <p><strong>Sent by:</strong> {sent_by.email}</p>

        <p><strong>Versions:</strong> {len(versions)}</p>
        <p><strong>Draft Notes:</strong> {len(drafts)}</p>

        <p>
        <a href="{playlist_url}">Open Playlist</a>
        </p>
    </body>
    </html>
    """

    @staticmethod
    def build_message(
        playlist: Playlist,
        project: Project,
        sent_by: User,
        versions: list[Version],
        drafts: list[DraftNote],
        playlist_url: str,
    ) -> tuple[str, str, str]:
        """Build all parts of the email message."""
        subject = EmailBuilder.build_subject(playlist, project)
        text_content = EmailBuilder.build_text_content(
            playlist, project, sent_by, versions, drafts, playlist_url
        )
        html_content = EmailBuilder.build_html_content(
            playlist, project, sent_by, versions, drafts, playlist_url
        )
        return subject, text_content, html_content
