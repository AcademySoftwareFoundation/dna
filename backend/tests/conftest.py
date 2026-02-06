import sys
from unittest.mock import MagicMock

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
