import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DnaWsClient } from '../src/dna/ws-client';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  url: string;
  protocols?: string[];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  receive(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('DnaWsClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    (globalThis.WebSocket as unknown as { OPEN: number }).OPEN = 1;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects with token query param and registers meeting', async () => {
    const client = new DnaWsClient({
      backendUrl: 'http://localhost:8000',
      authToken: 'test-token',
    });

    const connectPromise = client.connect();
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toContain('ws://localhost:8000/transcription/extension/ws');
    expect(ws.url).toContain('token=test-token');
    await connectPromise;

    const registered = client.register('google_meet', 'abc-defg-hij');
    ws.receive({
      type: 'registered',
      session_id: 1,
      playlist_id: 42,
    });
    const result = await registered;
    expect(result.sessionId).toBe(1);
    expect(result.playlistId).toBe(42);

    const registerMsg = JSON.parse(ws.sent[0]);
    expect(registerMsg.action).toBe('register');
    expect(registerMsg.meeting_id).toBe('abc-defg-hij');
  });

  it('sends transcript frames after registration', async () => {
    const client = new DnaWsClient({
      backendUrl: 'https://dna.example.com',
      authToken: 'token',
    });
    await client.connect();
    const ws = MockWebSocket.instances[0];
    const registerPromise = client.register('google_meet', 'abc-defg-hij');
    ws.receive({ type: 'registered', session_id: 1, playlist_id: 42 });
    await registerPromise;

    client.sendTranscript({
      type: 'transcript',
      speaker: 'Alice',
      confirmed: [],
      pending: [],
      ts: '2026-04-20T19:00:00.000Z',
    });

    const transcriptMsg = JSON.parse(ws.sent[1]);
    expect(transcriptMsg.type).toBe('transcript');
    expect(transcriptMsg.speaker).toBe('Alice');
  });

  it('invokes onStop when server sends stop command', async () => {
    const onStop = vi.fn();
    const client = new DnaWsClient({
      backendUrl: 'http://localhost:8000',
      authToken: 'token',
      onStop,
    });
    await client.connect();
    MockWebSocket.instances[0].receive({ type: 'stop' });
    expect(onStop).toHaveBeenCalledOnce();
  });
});
