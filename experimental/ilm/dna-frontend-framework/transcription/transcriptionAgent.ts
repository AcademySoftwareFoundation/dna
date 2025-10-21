import { StateManager } from '../state';
import { ConnectionStatus, Transcription } from '../types';

/**
 * Abstract class for transcription agents
 * 
 * This class is used to abstract the transcription agent
 * and provide a common interface for all transcription agents.
 */
export abstract class TranscriptionAgent {
  private stateManager: StateManager;

  /**
   * Constructor for the TranscriptionAgent
   * 
   * @param stateManager - The state manager to use
   */
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
   * @param callback - The callback to call when a transcript is received
  */
  public async joinMeeting(meetingId: string, callback?: (transcript: Transcription) => void): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Leave a meeting
   * 
   * Sends request for a bot to leave the current meeting.
   */
  public async leaveMeeting(): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Get the current meeting ID
   * 
   * @returns The current meeting ID
   */
  public getCurrentMeetingId(): string | null {
    throw new Error('Not implemented');
  }

  /**
   * Get the connection status
   * 
   * @returns The connection status
   */
  public async getConnectionStatus(): Promise<ConnectionStatus> {
    throw new Error('Not implemented');
  }

  /**
   * Check if the transcription agent is connected
   * 
   * @returns True if the transcription agent is connected, false otherwise
   */
  public async isConnected(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  /**
   * Get the bot ID
   * 
   * @returns The bot ID
   */
  public getBotId(): string | null {
    throw new Error('Not implemented');
  }
}
