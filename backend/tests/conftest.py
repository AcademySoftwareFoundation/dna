import os
import sys
from unittest.mock import MagicMock

# Override the Docker env so tests sign in with the mock auth provider and
# mint tokens with a known secret.
os.environ["AUTH_PROVIDER"] = "mock"
os.environ["JWT_SECRET_KEY"] = "dna-test-secret-key-at-least-32-bytes"
os.environ.pop("JWT_EXPIRE_MINUTES", None)
os.environ.pop("JWT_ALGORITHM", None)
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

import pytest

from tests.auth_helpers import AuthenticatedTestClient, auth_header


@pytest.fixture
def auth_headers():
    """Authorization header with a valid access token for test@example.com."""
    return auth_header()


@pytest.fixture
def auth_client():
    """TestClient that sends a valid access token for test@example.com."""
    from main import app

    return AuthenticatedTestClient(app)
