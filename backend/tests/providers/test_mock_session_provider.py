"""Tests for the in-memory mock session provider."""

from dna.session_providers.mock_session_provider import MockSessionProvider


class TestMockSessionProvider:
    """Sample sessions are seeded per project; creates stay isolated."""

    def test_listing_seeds_two_sample_sessions(self):
        provider = MockSessionProvider()
        sessions = provider.get_sessions_for_project("124")
        assert [session.name for session in sessions] == [
            "Morning dailies",
            "Afternoon review",
        ]
        assert {session.project_id for session in sessions} == {"124"}

    def test_listing_twice_does_not_duplicate_samples(self):
        provider = MockSessionProvider()
        first = provider.get_sessions_for_project("124")
        second = provider.get_sessions_for_project("124")
        assert [session.id for session in second] == [session.id for session in first]

    def test_projects_are_isolated(self):
        provider = MockSessionProvider()
        created = provider.create_session("124", "Lighting")
        other = provider.get_sessions_for_project("200")
        assert created.id not in {session.id for session in other}
        assert all(session.project_id == "200" for session in other)

    def test_create_session_is_returned_by_get(self):
        provider = MockSessionProvider()
        created = provider.create_session("124", "Lighting")
        assert created.name == "Lighting"
        assert created.project_id == "124"
        assert provider.get_session(created.id) == created

    def test_get_unknown_session_returns_none(self):
        provider = MockSessionProvider()
        assert provider.get_session("missing") is None

    def test_created_session_appears_in_project_list(self):
        provider = MockSessionProvider()
        created = provider.create_session("124", "Lighting")
        sessions = provider.get_sessions_for_project("124")
        assert created.id in {session.id for session in sessions}
        assert len(sessions) == 3
