import { NoteGenerator } from "./notes/noteGenerator";
import { StateManager } from "./state";
import { TranscriptionAgent } from "./transcription";
import { VexaTranscriptionAgent } from "./transcription/vexa";
import { Configuration, ConnectionStatus, Transcription, State } from "./types";

export class DNAFrontendFramework {
  private stateManager: StateManager;
  private transcriptionAgent: TranscriptionAgent;
  private noteGenerator: NoteGenerator;
  private configuration: Configuration;

  constructor(configuration: Configuration) {
    this.stateManager = new StateManager();
    this.configuration = configuration;
    // TODO: Make this configurable
    this.transcriptionAgent = new VexaTranscriptionAgent(
      this.stateManager,
      this.configuration,
    );
    this.noteGenerator = new NoteGenerator(
      this.stateManager,
      this.configuration,
    );
  }

  /**
   * Get the state manager
   *
   * @returns The state manager
   */
  public getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Get the note generator
   *
   * @returns The note generator
   */
  public getNoteGenerator(): NoteGenerator {
    return this.noteGenerator;
  }

  /**
   * Join a meeting
   *
   * @param meetingId - The ID of the meeting to join
   * @param transcriptCallback - The callback to call when a transcript is received
   */
  public async joinMeeting(
    meetingId: string,
    transcriptCallback?: (transcript: Transcription) => void,
  ): Promise<void> {
    await this.transcriptionAgent.joinMeeting(meetingId, transcriptCallback);
  }

  /**
   * Leave a meeting
   */
  public async leaveMeeting(): Promise<void> {
    await this.transcriptionAgent.leaveMeeting();
  }

  /**
   * Get the connection status
   *
   * @returns The connection status
   */
  public async getConnectionStatus(): Promise<ConnectionStatus> {
    return this.transcriptionAgent.getConnectionStatus();
  }

  /**
   * Set an active version.
   *
   * When set, transcriptions will automatically be added to the active version.
   *
   * @param version - The version to set
   * @param context - The context to set/update with the version.
   */
  public async setVersion(
    version: number,
    context?: Record<string, any>,
  ): Promise<void> {
    this.stateManager.setVersion(version, context);
  }

  /**
   * Subscribe to state changes
   *
   * @param listener - The listener to subscribe to
   * @returns A function to unsubscribe from the listener
   */
  public subscribeToStateChanges(listener: (state: State) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  /**
   * Generate notes for a version.
   *
   * These notes are automatically set as the ai notes for the version.
   *
   * @param versionId - The ID of the version to generate notes for
   * @returns The generated notes
   */
  public async generateNotes(versionId: number): Promise<string> {
    const notes = await this.noteGenerator.generateNotes(versionId);
    this.stateManager.setAiNotes(versionId, notes);
    return notes;
  }

  /**
   * Set the user notes for a version.
   *
   * @param versionId - The ID of the version to set the user notes for
   * @param notes - The user notes to set
   */
  public setUserNotes(versionId: number, notes: string): void {
    this.stateManager.setUserNotes(versionId, notes);
  }

  /**
   * Set the ai notes for a version.
   *
   * @param versionId - The ID of the version to set the ai notes for
   * @param notes - The ai notes to set
   */
  public setAiNotes(versionId: number, notes: string): void {
    this.stateManager.setAiNotes(versionId, notes);
  }

  /**
   * Add versions to the state.
   *
   * @param versions - The versions to add
   */
  public addVersions(
    versions: Array<{ id: number; context?: Record<string, any> }>,
  ): void {
    this.stateManager.addVersions(versions);
  }

  /**
   * Clear all versions from the state.
   * This removes all versions, their transcriptions, notes, etc.
   */
  public clearVersions(): void {
    this.stateManager.clearVersions();
  }
}

// Export all types and classes
export { StateManager } from "./state";
export { TranscriptionAgent } from "./transcription";
export { VexaTranscriptionAgent } from "./transcription/vexa";
export { ConnectionStatus } from "./types";
export * from "./types";
