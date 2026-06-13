export interface PendingConnect {
  playlistId: number;
  backendUrl: string;
  authToken: string;
  windowId: number;
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
  capture?: { stop: () => void };
  wsClient?: { disconnect: () => void; sendStatus: (s: string) => void };
  segmentBuilder?: unknown;
  speaker: string;
}

export type ExtensionPhase =
  | 'idle'
  | 'awaiting_tab'
  | 'ready'
  | 'capturing';
