import { StateManager } from '../state';
import { ConnectionStatus } from '../types';

export abstract class TranscriptionAgent {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  public async joinMeeting(meetingId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  public async leaveMeeting(): Promise<void> {
    throw new Error('Not implemented');
  }

  public async getConnectionStatus(): Promise<ConnectionStatus> {
    throw new Error('Not implemented');
  }
}
