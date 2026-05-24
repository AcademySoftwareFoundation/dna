export type EventType =
  | 'transcript'
  | 'bot.status_changed'
  | 'transcription.completed'
  | 'transcription.error';

export interface DNAEvent<T = unknown> {
  type: EventType;
  payload: T;
}

/**
 * Raw transcript message forwarded by the DNA backend, verbatim from
 * Vexa's WS contract plus DNA envelope fields (`playlist_id`, `version_id`).
 *
 * Shape: `{ type: "transcript", speaker, confirmed: [...], pending: [...],
 *          playlist_id, version_id, ts }` — matches the `TranscriptMessage`
 * interface of `@vexaai/transcript-rendering`.
 */
export interface TranscriptEventPayload {
  speaker?: string;
  confirmed?: Array<Record<string, unknown>>;
  pending?: Array<Record<string, unknown>>;
  playlist_id: number;
  version_id: number;
  ts?: string;
}

export interface BotStatusEventPayload {
  platform: string;
  meeting_id: string;
  playlist_id?: number;
  status: string;
  message?: string;
  recovered?: boolean;
}

export type EventCallback<T = unknown> = (event: DNAEvent<T>) => void;
export type ConnectionStateCallback = (
  connected: boolean,
  error?: Error
) => void;

export interface DNAEventClientConfig {
  wsURL: string;
  reconnectDelay?: number;
  debug?: boolean;
}

interface Subscription {
  id: string;
  eventType: EventType;
  callback: EventCallback;
}

export class DNAEventClient {
  private ws: WebSocket | null = null;
  private config: DNAEventClientConfig;
  private subscriptions: Map<string, Subscription> = new Map();
  private subscriptionIdCounter = 0;
  private connectionStateCallbacks: Set<ConnectionStateCallback> = new Set();
  private _isConnected = false;
  private _connectionError: Error | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(config: DNAEventClientConfig) {
    this.config = config;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get connectionError(): Error | null {
    return this._connectionError;
  }

  connect(): void {
    if (this.ws) {
      return;
    }

    this.shouldReconnect = true;
    this.createWebSocket();
  }

  private createWebSocket(): void {
    try {
      this.ws = new WebSocket(this.config.wsURL);

      this.ws.onopen = () => {
        this._isConnected = true;
        this._connectionError = null;
        this.notifyConnectionState(true);
        if (this.config.debug) {
          console.log('[DNAEventClient] Connected to', this.config.wsURL);
        }
      };

      this.ws.onclose = (event) => {
        this._isConnected = false;
        this.ws = null;
        this.notifyConnectionState(false);
        if (this.config.debug) {
          console.log(
            '[DNAEventClient] Disconnected:',
            event.code,
            event.reason
          );
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        const error = new Error('WebSocket connection failed');
        this._connectionError = error;
        this.notifyConnectionState(false, error);
        if (this.config.debug) {
          console.error('[DNAEventClient] WebSocket error');
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error('Failed to create WebSocket');
      this._connectionError = err;
      this.notifyConnectionState(false, err);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = this.config.reconnectDelay ?? 5000;
    if (this.config.debug) {
      console.log(`[DNAEventClient] Reconnecting in ${delay}ms...`);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect && !this.ws) {
        this.createWebSocket();
      }
    }, delay);
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this._isConnected = false;
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as Record<string, unknown> & {
        type: string;
      };
      const eventType = message.type as EventType;

      // Transcript messages are forwarded verbatim from Vexa — the whole
      // message object (including confirmed/pending/speaker/…) IS the payload
      // so `TranscriptManager.handleMessage()` can consume it directly.
      // All other events follow the classic `{type, payload}` envelope.
      const payload =
        eventType === 'transcript' ? message : (message as unknown as { payload: unknown }).payload;

      const event: DNAEvent = { type: eventType, payload };

      if (this.config.debug) {
        console.log('[DNAEventClient] Received event:', eventType, payload);
      }

      this.subscriptions.forEach((subscription) => {
        if (subscription.eventType === eventType) {
          try {
            subscription.callback(event);
          } catch (err) {
            console.error(
              `[DNAEventClient] Error in subscription callback:`,
              err
            );
          }
        }
      });
    } catch (error) {
      console.error('[DNAEventClient] Failed to parse message:', error);
    }
  }

  private notifyConnectionState(connected: boolean, error?: Error): void {
    this.connectionStateCallbacks.forEach((callback) => {
      try {
        callback(connected, error);
      } catch (err) {
        console.error(
          '[DNAEventClient] Error in connection state callback:',
          err
        );
      }
    });
  }

  subscribe<T = unknown>(
    eventType: EventType,
    callback: EventCallback<T>
  ): () => void {
    const id = `sub_${this.subscriptionIdCounter++}`;

    this.subscriptions.set(id, {
      id,
      eventType,
      callback: callback as EventCallback,
    });

    return () => {
      this.subscriptions.delete(id);
    };
  }

  subscribeMultiple<T = unknown>(
    eventTypes: EventType[],
    callback: EventCallback<T>
  ): () => void {
    const unsubscribes = eventTypes.map((eventType) =>
      this.subscribe<T>(eventType, callback)
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }

  onConnectionStateChange(callback: ConnectionStateCallback): () => void {
    this.connectionStateCallbacks.add(callback);
    return () => {
      this.connectionStateCallbacks.delete(callback);
    };
  }

  subscribeToBotStatusEvents(
    callback: EventCallback<BotStatusEventPayload>,
    filter?: { platform?: string; meetingId?: string }
  ): () => void {
    const filteredCallback = (event: DNAEvent<BotStatusEventPayload>) => {
      const payload = event.payload;
      if (filter?.platform != null && payload.platform !== filter.platform) {
        return;
      }
      if (
        filter?.meetingId != null &&
        payload.meeting_id !== filter.meetingId
      ) {
        return;
      }
      callback(event);
    };

    return this.subscribe<BotStatusEventPayload>(
      'bot.status_changed',
      filteredCallback
    );
  }
}

let defaultClient: DNAEventClient | null = null;

export function createEventClient(
  config: DNAEventClientConfig
): DNAEventClient {
  return new DNAEventClient(config);
}

export function getDefaultEventClient(): DNAEventClient | null {
  return defaultClient;
}

export function setDefaultEventClient(client: DNAEventClient): void {
  defaultClient = client;
}
