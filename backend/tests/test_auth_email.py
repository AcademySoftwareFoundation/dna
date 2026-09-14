"""Tests for email authorization helpers."""

from dna.auth.email import emails_match


def test_emails_match_case_insensitive():
    assert emails_match("Test@Example.com", "test@example.com")
    assert emails_match("  user@corp.com  ", "user@corp.com")


def test_emails_match_different_addresses():
    assert not emails_match("a@example.com", "b@example.com")
