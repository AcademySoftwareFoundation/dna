import os
import sys
from unittest.mock import MagicMock

# Force AUTH_PROVIDER to none for tests (override Docker env so endpoints accept unauthenticated requests)
os.environ["AUTH_PROVIDER"] = "none"
# Set CORS origins for tests
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://localhost:5173")

# Mock aio_pika if not present to avoid ImportErrors during collection
try:
    import aio_pika
except ImportError:
    sys.modules["aio_pika"] = MagicMock()
    sys.modules["aio_pika.abc"] = MagicMock()

try:
    import websockets
except ImportError:
    mock_ws = MagicMock()
    mock_ws.exceptions = MagicMock()
    sys.modules["websockets"] = mock_ws
    sys.modules["websockets"] = mock_ws
    sys.modules["websockets.exceptions"] = mock_ws.exceptions

try:
    import pymongo
except ImportError:
    mock_pm = MagicMock()
    # Use an instance so it's subscriptable for type hinting (e.g. AsyncMongoClient[Any])
    # AND callable for instantiation
    mock_pm.AsyncMongoClient = MagicMock()
    mock_pm.ReturnDocument = MagicMock()
    sys.modules["pymongo"] = mock_pm

try:
    import bson
except ImportError:
    mock_bson = MagicMock()
    mock_bson.ObjectId = lambda: "mock_object_id"
    sys.modules["bson"] = mock_bson

# Mock google-auth library if not present
try:
    import google.auth
except ImportError:
    mock_google = MagicMock()
    mock_google.auth = MagicMock()
    mock_google.auth.transport = MagicMock()
    mock_google.auth.transport.requests = MagicMock()
    mock_google.oauth2 = MagicMock()
    mock_google.oauth2.id_token = MagicMock()
    sys.modules["google"] = mock_google
    sys.modules["google.auth"] = mock_google.auth
    sys.modules["google.auth.transport"] = mock_google.auth.transport
    sys.modules["google.auth.transport.requests"] = mock_google.auth.transport.requests
    sys.modules["google.oauth2"] = mock_google.oauth2
    sys.modules["google.oauth2.id_token"] = mock_google.oauth2.id_token


import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def auth_headers():
    """Provides authentication headers for test requests.

    With AUTH_PROVIDER=none, the NoopAuthProvider accepts any token.
    """
    return {"Authorization": "Bearer test@example.com"}


@pytest.fixture
def auth_client():
    """Provides an authenticated TestClient for the FastAPI app.

    This client includes authentication headers on all requests.
    """
    from main import app

    class AuthenticatedTestClient(TestClient):
        def request(self, *args, **kwargs):
            headers = kwargs.get("headers") or {}
            headers["Authorization"] = "Bearer test@example.com"
            kwargs["headers"] = headers
            return super().request(*args, **kwargs)

    return AuthenticatedTestClient(app)
