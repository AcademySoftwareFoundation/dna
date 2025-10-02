import { NoteGenerator } from './notes/noteGenerator';
import { StateManager } from './state';
import { TranscriptionAgent } from './transcription';
import { VexaTranscriptionAgent } from './transcription/vexa';
import { Configuration, ConnectionStatus, Transcription, State } from './types';

export class DNAFrontendFramework {
  private stateManager: StateManager;
  private transcriptionAgent: TranscriptionAgent;
  private noteGenerator: NoteGenerator;
  private configuration: Configuration;
    
  constructor(configuration: Configuration) {
    this.stateManager = new StateManager();
    this.configuration = configuration;
    // TODO: Make this configurable
    this.transcriptionAgent = new VexaTranscriptionAgent(this.stateManager, this.configuration);
    this.noteGenerator = new NoteGenerator(this.stateManager, this.configuration);
  }

  public getStateManager(): StateManager {
    return this.stateManager;
  }

  public getNoteGenerator(): NoteGenerator {
    return this.noteGenerator;
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

  public async generateNotes(versionId: number): Promise<string> {
    const notes = await this.noteGenerator.generateNotes(versionId);
    this.stateManager.setAiNotes(versionId, notes);
    return notes;
  }

  public setUserNotes(versionId: number, notes: string): void {
    this.stateManager.setUserNotes(versionId, notes);
  }

  public setAiNotes(versionId: number, notes: string): void {
    this.stateManager.setAiNotes(versionId, notes);
  }

  public addVersions(versions: Array<{ id: number; context?: Record<string, any> }>): void {
    this.stateManager.addVersions(versions);
  }
}

// Export all types and classes
export { StateManager } from './state';
export { TranscriptionAgent } from './transcription';
export { VexaTranscriptionAgent } from './transcription/vexa';
export { ConnectionStatus } from './types';
export * from './types';
