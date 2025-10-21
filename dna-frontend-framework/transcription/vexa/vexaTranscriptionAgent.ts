import { StateManager } from '../../state';
import { TranscriptionAgent } from '../index';
import { ConnectionStatus, Transcription } from '../../types';
import { WebSocketEvent } from './types';

export class VexaTranscriptionAgent extends TranscriptionAgent {
  private _baseUrl: string | undefined;
  private _apiKey: string | undefined;
  private _meetingId: string | null = null;
  private _platform: string | undefined;
  private _botId: string | null = null;
  private _ws: WebSocket | null = null;
  private _wsUrl: string | undefined;
  private _callback?: (transcript: Transcription) => void;
  private _stateManager: StateManager;

  constructor(stateManager: StateManager) {
    super(stateManager);

    this._baseUrl = process.env.VEXA_URL;
    this._apiKey = process.env.VEXA_API_KEY;
    this._platform = process.env.PLATFORM;
    this._callback = undefined;
    this._setupWebSocketUrl();
    this._stateManager = stateManager;
  
  }

  public async joinMeeting(meetingId: string, callback?: (transcript: Transcription) => void): Promise<void> {
    if (!this._baseUrl) {
      throw new Error('VEXA_URL environment variable is not set');
    }

    if (!this._apiKey) {
      throw new Error('VEXA_API_KEY environment variable is not set');
    }

    this._meetingId = meetingId;
    this._callback = callback;

    // Check if the bot already exists
    const bot = await this._getBotInfo();
    if (bot && bot.status !== 'completed') {
      console.log('Bot already exists:', bot);
    } else {
      // Request a bot from the Vexa API
      console.log('Requesting bot from the Vexa API');
      const bot = await this.requestBot(meetingId);
      console.log('Bot request completed:', bot);
    }

    // Connect to WebSocket for real-time transcription
    await this._connectWebSocket();
  }

  public async leaveMeeting(): Promise<void> {
    if (!this._meetingId) {
      console.log('No active meeting to leave');
      return;
    }

    // Disconnect WebSocket first
    this._disconnectWebSocket();

    const response = await fetch(
      `${this._baseUrl}/bots/${this._platform}/${this._meetingId}`,
      {
        method: 'DELETE',
        headers: {
          'X-API-Key': `${this._apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`HTTP Error ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    this._meetingId = null;
    this._botId = null;
  }

  /**
   * Get the current meeting ID
   */
  public getCurrentMeetingId(): string | null {
    return this._meetingId;
  }

  public async isConnected(): Promise<boolean> {
    return (
      this._meetingId !== null &&
      (await this.getConnectionStatus()) === ConnectionStatus.CONNECTED
    );
  }

  public getBotId(): string | null {
    return this._botId;
  }

  private _setupWebSocketUrl(): void {
    if (!this._baseUrl) return;
    
    // Convert HTTP/HTTPS URL to WebSocket URL
    if (this._baseUrl.startsWith('https://')) {
      this._wsUrl = this._baseUrl.replace('https://', 'wss://') + '/ws';
    } else if (this._baseUrl.startsWith('http://')) {
      this._wsUrl = this._baseUrl.replace('http://', 'ws://') + '/ws';
    } else {
      this._wsUrl = 'wss://devapi.dev.vexa.ai/ws';
    }
    
    console.log('WebSocket URL configured:', this._wsUrl);
  }

  private async _getBotInfo(): Promise<Record<string, any> | null> {
    if (!this._meetingId) {
      return null;
    }
    const url = `${this._baseUrl}/meetings`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': `${this._apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const responseData = await response.text();
    const meetingData = JSON.parse(responseData);
    console.log(meetingData);
    // TODO: We currently need to iterate over all the meetings to find the one that matches the meeting ID.
    // This is not efficient and we should update vexa to return the meeting info directly.
    for (const meeting of meetingData.meetings) {
      if (meeting.native_meeting_id === this._meetingId) {
        return meeting;
      }
    }
    return null;
  }
  public async getConnectionStatus(): Promise<ConnectionStatus> {
    if (!this._meetingId) {
      return ConnectionStatus.DISCONNECTED;
    }
  
    const botInfo = await this._getBotInfo();
    if (botInfo) {
      return botInfo.status;
    } else {
      return ConnectionStatus.UNKNOWN;
    }
  }

  private async requestBot(meetingId: string): Promise<void> {
    const payload = {
      platform: this._platform,
      native_meeting_id: meetingId,
      bot_name: 'DNA-Frontend-Framework',
    };

    const url = `${this._baseUrl}/bots`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': `${this._apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP Error ${response.status}: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseData = await response.text();
      const botData = JSON.parse(responseData);

      // Store the bot ID
      if (botData && botData.id) {
        this._botId = botData.id;
        console.log(`🤖 Bot created with ID: ${this._botId}`);
      } else {
        console.warn('⚠️ No bot ID received in response');
      }

      return botData;
    } catch (error) {
      console.error('Detailed fetch error:');
      console.error(
        '- Error type:',
        error instanceof Error ? error.constructor.name : typeof error
      );
      console.error(
        '- Error message:',
        error instanceof Error ? error.message : String(error)
      );
      console.error(
        '- Error stack:',
        error instanceof Error ? error.stack : 'No stack trace'
      );

      if (error instanceof Error && 'code' in error) {
        console.error('- Error code:', (error as any).code);
      }

      if (error instanceof Error && 'cause' in error) {
        console.error('- Error cause:', (error as any).cause);
      }

      throw error;
    }
  }

  private async _connectWebSocket(): Promise<void> {
    if (!this._wsUrl || !this._apiKey) {
      console.error('WebSocket URL or API key not available');
      return;
    }

    if (this._ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    const wsUrl = `${this._wsUrl}?api_key=${encodeURIComponent(this._apiKey)}`;
    console.log('Connecting to WebSocket:', wsUrl.replace(this._apiKey, '***'));

    return new Promise((resolve, reject) => {
      try {
        this._ws = new WebSocket(wsUrl);

        this._ws.onopen = () => {
          console.log('✅ [WEBSOCKET] Connected to Vexa transcription service');
          this._subscribeToMeeting();
          resolve();
        };

        this._ws.onmessage = (event) => {
          try {
            const data: WebSocketEvent = JSON.parse(event.data);
            this._handleWebSocketMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this._ws.onclose = (event) => {
          console.log('❌ [WEBSOCKET] Disconnected with code:', event.code);
        };

        this._ws.onerror = (error) => {
          console.error('🔴 [WEBSOCKET] Connection error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private _disconnectWebSocket(): void {
    if (this._ws) {
      console.log('Disconnecting WebSocket...');
      this._ws.close();
      this._ws = null;
    }
  }

  private async _subscribeToMeeting(): Promise<void> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN || !this._meetingId || !this._platform) {
      console.error('Cannot subscribe: WebSocket not ready or missing meeting info');
      return;
    }

    const message = {
      action: 'subscribe',
      meetings: [{
        platform: this._platform,
        native_id: this._meetingId,
        native_meeting_id: this._meetingId
      }]
    };

    console.log('🔌 [WEBSOCKET] Subscribing to meeting:', message);
    this._ws.send(JSON.stringify(message));
  }
  
  private async onTranscriptCallback(transcript: Transcription): Promise<void> {
    console.log('🔄 [CALLBACK] Processing transcript:', transcript);
    
    if (this._callback) {
      console.log('🔄 [CALLBACK] Calling user callback');
      this._callback(transcript);
    } else {
      console.log('🔄 [CALLBACK] No user callback provided');
    }
    
    console.log('🔄 [CALLBACK] Adding to stateManager...');
    this._stateManager.addTranscription(transcript);
    
    // Verify it was added
    const state = this._stateManager.getState();
    console.log('🔄 [CALLBACK] Current state after adding:', JSON.stringify(state, null, 2));
  }

  private _handleWebSocketMessage(data: WebSocketEvent): void {
    console.log('📨 [WEBSOCKET] Received event:', data.type || 'NO_TYPE');
    console.log('📨 [WEBSOCKET] Full message:', JSON.stringify(data, null, 2));

    switch (data.type) {
      case 'transcript.mutable':
      case 'transcript.finalized':
        console.log('🟢 [WEBSOCKET] Processing transcript.mutable/finalized event');
        console.log('🟢 [WEBSOCKET] Payload:', data.payload);
        
        // Handle both single segment and segments array
        const segments = data.payload.segments || (data.payload.segment ? [data.payload.segment] : []);
        
        for (const segment of segments) {
          try {
            const transcript: Transcription = {
              text: segment.text || '',
              timestampStart: segment.absolute_start_time || new Date().toISOString(),
              timestampEnd: segment.absolute_end_time || new Date().toISOString(),
              speaker: segment.speaker || 'Unknown',
            };
            
            console.log('🔄 [WEBSOCKET] Created transcript:', transcript);
            this.onTranscriptCallback(transcript);
          } catch (error) {
            console.error('❌ [WEBSOCKET] Error creating transcript from segment:', error);
            console.error('❌ [WEBSOCKET] Segment data:', segment);
          }
        }
        break;
      
        case 'meeting.status':
        console.log('🟡 [WEBSOCKET] Processing meeting.status event');
        console.log('🟡 [WEBSOCKET] Status:', data.payload?.status);
        break;
      
      case 'error':
        console.log('🔴 [WEBSOCKET] Processing error event');
        console.log('🔴 [WEBSOCKET] Error:', data.error);
        break;
      
      case 'subscribed':
        console.log('🔌 [WEBSOCKET] Subscription confirmed for meetings:', (data as any).meetings);
        break;
      
      case 'unsubscribed':
        console.log('🔌 [WEBSOCKET] Unsubscription confirmed for meetings:', (data as any).meetings);
        break;
      
      case 'pong':
        console.log('🏓 [WEBSOCKET] Received pong from server');
        break;
      
      default:
        console.log('❓ [WEBSOCKET] Unknown event type:', data.type);
        console.log('❓ [WEBSOCKET] Full data:', data);
    }
  }
}
