import { StateManager } from './state';
import { TranscriptionAgent } from './transcription';
import { VexaTranscriptionAgent } from './transcription/vexa';
import { Configuration, ConnectionStatus, Transcription, State } from './types';

export class DNAFrontendFramework {
  private stateManager: StateManager;
  private transcriptionAgent: TranscriptionAgent;
  private configuration: Configuration;

  constructor(configuration: Configuration) {
    this.stateManager = new StateManager();
    this.configuration = configuration;
    // TODO: Make this configurable
    this.transcriptionAgent = new VexaTranscriptionAgent(this.stateManager, this.configuration);
    
  }

  public getStateManager(): StateManager {
    return this.stateManager;
  }

  public async joinMeeting(
    meetingId: string, 
    transcriptCallback?: (transcript: Transcription) => void
  ): Promise<void> {
    await this.transcriptionAgent.joinMeeting(meetingId, transcriptCallback);
  }

  public async leaveMeeting(): Promise<void> {
    await this.transcriptionAgent.leaveMeeting();
  }

  public async getConnectionStatus(): Promise<ConnectionStatus> {
    return this.transcriptionAgent.getConnectionStatus();
  }

  public async setVersion(version: number, context?: Record<string, any>): Promise<void> {
    this.stateManager.setVersion(version, context);
  }

  public subscribeToStateChanges(listener: (state: State) => void): () => void {
    return this.stateManager.subscribe(listener);
  }
}

// Export all types and classes
export { StateManager } from './state';
export { TranscriptionAgent } from './transcription';
export { VexaTranscriptionAgent } from './transcription/vexa';
export { ConnectionStatus } from './types';
export * from './types';
