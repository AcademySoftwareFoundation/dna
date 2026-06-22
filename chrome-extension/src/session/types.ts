export interface TranscriptionRuntimeConfig {
  sttUrl: string;
  sttApiKey: string;
  sttModel: string;
  chunkDurationMs: number;
  language?: string;
}

export interface PendingConnect {
  playlistId: number;
  backendUrl: string;
  authToken: string;
  windowId: number;
  transcription?: TranscriptionRuntimeConfig;
}

export interface ResolvedMeetTab {
  tabId: number;
  meetingId: string;
  platform: 'google_meet';
}

export interface SessionState {
  playlistId: number;
  tabId: number;
  meetingId: string;
  platform: string;
  backendUrl: string;
  authToken: string;
  transcription: TranscriptionRuntimeConfig;
  captureStarted: boolean;
  capture?: { stop: () => void };
  wsClient?: {
    disconnect: () => void;
    sendStatus: (status: string) => void;
    sendTranscript: (frame: unknown) => void;
  };
  segmentBuilder?: {
    buildConfirmed: (
      input: {
        text: string;
        start: number;
        end: number;
        language?: string;
      },
      speaker: string,
    ) => unknown;
  };
  speaker: string;
}

export type ExtensionPhase =
  | 'idle'
  | 'awaiting_tab'
  | 'ready'
  | 'awaiting_capture'
  | 'capturing';
