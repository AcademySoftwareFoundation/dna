import { Client, IMessage, StompSubscription } from '@stomp/stompjs';

export type EventType =
  | 'segment.created'
  | 'segment.updated'
  | 'playlist.updated'
  | 'version.updated'
  | 'bot.status_changed'
  | 'transcription.completed'
  | 'transcription.error';

export interface DNAEvent<T = unknown> {
  type: EventType;
  payload: T;
}

export interface SegmentEventPayload {
  segment_id: string;
  playlist_id: number;
  version_id: number;
  text: string;
  speaker?: string;
  absolute_start_time: string;
  absolute_end_time?: string;
}

export interface BotStatusEventPayload {
  platform: string;
  meeting_id: string;
  status: string;
  message?: string;
}

export type EventCallback<T = unknown> = (event: DNAEvent<T>) => void;
export type ConnectionStateCallback = (connected: boolean, error?: Error) => void;

export interface DNAEventClientConfig {
  brokerURL: string;
  login?: string;
  passcode?: string;
  vhost?: string;
  reconnectDelay?: number;
  heartbeatIncoming?: number;
  heartbeatOutgoing?: number;
  debug?: boolean;
}

interface Subscription {
  id: string;
  eventType: EventType;
  callback: EventCallback;
}

export class DNAEventClient {
  private client: Client | null = null;
  private config: DNAEventClientConfig;
  private subscriptions: Map<string, Subscription> = new Map();
  private stompSubscription: StompSubscription | null = null;
  private subscriptionIdCounter = 0;
  private connectionStateCallbacks: Set<ConnectionStateCallback> = new Set();
  private _isConnected = false;
  private _connectionError: Error | null = null;

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
    if (this.client) {
      return;
    }

    this.client = new Client({
      brokerURL: this.config.brokerURL,
      connectHeaders: {
        login: this.config.login || 'guest',
        passcode: this.config.passcode || 'guest',
        host: this.config.vhost || '/',
      },
      reconnectDelay: this.config.reconnectDelay ?? 5000,
      heartbeatIncoming: this.config.heartbeatIncoming ?? 4000,
      heartbeatOutgoing: this.config.heartbeatOutgoing ?? 4000,
      debug: this.config.debug
        ? (str) => console.log('[STOMP]', str)
        : () => {},
    });

    this.client.onConnect = () => {
      this._isConnected = true;
      this._connectionError = null;
      this.notifyConnectionState(true);
      this.subscribeToExchange();
    };

    this.client.onDisconnect = () => {
      this._isConnected = false;
      this.stompSubscription = null;
      this.notifyConnectionState(false);
    };

    this.client.onStompError = (frame) => {
      const error = new Error(frame.headers['message'] || 'STOMP error');
      this._connectionError = error;
      this.notifyConnectionState(false, error);
    };

    this.client.onWebSocketError = () => {
      const error = new Error('WebSocket connection failed');
      this._connectionError = error;
      this.notifyConnectionState(false, error);
    };

    this.client.activate();
  }

  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
      this.stompSubscription = null;
      this._isConnected = false;
    }
  }

  private subscribeToExchange(): void {
    if (!this.client || this.stompSubscription) {
      return;
    }

    this.stompSubscription = this.client.subscribe(
      '/exchange/dna.events/#',
      (message: IMessage) => {
        this.handleMessage(message);
      }
    );
  }

  private handleMessage(message: IMessage): void {
    try {
      const destination = message.headers['destination'] || '';
      const eventType = destination.split('/').pop() as EventType;
      const payload = JSON.parse(message.body);

      const event: DNAEvent = { type: eventType, payload };

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
        console.error('[DNAEventClient] Error in connection state callback:', err);
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

  subscribeToSegmentEvents(
    callback: EventCallback<SegmentEventPayload>,
    filter?: { playlistId?: number; versionId?: number }
  ): () => void {
    const filteredCallback = (event: DNAEvent<SegmentEventPayload>) => {
      const payload = event.payload;
      if (filter?.playlistId != null && payload.playlist_id !== filter.playlistId) {
        return;
      }
      if (filter?.versionId != null && payload.version_id !== filter.versionId) {
        return;
      }
      callback(event);
    };

    return this.subscribeMultiple<SegmentEventPayload>(
      ['segment.created', 'segment.updated'],
      filteredCallback
    );
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
      if (filter?.meetingId != null && payload.meeting_id !== filter.meetingId) {
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

export function createEventClient(config: DNAEventClientConfig): DNAEventClient {
  return new DNAEventClient(config);
}

export function getDefaultEventClient(): DNAEventClient | null {
  return defaultClient;
}

export function setDefaultEventClient(client: DNAEventClient): void {
  defaultClient = client;
}
