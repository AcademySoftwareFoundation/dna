import { getApiKey } from './transcription-service'

// WebSocket event types
export interface TranscriptMutableEvent {
  type: 'transcript.mutable'
  meeting: { id: number }
  payload: { 
    segment?: WebSocketSegment
    segments?: WebSocketSegment[]
    [key: string]: any
  }
  ts: string
}

export interface TranscriptFinalizedEvent {
  type: 'transcript.finalized'
  meeting: { id: number }
  payload: {
    segment?: WebSocketSegment
    segments?: WebSocketSegment[]
    [key: string]: any
  }
  ts: string
}

export interface MeetingStatusEvent {
  type: 'meeting.status'
  meeting: { id: number }
  payload: { status: string }
  ts: string
}

export interface WebSocketSegment {
  id: string
      text: string
  start_time: number
  end_time: number
      speaker?: string
  language?: string
}

export interface WebSocketErrorEvent {
  type: 'error'
  error: string
}

export interface WebSocketPongEvent {
  type: 'pong'
}

export interface WebSocketSubscribedEvent {
  type: 'subscribed'
  meetings: number[]
}

export interface WebSocketUnsubscribedEvent {
  type: 'unsubscribed'
  meetings: number[]
}

export type WebSocketEvent = 
  | TranscriptMutableEvent 
  | TranscriptFinalizedEvent 
  | MeetingStatusEvent 
  | WebSocketErrorEvent 
  | WebSocketPongEvent
  | WebSocketSubscribedEvent
  | WebSocketUnsubscribedEvent
  | { type: string; [key: string]: any } // Allow unknown message types

// WebSocket service class
export class TranscriptionWebSocketService {
  private ws: WebSocket | null = null
  private url: string = ''
  private apiKey: string = ''
  private subscribedMeetings: Set<string> = new Set()
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private connectionTimeout: NodeJS.Timeout | null = null
  
  // Event handlers
  private onTranscriptMutable?: (event: TranscriptMutableEvent) => void
  private onTranscriptFinalized?: (event: TranscriptFinalizedEvent) => void
  private onMeetingStatus?: (event: MeetingStatusEvent) => void
  private onError?: (event: WebSocketErrorEvent) => void
  private onConnected?: () => void
  private onDisconnected?: () => void

  constructor() {
    this.updateUrl()
  }

  private updateUrl(): void {
    // Get API key for WebSocket URL
    this.apiKey = getApiKey()
    
    // Derive WebSocket URL from API base URL
    const apiUrl = this.getApiBaseUrl()
    if (apiUrl.startsWith('https://')) {
      this.url = apiUrl.replace('https://', 'wss://') + '/ws'
    } else if (apiUrl.startsWith('http://')) {
      this.url = apiUrl.replace('http://', 'ws://') + '/ws'
    } else {
      // Default to secure WebSocket
      this.url = 'wss://devapi.dev.vexa.ai/ws'
    }
    
    // console.log("WebSocket URL derived:", this.url)
  }

  private getApiBaseUrl(): string {
    try {
      if (typeof window !== 'undefined') {
        const match = document.cookie.match(/(^|;)\s*vexa_api_url\s*=\s*([^;]+)/);
        const cookieValue = match ? decodeURIComponent(match[2]) : '';
        if (cookieValue) {
          return cookieValue;
        }
      }
      // Vite environment variable fallback
      const envUrl = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VEXA_API_URL
        ? import.meta.env.VITE_VEXA_API_URL
        : '';
      if (envUrl) {
        return envUrl;
      }
      // Default URL
      return "https://devapi.dev.vexa.ai";
    } catch (error) {
      console.error("Error getting API base URL:", error);
      return "https://devapi.dev.vexa.ai";
    }
  }

  public async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // console.log("WebSocket already connected")
      return
    }

    this.updateUrl()
    
    if (!this.apiKey) {
      throw new Error("API key is required for WebSocket connection")
    }

    const wsUrl = `${this.url}?api_key=${encodeURIComponent(this.apiKey)}`
    // console.log("Connecting to WebSocket:", wsUrl.replace(this.apiKey, '***'))

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)
        
        // Set up connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.handleError({ type: 'error', error: 'WebSocket connection timeout' })
            reject(new Error('WebSocket connection timeout'))
          }
        }, 10000) // 10 second timeout

        this.ws.onopen = () => {
          // console.log("✅ [WEBSOCKET SERVICE] Connected to:", this.url.replace(this.apiKey, '***'))
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout)
            this.connectionTimeout = null
          }
          this.reconnectAttempts = 0
          this.onConnected?.()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            // console.log("📨 [WEBSOCKET SERVICE] Message received:", data.type || "NO_TYPE")
            // console.log("📨 [WEBSOCKET SERVICE] Full message structure:", JSON.stringify(data, null, 2))
            
            // Special debugging for transcript.mutable messages
            if (data.type === 'transcript.mutable') {
              // console.log("🔍 [DEBUG] transcript.mutable payload:", data.payload)
              // console.log("🔍 [DEBUG] payload keys:", data.payload ? Object.keys(data.payload) : "null")
              if (data.payload && data.payload.segment) {
                // console.log("🔍 [DEBUG] segment data:", data.payload.segment)
                // console.log("🔍 [DEBUG] segment text:", data.payload.segment.text)
              }
            }
            
            // Handle messages that might not have the expected structure
            if (!data.type && data.segments && Array.isArray(data.segments)) {
              // console.log("🔄 [WEBSOCKET SERVICE] Detected segments array without type, treating as transcript.mutable");
              // Convert this to the expected format
              const transcriptEvent = {
                type: 'transcript.mutable',
                meeting: { id: 0 }, // We'll need to get this from context
                payload: { segments: data.segments },
                ts: new Date().toISOString()
              };
              this.handleMessage(transcriptEvent);
              return;
            }
            
            this.handleMessage(data)
          } catch (error) {
            console.error("🔴 [WEBSOCKET SERVICE] Error parsing message:", error)
          }
        }

        this.ws.onclose = (event) => {
          // console.log("❌ [WEBSOCKET SERVICE] Disconnected with code:", event.code)
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout)
            this.connectionTimeout = null
          }
          this.onDisconnected?.()
          
          // Attempt to reconnect if we have subscribed meetings
          if (this.subscribedMeetings.size > 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error("🔴 [WEBSOCKET SERVICE] Connection error:", error)
          this.handleError({ type: 'error', error: 'WebSocket connection error' })
        }

      } catch (error) {
        reject(error)
      }
    })
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff
    // console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error("Reconnection failed:", error)
      })
    }, delay)
  }

  private handleMessage(data: WebSocketEvent): void {
    switch (data.type) {
      case 'transcript.initial':
        // console.log("🟣 [WEBSOCKET SERVICE] Processing transcript.initial event");
        // Treat initial same as mutable for merge/upsert flow
        this.onTranscriptMutable?.(data as unknown as TranscriptMutableEvent)
        break
      case 'transcript.mutable':
        // console.log("🟢 [WEBSOCKET SERVICE] Processing transcript.mutable event");
        this.onTranscriptMutable?.(data as TranscriptMutableEvent)
        break
      case 'transcript.finalized':
        // console.log("🔵 [WEBSOCKET SERVICE] Processing transcript.finalized event");
        this.onTranscriptFinalized?.(data as TranscriptFinalizedEvent)
        break
      case 'meeting.status':
        // console.log("🟡 [WEBSOCKET SERVICE] Processing meeting.status event");
        this.onMeetingStatus?.(data as MeetingStatusEvent)
        break
      case 'subscribed':
        // console.log("🔌 [WEBSOCKET SERVICE] Subscription confirmed for meetings:", (data as any).meetings)
        break
      case 'unsubscribed':
        // console.log("🔌 [WEBSOCKET SERVICE] Unsubscription confirmed for meetings:", (data as any).meetings)
        break
      case 'pong':
        // console.log("🏓 [WEBSOCKET SERVICE] Received pong from server")
        break
      case 'error':
        // console.log("🔴 [WEBSOCKET SERVICE] Processing error event");
        this.handleError(data as WebSocketErrorEvent)
        break
      default:
        // console.log("❓ [WEBSOCKET SERVICE] Unknown WebSocket message type:", data.type, data)
    }
  }

  private handleError(event: WebSocketErrorEvent): void {
    console.error("WebSocket error details:", event.error)
    
    // Handle specific error types
    if (event.error === "invalid_unsubscribe_payload") {
      console.warn("🔴 [WEBSOCKET SERVICE] Invalid unsubscribe payload - this may be a server-side validation issue")
      // Don't propagate this specific error to avoid breaking the UI
      return
    }
    
    this.onError?.(event)
  }

  public async subscribeToMeeting(meeting: { platform: string; native_id: string }): Promise<void> {
    if (!this.isConnected()) {
      // console.log("🔌 [WEBSOCKET SERVICE] WebSocket not connected, connecting...")
      await this.connect()
    }

    // Double-check that WebSocket is ready
    if (this.ws?.readyState !== WebSocket.OPEN) {
      // console.log("🔌 [WEBSOCKET SERVICE] WebSocket still not ready, waiting...")
      // Wait for WebSocket to be fully ready
      await new Promise<void>((resolve, reject) => {
        const checkReady = () => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            resolve()
          } else if (this.ws?.readyState === WebSocket.CONNECTING) {
            // Still connecting, wait a bit more
            setTimeout(checkReady, 100)
          } else {
            reject(new Error(`WebSocket failed to connect, readyState: ${this.ws?.readyState}`))
          }
        }
        checkReady()
      })
    }

    const meetingKey = `native:${meeting.platform}:${meeting.native_id}`
    this.subscribedMeetings.add(meetingKey)

    // Send both keys for compatibility with server variants
    const meetingsPayload = [{ platform: meeting.platform, native_id: meeting.native_id, native_meeting_id: meeting.native_id }]

    const message = {
      action: 'subscribe',
      meetings: meetingsPayload
    }

    // console.log("🔌 [WEBSOCKET SERVICE] WebSocket ready, sending subscription message")
    this.ws?.send(JSON.stringify(message))
    // console.log("🔌 [WEBSOCKET SERVICE] Subscribed to meeting:", meetingsPayload)

    // Wait a moment for subscription confirmation
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  public async unsubscribeFromMeeting(meeting: { platform: string; native_id: string }): Promise<void> {
    const meetingKey = `native:${meeting.platform}:${meeting.native_id}`
    this.subscribedMeetings.delete(meetingKey)
    
    if (this.isConnected()) {
      // Send both keys for compatibility with server variants
      const meetingsPayload = [{ platform: meeting.platform, native_id: meeting.native_id, native_meeting_id: meeting.native_id }]

      const message = {
        action: 'unsubscribe',
        meetings: meetingsPayload
      }

      // console.log("🔌 [WEBSOCKET SERVICE] Sending unsubscribe message:", JSON.stringify(message))
      try {
        this.ws?.send(JSON.stringify(message))
        // console.log("🔌 [WEBSOCKET SERVICE] Unsubscribed from meeting:", meetingsPayload)
      } catch (error) {
        console.error("🔴 [WEBSOCKET SERVICE] Error sending unsubscribe message:", error)
        this.handleError({ type: 'error', error: `Failed to unsubscribe: ${error}` })
      }
    }
  }

  public disconnect(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
    
    this.subscribedMeetings.clear()
    this.ws?.close()
    this.ws = null
    // console.log("WebSocket disconnected")
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  public getSubscribedMeetings(): string[] {
    return Array.from(this.subscribedMeetings)
  }

  // Event handler setters
  public setOnTranscriptMutable(handler: (event: TranscriptMutableEvent) => void): void {
    this.onTranscriptMutable = handler
  }

  public setOnTranscriptFinalized(handler: (event: TranscriptFinalizedEvent) => void): void {
    this.onTranscriptFinalized = handler
  }

  public setOnMeetingStatus(handler: (event: MeetingStatusEvent) => void): void {
    this.onMeetingStatus = handler
  }

  public setOnError(handler: (event: WebSocketErrorEvent) => void): void {
    this.onError = handler
  }

  public setOnConnected(handler: () => void): void {
    this.onConnected = handler
  }

  public setOnDisconnected(handler: () => void): void {
    this.onDisconnected = handler
  }
}

// Singleton instance
let wsServiceInstance: TranscriptionWebSocketService | null = null

export function getWebSocketService(): TranscriptionWebSocketService {
  if (!wsServiceInstance) {
    wsServiceInstance = new TranscriptionWebSocketService()
  }
  return wsServiceInstance
}

// Helper function to convert WebSocket segments to our format
export function convertWebSocketSegment(segment: any): any {
  // console.log("🔄 [WEBSOCKET SERVICE] Converting segment:", segment);
  // console.log("🔄 [WEBSOCKET SERVICE] Segment type:", typeof segment);
  // console.log("🔄 [WEBSOCKET SERVICE] Segment keys:", segment ? Object.keys(segment) : "null/undefined");
  // console.log("🔄 [WEBSOCKET SERVICE] Full segment JSON:", JSON.stringify(segment, null, 2));
  
  // Handle case where segment might be null/undefined
  if (!segment) {
    console.error("🔄 [WEBSOCKET SERVICE] Segment is null/undefined");
    return {
      id: `error-${Date.now()}`,
      text: "Error: Invalid segment data",
      timestamp: new Date().toISOString(),
      speaker: "Unknown",
      language: "en",
    };
  }
  
  // Try to find text in different possible locations
  let text = "";
  // console.log("🔍 [DEBUG] Looking for text in segment...");
  // console.log("🔍 [DEBUG] segment.text:", segment.text);
  // console.log("🔍 [DEBUG] segment.content:", segment.content);
  // console.log("🔍 [DEBUG] segment.transcript:", segment.transcript);
  // console.log("🔍 [DEBUG] segment.message:", segment.message);
  
  if (segment.text) {
    text = segment.text;
    // console.log("🔄 [WEBSOCKET SERVICE] Found text in segment.text:", text);
  } else if (segment.content) {
    text = segment.content;
    // console.log("🔄 [WEBSOCKET SERVICE] Found text in segment.content:", text);
  } else if (segment.transcript) {
    text = segment.transcript;
    // console.log("🔄 [WEBSOCKET SERVICE] Found text in segment.transcript:", text);
  } else if (segment.message) {
    text = segment.message;
    // console.log("🔄 [WEBSOCKET SERVICE] Found text in segment.message:", text);
  } else {
    // console.warn("🔄 [WEBSOCKET SERVICE] No text found in segment, using empty string");
    // console.log("🔍 [DEBUG] All possible text fields are empty or undefined");
    text = "";
  }
  
  // Handle different timestamp formats — STRICT absolute UTC only for UI sorting
  let timestamp: string | null = null;
  const startTime = segment.start_time || segment.startTime || segment.start || segment.timestamp || segment.time;

  if (segment.absolute_start_time) {
    timestamp = segment.absolute_start_time;
    // console.log("🔄 [WEBSOCKET SERVICE] Using absolute_start_time:", timestamp);
  } else if (segment.updated_at) {
    // Keep as fallback timestamp for UI if absolute is missing, but mark as non-absolute
    timestamp = segment.updated_at;
    // console.log("🔄 [WEBSOCKET SERVICE] Using updated_at timestamp (no absolute_start_time):", timestamp);
  }
  
  // Generate ID from session_uid and start time if available
  let id = segment.id;
  if (!id && segment.session_uid && startTime) {
    id = `${segment.session_uid}-${startTime}`;
  } else if (!id) {
    id = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  const convertedSegment: any = {
    id: id,
    text: text,
    timestamp: timestamp || new Date().toISOString(),
    speaker: segment.speaker || segment.speaker_name || "Unknown",
    language: segment.language || segment.lang || "en",
  };

  // Preserve absolute fields when present for strict UI merge/sort
  if (segment.absolute_start_time) convertedSegment.absolute_start_time = segment.absolute_start_time
  if (segment.absolute_end_time) convertedSegment.absolute_end_time = segment.absolute_end_time
  if (segment.updated_at) convertedSegment.updated_at = segment.updated_at
  
  // console.log("🔄 [WEBSOCKET SERVICE] Converted segment:", convertedSegment);
  // console.log("🔄 [WEBSOCKET SERVICE] Text length:", text.length);
  return convertedSegment;
}