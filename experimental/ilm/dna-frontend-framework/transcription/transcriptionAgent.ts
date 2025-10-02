import { StateManager } from '../state';
import { ConnectionStatus, Transcription } from '../types';

export abstract class TranscriptionAgent {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Join a meeting
   * 
   * Dispatches a bot to join the provided meeting. In cases such 
   * as vexa where a platform is needed, the platform is provided by 
   * environment variables.
   * 
   * @param meetingId - The ID of the meeting to join
   */
  public async joinMeeting(meetingId: string, callback?: (transcript: Transcription) => void): Promise<void> {
    throw new Error('Not implemented');
  }

  public async leaveMeeting(): Promise<void> {
    throw new Error('Not implemented');
  }

  public getCurrentMeetingId(): string | null {
    throw new Error('Not implemented');
  }

  public async getConnectionStatus(): Promise<ConnectionStatus> {
    throw new Error('Not implemented');
  }

  public async isConnected(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  public getBotId(): string | null {
    throw new Error('Not implemented');
  }
}
