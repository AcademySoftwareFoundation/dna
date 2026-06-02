"""Email comparison helpers for authorization checks."""


def emails_match(a: str, b: str) -> bool:
    """Return True when two emails refer to the same mailbox (case-insensitive)."""
    return a.strip().lower() == b.strip().lower()
