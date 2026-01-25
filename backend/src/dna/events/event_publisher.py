"""Event publisher for RabbitMQ."""

import json
import logging
import os
from typing import Any

import aio_pika

from dna.events.event_types import EventType

logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://dna:dna@localhost:5672/dna")
EVENTS_EXCHANGE = "dna.events"

_publisher: "EventPublisher | None" = None


class EventPublisher:
    def __init__(self, rabbitmq_url: str = RABBITMQ_URL):
        self.rabbitmq_url = rabbitmq_url
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.Channel | None = None
        self.exchange: aio_pika.Exchange | None = None

    async def connect(self) -> None:
        if self.connection is not None and not self.connection.is_closed:
            return

        logger.info("Connecting to RabbitMQ at %s", self.rabbitmq_url)
        self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
        self.channel = await self.connection.channel()
        self.exchange = await self.channel.declare_exchange(
            EVENTS_EXCHANGE,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        logger.info("Connected to RabbitMQ")

    async def publish(self, event_type: EventType, payload: dict[str, Any]) -> None:
        if self.exchange is None:
            await self.connect()

        if self.exchange is None:
            raise RuntimeError("Failed to connect to RabbitMQ")

        message = aio_pika.Message(
            body=json.dumps(payload).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )

        await self.exchange.publish(message, routing_key=event_type.value)
        logger.info("Published event: %s", event_type.value)

    async def close(self) -> None:
        if self.connection:
            await self.connection.close()
            self.connection = None
            self.channel = None
            self.exchange = None


def get_event_publisher() -> EventPublisher:
    global _publisher
    if _publisher is None:
        _publisher = EventPublisher()
    return _publisher
