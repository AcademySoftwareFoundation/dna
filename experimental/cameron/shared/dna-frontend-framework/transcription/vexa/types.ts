// WebSocket event types
export interface TranscriptMutableEvent {
    type: 'transcript.mutable';
    meeting: { id: number };
    payload: {
      segment?: any;
      segments?: any[];
      [key: string]: any;
    };
    ts: string;
  }
  
  export interface TranscriptFinalizedEvent {
    type: 'transcript.finalized';
    meeting: { id: number };
    payload: {
      segment?: any;
      segments?: any[];
      [key: string]: any;
    };
    ts: string;
  }
  
  export interface MeetingStatusEvent {
    type: 'meeting.status';
    meeting: { id: number };
    payload: { status: string };
    ts: string;
  }
  
  export interface WebSocketErrorEvent {
    type: 'error';
    error: string;
  }
  
  export type WebSocketEvent = 
    | TranscriptMutableEvent 
    | TranscriptFinalizedEvent 
    | MeetingStatusEvent 
    | WebSocketErrorEvent 
    | { type: string; [key: string]: any };