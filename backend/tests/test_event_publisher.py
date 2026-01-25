"""Tests for the Event Publisher."""

import json
from unittest import mock

import pytest

from dna.events.event_publisher import (
    EVENTS_EXCHANGE,
    EventPublisher,
    get_event_publisher,
)
from dna.events.event_types import EventType


class TestEventPublisher:
    """Tests for EventPublisher class."""

    def test_init_with_default_url(self):
        """Test initialization with default RabbitMQ URL."""
        publisher = EventPublisher()
        assert "amqp://" in publisher.rabbitmq_url
        assert publisher.connection is None
        assert publisher.channel is None
        assert publisher.exchange is None

    def test_init_with_custom_url(self):
        """Test initialization with custom RabbitMQ URL."""
        publisher = EventPublisher(rabbitmq_url="amqp://custom:custom@localhost:5672/")
        assert publisher.rabbitmq_url == "amqp://custom:custom@localhost:5672/"

    @pytest.mark.asyncio
    async def test_connect_creates_connection(self):
        """Test that connect creates RabbitMQ connection."""
        publisher = EventPublisher()

        mock_connection = mock.MagicMock()
        mock_connection.is_closed = False
        mock_channel = mock.AsyncMock()
        mock_exchange = mock.AsyncMock()

        mock_connection.channel = mock.AsyncMock(return_value=mock_channel)
        mock_channel.declare_exchange = mock.AsyncMock(return_value=mock_exchange)

        with mock.patch("dna.events.event_publisher.aio_pika") as mock_aio_pika:
            mock_aio_pika.connect_robust = mock.AsyncMock(return_value=mock_connection)
            mock_aio_pika.ExchangeType.TOPIC = "topic"

            await publisher.connect()

            mock_aio_pika.connect_robust.assert_called_once_with(publisher.rabbitmq_url)
            assert publisher.connection == mock_connection
            assert publisher.channel == mock_channel
            assert publisher.exchange == mock_exchange

    @pytest.mark.asyncio
    async def test_connect_skips_if_already_connected(self):
        """Test that connect skips if already connected."""
        publisher = EventPublisher()

        mock_connection = mock.MagicMock()
        mock_connection.is_closed = False
        publisher.connection = mock_connection

        with mock.patch("dna.events.event_publisher.aio_pika") as mock_aio_pika:
            await publisher.connect()
            mock_aio_pika.connect_robust.assert_not_called()

    @pytest.mark.asyncio
    async def test_publish_calls_connect_if_no_exchange(self):
        """Test that publish calls connect if exchange is None."""
        publisher = EventPublisher()

        mock_connection = mock.MagicMock()
        mock_connection.is_closed = False
        mock_channel = mock.AsyncMock()
        mock_exchange = mock.AsyncMock()
        mock_exchange.publish = mock.AsyncMock()

        mock_connection.channel = mock.AsyncMock(return_value=mock_channel)
        mock_channel.declare_exchange = mock.AsyncMock(return_value=mock_exchange)

        with mock.patch("dna.events.event_publisher.aio_pika") as mock_aio_pika:
            mock_aio_pika.connect_robust = mock.AsyncMock(return_value=mock_connection)
            mock_aio_pika.ExchangeType.TOPIC = "topic"
            mock_aio_pika.Message = mock.MagicMock()
            mock_aio_pika.DeliveryMode.PERSISTENT = 2

            await publisher.publish(EventType.TRANSCRIPTION_SUBSCRIBE, {"test": "data"})

            mock_aio_pika.connect_robust.assert_called_once()
            mock_exchange.publish.assert_called_once()

    @pytest.mark.asyncio
    async def test_publish_sends_message_with_correct_routing_key(self):
        """Test that publish sends message with correct routing key."""
        publisher = EventPublisher()

        mock_exchange = mock.AsyncMock()
        mock_exchange.publish = mock.AsyncMock()
        publisher.exchange = mock_exchange

        with mock.patch("dna.events.event_publisher.aio_pika") as mock_aio_pika:
            mock_message = mock.MagicMock()
            mock_aio_pika.Message = mock.MagicMock(return_value=mock_message)
            mock_aio_pika.DeliveryMode.PERSISTENT = 2

            await publisher.publish(
                EventType.TRANSCRIPTION_SUBSCRIBE, {"playlist_id": 42}
            )

            mock_exchange.publish.assert_called_once_with(
                mock_message, routing_key=EventType.TRANSCRIPTION_SUBSCRIBE.value
            )

    @pytest.mark.asyncio
    async def test_publish_creates_message_with_json_payload(self):
        """Test that publish creates message with JSON payload."""
        publisher = EventPublisher()

        mock_exchange = mock.AsyncMock()
        mock_exchange.publish = mock.AsyncMock()
        publisher.exchange = mock_exchange

        with mock.patch("dna.events.event_publisher.aio_pika") as mock_aio_pika:
            mock_aio_pika.Message = mock.MagicMock()
            mock_aio_pika.DeliveryMode.PERSISTENT = 2

            payload = {"playlist_id": 42, "meeting_id": "abc-123"}
            await publisher.publish(EventType.SEGMENT_CREATED, payload)

            mock_aio_pika.Message.assert_called_once()
            call_kwargs = mock_aio_pika.Message.call_args.kwargs
            assert call_kwargs["body"] == json.dumps(payload).encode()
            assert call_kwargs["content_type"] == "application/json"
            assert call_kwargs["delivery_mode"] == 2

    @pytest.mark.asyncio
    async def test_publish_raises_error_if_connect_fails(self):
        """Test that publish raises error if connect fails to establish exchange."""
        publisher = EventPublisher()

        with mock.patch("dna.events.event_publisher.aio_pika") as mock_aio_pika:
            mock_connection = mock.MagicMock()
            mock_connection.is_closed = False
            mock_connection.channel = mock.AsyncMock(
                side_effect=Exception("Connection failed")
            )
            mock_aio_pika.connect_robust = mock.AsyncMock(return_value=mock_connection)

            with pytest.raises(Exception):
                await publisher.publish(EventType.TRANSCRIPTION_SUBSCRIBE, {})

    @pytest.mark.asyncio
    async def test_close_closes_connection(self):
        """Test that close closes the connection."""
        publisher = EventPublisher()

        mock_connection = mock.AsyncMock()
        mock_channel = mock.MagicMock()
        mock_exchange = mock.MagicMock()

        publisher.connection = mock_connection
        publisher.channel = mock_channel
        publisher.exchange = mock_exchange

        await publisher.close()

        mock_connection.close.assert_called_once()
        assert publisher.connection is None
        assert publisher.channel is None
        assert publisher.exchange is None

    @pytest.mark.asyncio
    async def test_close_handles_no_connection(self):
        """Test that close handles case when no connection exists."""
        publisher = EventPublisher()
        await publisher.close()


class TestGetEventPublisher:
    """Tests for get_event_publisher function."""

    def test_get_event_publisher_returns_singleton(self):
        """Test that get_event_publisher returns same instance."""
        import dna.events.event_publisher as ep_module

        ep_module._publisher = None

        publisher1 = get_event_publisher()
        publisher2 = get_event_publisher()

        assert publisher1 is publisher2

        ep_module._publisher = None

    def test_get_event_publisher_creates_new_if_none(self):
        """Test that get_event_publisher creates new instance if none exists."""
        import dna.events.event_publisher as ep_module

        ep_module._publisher = None

        publisher = get_event_publisher()

        assert publisher is not None
        assert isinstance(publisher, EventPublisher)

        ep_module._publisher = None
