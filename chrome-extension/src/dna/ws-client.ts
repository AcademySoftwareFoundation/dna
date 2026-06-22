import type { TranscriptFrame } from '../transcription/segment-builder';

export interface DnaWsClientOptions {
  backendUrl: string;
  authToken: string;
  onStop?: () => void;
  onError?: (message: string) => void;
  onLog?: (message: string, detail?: unknown) => void;
}

export interface RegisterResult {
  sessionId: number;
  playlistId: number;
}

function buildWsUrl(backendUrl: string, authToken: string): string {
  const url = new URL(backendUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/transcription/extension/ws';
  url.searchParams.set('token', authToken);
  return url.toString();
}

export class DnaWsClient {
  private ws: WebSocket | null = null;

  constructor(private readonly options: DnaWsClientOptions) {}

  private log(message: string, detail?: unknown): void {
    this.options.onLog?.(message, detail);
  }

  async connect(): Promise<void> {
    const wsUrl = buildWsUrl(this.options.backendUrl, this.options.authToken);
    this.log('Opening WebSocket', { url: wsUrl.replace(/token=[^&]+/, 'token=***') });
    this.ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      this.ws.onopen = () => {
        this.log('WebSocket open');
        resolve();
      };
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onclose = (event) => {
        this.log('WebSocket closed', { code: event.code, reason: event.reason });
      };
      this.ws.onmessage = (event) => this.handleMessage(event.data);
    });
  }

  private pendingRegister: {
    resolve: (value: RegisterResult) => void;
    reject: (reason: Error) => void;
  } | null = null;

  private handleMessage(raw: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.options.onError?.('Invalid server message');
      return;
    }

    this.log('WebSocket message', { type: data.type });

    if (data.type === 'registered' && this.pendingRegister) {
      this.pendingRegister.resolve({
        sessionId: Number(data.session_id),
        playlistId: Number(data.playlist_id),
      });
      this.pendingRegister = null;
      return;
    }

    if (data.type === 'error') {
      const message = String(data.message ?? 'Unknown error');
      if (this.pendingRegister) {
        this.pendingRegister.reject(new Error(message));
        this.pendingRegister = null;
      } else {
        this.options.onError?.(message);
      }
      return;
    }

    if (data.type === 'stop') {
      this.options.onStop?.();
    }
  }

  register(platform: string, meetingId: string): Promise<RegisterResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not connected'));
    }

    this.log('Registering meeting', { platform, meetingId });

    return new Promise((resolve, reject) => {
      this.pendingRegister = { resolve, reject };
      this.ws?.send(
        JSON.stringify({
          action: 'register',
          platform,
          meeting_id: meetingId,
        }),
      );
    });
  }

  sendTranscript(frame: TranscriptFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(frame));
  }

  sendStatus(status: 'joining' | 'transcribing' | 'completed' | 'failed' | 'stopped'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.log('Sending meeting status', { status });
    this.ws.send(JSON.stringify({ type: 'meeting.status', status }));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
