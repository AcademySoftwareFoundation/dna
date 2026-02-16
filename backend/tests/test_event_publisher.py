"""Tests for the in-memory Event Publisher."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from dna.events import EventType, reset_event_publisher
from dna.events.event_publisher import (
    EventPublisher,
    WebSocketManager,
    get_event_publisher,
)


class TestWebSocketManager:
    """Tests for WebSocketManager class."""

    @pytest.mark.asyncio
    async def test_connect_accepts_and_registers_websocket(self):
        """Test that connect accepts the websocket and adds to connections."""
        manager = WebSocketManager()
        mock_ws = AsyncMock()

        await manager.connect(mock_ws)

        mock_ws.accept.assert_called_once()
        assert mock_ws in manager._connections
        assert manager.connection_count == 1

    @pytest.mark.asyncio
    async def test_disconnect_removes_websocket(self):
        """Test that disconnect removes the websocket from connections."""
        manager = WebSocketManager()
        mock_ws = AsyncMock()

        await manager.connect(mock_ws)
        assert manager.connection_count == 1

        await manager.disconnect(mock_ws)
        assert manager.connection_count == 0

    @pytest.mark.asyncio
    async def test_disconnect_handles_unknown_websocket(self):
        """Test that disconnect gracefully handles unknown websocket."""
        manager = WebSocketManager()
        mock_ws = AsyncMock()

        await manager.disconnect(mock_ws)
        assert manager.connection_count == 0

    @pytest.mark.asyncio
    async def test_broadcast_sends_to_all_connections(self):
        """Test that broadcast sends message to all connected clients."""
        manager = WebSocketManager()
        mock_ws1 = AsyncMock()
        mock_ws2 = AsyncMock()

        await manager.connect(mock_ws1)
        await manager.connect(mock_ws2)

        message = {"type": "test", "payload": {"data": "value"}}
        await manager.broadcast(message)

        expected_json = json.dumps(message)
        mock_ws1.send_text.assert_called_once_with(expected_json)
        mock_ws2.send_text.assert_called_once_with(expected_json)

    @pytest.mark.asyncio
    async def test_broadcast_removes_failed_connections(self):
        """Test that broadcast removes connections that fail to send."""
        manager = WebSocketManager()
        mock_ws_good = AsyncMock()
        mock_ws_bad = AsyncMock()
        mock_ws_bad.send_text.side_effect = Exception("Connection closed")

        await manager.connect(mock_ws_good)
        await manager.connect(mock_ws_bad)
        assert manager.connection_count == 2

        await manager.broadcast({"type": "test"})

        assert manager.connection_count == 1
        assert mock_ws_good in manager._connections
        assert mock_ws_bad not in manager._connections

    @pytest.mark.asyncio
    async def test_broadcast_does_nothing_with_no_connections(self):
        """Test that broadcast does nothing when no clients connected."""
        manager = WebSocketManager()
        await manager.broadcast({"type": "test"})

    def test_connection_count_property(self):
        """Test that connection_count returns correct count."""
        manager = WebSocketManager()
        assert manager.connection_count == 0


class TestEventPublisher:
    """Tests for EventPublisher class."""

    def test_init_creates_empty_subscribers(self):
        """Test initialization creates empty subscriber lists."""
        publisher = EventPublisher()
        assert publisher._subscribers == {}
        assert publisher._global_subscribers == []

    def test_init_creates_ws_manager(self):
        """Test initialization creates WebSocketManager."""
        publisher = EventPublisher()
        assert publisher.ws_manager is not None
        assert isinstance(publisher.ws_manager, WebSocketManager)

    @pytest.mark.asyncio
    async def test_connect_is_noop(self):
        """Test that connect is a no-op for in-memory publisher."""
        publisher = EventPublisher()
        await publisher.connect()

    @pytest.mark.asyncio
    async def test_publish_calls_type_subscribers(self):
        """Test that publish calls subscribers for the event type."""
        publisher = EventPublisher()
        received_events = []

        async def callback(event_type, payload):
            received_events.append((event_type, payload))

        publisher.subscribe(EventType.SEGMENT_CREATED, callback)
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data"})

        assert len(received_events) == 1
        assert received_events[0] == (EventType.SEGMENT_CREATED, {"test": "data"})

    @pytest.mark.asyncio
    async def test_publish_does_not_call_other_type_subscribers(self):
        """Test that publish only calls subscribers for the matching event type."""
        publisher = EventPublisher()
        received_events = []

        async def callback(event_type, payload):
            received_events.append((event_type, payload))

        publisher.subscribe(EventType.SEGMENT_CREATED, callback)
        await publisher.publish(EventType.SEGMENT_UPDATED, {"test": "data"})

        assert len(received_events) == 0

    @pytest.mark.asyncio
    async def test_publish_calls_global_subscribers(self):
        """Test that publish calls global subscribers for any event."""
        publisher = EventPublisher()
        received_events = []

        async def callback(event_type, payload):
            received_events.append((event_type, payload))

        publisher.subscribe_all(callback)
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data"})
        await publisher.publish(EventType.SEGMENT_UPDATED, {"test": "data2"})

        assert len(received_events) == 2
        assert received_events[0] == (EventType.SEGMENT_CREATED, {"test": "data"})
        assert received_events[1] == (EventType.SEGMENT_UPDATED, {"test": "data2"})

    @pytest.mark.asyncio
    async def test_publish_calls_multiple_subscribers(self):
        """Test that publish calls all subscribers for an event type."""
        publisher = EventPublisher()
        received_events_1 = []
        received_events_2 = []

        async def callback1(event_type, payload):
            received_events_1.append(payload)

        async def callback2(event_type, payload):
            received_events_2.append(payload)

        publisher.subscribe(EventType.SEGMENT_CREATED, callback1)
        publisher.subscribe(EventType.SEGMENT_CREATED, callback2)
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data"})

        assert len(received_events_1) == 1
        assert len(received_events_2) == 1

    @pytest.mark.asyncio
    async def test_subscribe_returns_unsubscribe_function(self):
        """Test that subscribe returns a function to unsubscribe."""
        publisher = EventPublisher()
        received_events = []

        async def callback(event_type, payload):
            received_events.append(payload)

        unsubscribe = publisher.subscribe(EventType.SEGMENT_CREATED, callback)
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data1"})
        unsubscribe()
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data2"})

        assert len(received_events) == 1
        assert received_events[0] == {"test": "data1"}

    @pytest.mark.asyncio
    async def test_subscribe_all_returns_unsubscribe_function(self):
        """Test that subscribe_all returns a function to unsubscribe."""
        publisher = EventPublisher()
        received_events = []

        async def callback(event_type, payload):
            received_events.append(payload)

        unsubscribe = publisher.subscribe_all(callback)
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data1"})
        unsubscribe()
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data2"})

        assert len(received_events) == 1

    @pytest.mark.asyncio
    async def test_publish_handles_callback_errors(self):
        """Test that publish continues even if a callback raises an error."""
        publisher = EventPublisher()
        received_events = []

        async def failing_callback(event_type, payload):
            raise Exception("Test error")

        async def working_callback(event_type, payload):
            received_events.append(payload)

        publisher.subscribe(EventType.SEGMENT_CREATED, failing_callback)
        publisher.subscribe(EventType.SEGMENT_CREATED, working_callback)

        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data"})

        assert len(received_events) == 1

    @pytest.mark.asyncio
    async def test_publish_broadcasts_to_websocket_clients(self):
        """Test that publish broadcasts events to WebSocket clients."""
        publisher = EventPublisher()
        mock_ws = AsyncMock()

        await publisher.ws_manager.connect(mock_ws)
        await publisher.publish(EventType.SEGMENT_CREATED, {"test": "data"})

        mock_ws.send_text.assert_called_once()
        sent_message = json.loads(mock_ws.send_text.call_args[0][0])
        assert sent_message["type"] == "segment.created"
        assert sent_message["payload"] == {"test": "data"}

    @pytest.mark.asyncio
    async def test_close_clears_all_subscribers(self):
        """Test that close clears all subscribers."""
        publisher = EventPublisher()

        async def callback(event_type, payload):
            pass

        publisher.subscribe(EventType.SEGMENT_CREATED, callback)
        publisher.subscribe_all(callback)

        assert len(publisher._subscribers) > 0
        assert len(publisher._global_subscribers) > 0

        await publisher.close()

        assert len(publisher._subscribers) == 0
        assert len(publisher._global_subscribers) == 0


class TestGetEventPublisher:
    """Tests for get_event_publisher function."""

    def setup_method(self):
        """Reset singleton before each test."""
        reset_event_publisher()

    def teardown_method(self):
        """Reset singleton after each test."""
        reset_event_publisher()

    def test_get_event_publisher_returns_singleton(self):
        """Test that get_event_publisher returns same instance."""
        publisher1 = get_event_publisher()
        publisher2 = get_event_publisher()

        assert publisher1 is publisher2

    def test_get_event_publisher_creates_new_if_none(self):
        """Test that get_event_publisher creates new instance if none exists."""
        publisher = get_event_publisher()

        assert publisher is not None
        assert isinstance(publisher, EventPublisher)
