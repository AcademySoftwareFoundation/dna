import { useEffect, useCallback } from 'react';
import {
  type EventType,
  type DNAEvent,
  type EventCallback,
  type SegmentEventPayload,
} from '@dna/core';
import { useEventContext, useEventClient } from '../contexts';

export type { SegmentEventPayload as SegmentEvent };

interface UseDNAEventsOptions {
  enabled?: boolean;
}

export function useEventSubscription<T = unknown>(
  eventType: EventType,
  callback: EventCallback<T>,
  options: UseDNAEventsOptions = {}
): void {
  const client = useEventClient();
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled || !client) return;

    const unsubscribe = client.subscribe<T>(eventType, callback);
    return unsubscribe;
  }, [eventType, callback, client, enabled]);
}

export function useMultipleEventSubscriptions<T = unknown>(
  eventTypes: EventType[],
  callback: EventCallback<T>,
  options: UseDNAEventsOptions = {}
): void {
  const client = useEventClient();
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled || !client) return;

    const unsubscribe = client.subscribeMultiple<T>(eventTypes, callback);
    return unsubscribe;
  }, [eventTypes, callback, client, enabled]);
}

export function useConnectionStatus(): {
  isConnected: boolean;
  connectionError: Error | null;
} {
  const { isConnected, connectionError } = useEventContext();
  return { isConnected, connectionError };
}

export function useSegmentEvents(
  callback: EventCallback<SegmentEventPayload>,
  options: UseDNAEventsOptions & {
    playlistId?: number | null;
    versionId?: number | null;
  } = {}
): void {
  const client = useEventClient();
  const { playlistId, versionId, enabled = true } = options;

  const filteredCallback = useCallback(
    (event: DNAEvent<SegmentEventPayload>) => {
      if (playlistId != null && event.payload.playlist_id !== playlistId) {
        return;
      }
      if (versionId != null && event.payload.version_id !== versionId) {
        return;
      }
      callback(event);
    },
    [callback, playlistId, versionId]
  );

  useEffect(() => {
    if (!enabled || !client) return;

    const unsubscribe = client.subscribeMultiple<SegmentEventPayload>(
      ['segment.created', 'segment.updated'],
      filteredCallback
    );
    return unsubscribe;
  }, [client, filteredCallback, enabled]);
}
