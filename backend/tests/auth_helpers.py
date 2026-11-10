"""Helpers for calling protected endpoints with a real DNA access token."""

from fastapi.testclient import TestClient

from dna.auth.identity import CurrentUser
from dna.auth.tokens import create_access_token

TEST_USER = CurrentUser(sub="test", email="test@example.com", name="Test User")


def make_token(user: CurrentUser = TEST_USER) -> str:
    """Sign an access token for ``user`` with the test JWT settings."""
    token, _ = create_access_token(user)
    return token


def auth_header(user: CurrentUser = TEST_USER) -> dict[str, str]:
    """Authorization header carrying an access token for ``user``."""
    return {"Authorization": f"Bearer {make_token(user)}"}


class AuthenticatedTestClient(TestClient):
    """TestClient that sends a valid access token unless the caller sets one."""

    def __init__(self, *args, user: CurrentUser = TEST_USER, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user

    def request(self, *args, **kwargs):
        headers = dict(kwargs.get("headers") or {})
        headers.setdefault("Authorization", auth_header(self.user)["Authorization"])
        kwargs["headers"] = headers
        return super().request(*args, **kwargs)
