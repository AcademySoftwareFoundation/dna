import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import {
  DNAEventClient,
  createEventClient,
  setDefaultEventClient,
  type EventType,
  type DNAEvent,
  type EventCallback,
} from '@dna/core';

export type { EventType, DNAEvent, EventCallback };

interface EventContextValue {
  client: DNAEventClient | null;
  isConnected: boolean;
  connectionError: Error | null;
  subscribe: <T = unknown>(
    eventType: EventType,
    callback: EventCallback<T>
  ) => () => void;
}

const EventContext = createContext<EventContextValue | null>(null);

const WEBSOCKET_URL =
  import.meta.env.VITE_RABBITMQ_WS_URL || 'ws://localhost:15674/ws';
const RABBITMQ_USER = import.meta.env.VITE_RABBITMQ_USER || 'dna';
const RABBITMQ_PASS = import.meta.env.VITE_RABBITMQ_PASS || 'dna';
const RABBITMQ_VHOST = import.meta.env.VITE_RABBITMQ_VHOST || 'dna';

interface EventProviderProps {
  children: ReactNode;
}

export function EventProvider({ children }: EventProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const clientRef = useRef<DNAEventClient | null>(null);

  useEffect(() => {
    const client = createEventClient({
      brokerURL: WEBSOCKET_URL,
      login: RABBITMQ_USER,
      passcode: RABBITMQ_PASS,
      vhost: RABBITMQ_VHOST,
      debug: import.meta.env.DEV,
    });

    clientRef.current = client;
    setDefaultEventClient(client);

    const unsubscribe = client.onConnectionStateChange((connected, error) => {
      setIsConnected(connected);
      setConnectionError(error ?? null);
    });

    client.connect();

    return () => {
      unsubscribe();
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  const subscribe = useCallback(
    <T = unknown,>(
      eventType: EventType,
      callback: EventCallback<T>
    ): (() => void) => {
      if (!clientRef.current) {
        return () => {};
      }
      return clientRef.current.subscribe<T>(eventType, callback);
    },
    []
  );

  return (
    <EventContext.Provider
      value={{
        client: clientRef.current,
        isConnected,
        connectionError,
        subscribe,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEventContext(): EventContextValue {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEventContext must be used within an EventProvider');
  }
  return context;
}

export function useEventClient(): DNAEventClient | null {
  const { client } = useEventContext();
  return client;
}
