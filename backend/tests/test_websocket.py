"""Tests for WebSocket endpoint."""

import json
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from main import app

from dna.events import EventType, get_event_publisher, reset_event_publisher


class TestWebSocketEndpoint:
    """Tests for /ws WebSocket endpoint."""

    def setup_method(self):
        """Reset event publisher before each test."""
        reset_event_publisher()

    def teardown_method(self):
        """Reset event publisher after each test."""
        reset_event_publisher()

    def test_websocket_connect(self):
        """Test that WebSocket connection can be established."""
        client = TestClient(app)
        with client.websocket_connect("/ws") as websocket:
            publisher = get_event_publisher()
            assert publisher.ws_manager.connection_count == 1

    def test_websocket_disconnect(self):
        """Test that WebSocket disconnection is handled."""
        client = TestClient(app)
        with client.websocket_connect("/ws"):
            publisher = get_event_publisher()
            assert publisher.ws_manager.connection_count == 1

        assert publisher.ws_manager.connection_count == 0

    def test_websocket_receives_published_events(self):
        """Test that WebSocket client receives published events."""
        client = TestClient(app)
        with client.websocket_connect("/ws") as websocket:
            publisher = get_event_publisher()

            import asyncio

            loop = asyncio.new_event_loop()
            loop.run_until_complete(
                publisher.publish(
                    EventType.SEGMENT_CREATED,
                    {
                        "segment_id": "abc123",
                        "text": "Hello world",
                        "speaker": "John",
                    },
                )
            )
            loop.close()

            data = websocket.receive_json()
            assert data["type"] == "segment.created"
            assert data["payload"]["segment_id"] == "abc123"
            assert data["payload"]["text"] == "Hello world"

    def test_websocket_receives_bot_status_events(self):
        """Test that WebSocket client receives bot status events."""
        client = TestClient(app)
        with client.websocket_connect("/ws") as websocket:
            publisher = get_event_publisher()

            import asyncio

            loop = asyncio.new_event_loop()
            loop.run_until_complete(
                publisher.publish(
                    EventType.BOT_STATUS_CHANGED,
                    {
                        "platform": "google_meet",
                        "meeting_id": "abc-def-ghi",
                        "status": "in_call",
                    },
                )
            )
            loop.close()

            data = websocket.receive_json()
            assert data["type"] == "bot.status_changed"
            assert data["payload"]["status"] == "in_call"

    def test_multiple_websocket_clients_receive_events(self):
        """Test that multiple WebSocket clients all receive events."""
        client = TestClient(app)
        with client.websocket_connect("/ws") as ws1:
            with client.websocket_connect("/ws") as ws2:
                publisher = get_event_publisher()
                assert publisher.ws_manager.connection_count == 2

                import asyncio

                loop = asyncio.new_event_loop()
                loop.run_until_complete(
                    publisher.publish(
                        EventType.SEGMENT_UPDATED,
                        {"segment_id": "xyz", "text": "Updated text"},
                    )
                )
                loop.close()

                data1 = ws1.receive_json()
                data2 = ws2.receive_json()

                assert data1["type"] == "segment.updated"
                assert data2["type"] == "segment.updated"
                assert data1["payload"]["segment_id"] == "xyz"
                assert data2["payload"]["segment_id"] == "xyz"
