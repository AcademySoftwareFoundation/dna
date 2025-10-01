import { StateManager } from '../../state';
import { TranscriptionAgent } from '../index';
import { ConnectionStatus } from '../../types';

export class VexaTranscriptionAgent extends TranscriptionAgent {
  private _baseUrl: string | undefined;
  private _apiKey: string | undefined;
  private _meetingId: string | null = null;
  private _platform: string | undefined;
  private _botId: string | null = null;

  constructor(stateManager: StateManager) {
    super(stateManager);

    this._baseUrl = process.env.VEXA_URL;
    this._apiKey = process.env.VEXA_API_KEY;
    this._platform = process.env.PLATFORM;
  }

  public async joinMeeting(meetingId: string): Promise<void> {
    if (!this._baseUrl) {
      throw new Error('VEXA_URL environment variable is not set');
    }

    if (!this._apiKey) {
      throw new Error('VEXA_API_KEY environment variable is not set');
    }

    this._meetingId = meetingId;

    // Request a bot from the Vexa API
    console.log('Requesting bot from the Vexa API');
    const bot = await this.requestBot(meetingId);
    console.log('Bot request completed:', bot);
  }

  public async leaveMeeting(): Promise<void> {
    if (!this._meetingId) {
      console.log('No active meeting to leave');
      return;
    }

    const response = await fetch(
      `${this._baseUrl}/meetings/${this._meetingId}`,
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

  /**
   * Check if currently connected to a meeting
   */
  public async isConnected(): Promise<boolean> {
    return (
      this._meetingId !== null &&
      (await this.getConnectionStatus()) === ConnectionStatus.CONNECTED
    );
  }

  /**
   * Get the current bot ID
   */
  public getBotId(): string | null {
    return this._botId;
  }

  /**
   * Get connection status
   */
  public async getConnectionStatus(): Promise<ConnectionStatus> {
    if (!this._meetingId) {
      return ConnectionStatus.DISCONNECTED;
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
        return meeting.status;
      }
    }
    return ConnectionStatus.UNKNOWN;
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
}
