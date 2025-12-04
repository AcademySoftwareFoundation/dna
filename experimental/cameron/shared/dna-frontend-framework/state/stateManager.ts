import { State, Version, Transcription } from "../types";

type StateChangeListener = (state: State) => void;

/**
 * StateManager class for managing the state of the framework.
 *
 * The state manager is responsable to storing transcripts, versions, user notes, and ai notes.
 * It also allows for subscribing to state changes and notifying listeners of state changes.
 */
export class StateManager {
  private state: State;
  private listeners: Set<StateChangeListener> = new Set();

  constructor(initialState?: Partial<State>) {
    this.state = {
      activeVersion: 0,
      versions: [],
      ...initialState,
    };
  }

  /**
   * Creates a new version object and adds it to the state.
   *
   * @param id - The version ID
   * @param context - The context of the version
   * @returns The new version object
   */
  private createNewVersion(id: number, context?: Record<string, any>): Version {
    const newVersion = {
      id: id.toString(),
      context: context || {},
      transcriptions: {},
      userNotes: "",
      aiNotes: "",
    };
    this.state.versions.push(newVersion);
    return newVersion;
  }
  /**
   * Sets the current version to the provided version ID.
   *
   * When set, transcriptions will automatically be added to the active version.
   *
   * If the version doesn't exist, a new version object is created.
   * @param id - The version ID (will be converted to string for internal storage)
   * @param context - Optional context object to store with the version
   */
  setVersion(id: number, context?: Record<string, any>): void {
    const versionId = id.toString();

    // Find existing version
    let version = this.getVersion(id);

    if (!version) {
      version = this.createNewVersion(id, context);
    } else if (context) {
      // Update context if provided
      version.context = { ...version.context, ...context };
    }

    // Set as active version
    this.state.activeVersion = id;

    // Notify listeners of state change
    this.notifyListeners();
  }

  /**
   * Gets the current state
   */
  getState(): State {
    return { ...this.state };
  }

  /**
   * Gets the currently active version.
   *
   * @returns The active version or undefined if no version is active
   */
  getActiveVersion(): Version | undefined {
    return this.state.versions.find(
      (v: Version) => v.id === this.state.activeVersion.toString(),
    );
  }

  /**
   * Gets a specific version by ID
   *
   * @param id - The version ID
   * @returns The version or undefined if no version is found
   */
  getVersion(id: number): Version | undefined {
    return this.state.versions.find((v: Version) => v.id === id.toString());
  }

  /**
   * Gets all versions.
   *
   * @returns All versions
   */
  getVersions(): Version[] {
    return [...this.state.versions];
  }

  /**
   * Gets the active version ID
   */
  getActiveVersionId(): number {
    return this.state.activeVersion;
  }

  /**
   * Adds a transcription to the active version.
   *
   * @param transcription - The transcription to add
   */
  addTranscription(transcription: Transcription): void {
    const key = `${transcription.timestampStart}-${transcription.speaker}`;
    const version = this.getActiveVersion();
    if (version) {
      version.transcriptions[key] = transcription;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to state changes.
   *
   * @param listener - The listener to subscribe to
   * @returns A function to unsubscribe from the listener
   */
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state changes.
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => listener(currentState));
  }
  /**
   * Sets the user notes for a specific version.
   *
   * @param versionId - The version ID
   * @param notes - The user notes to set
   */
  public setUserNotes(versionId: number, notes: string): void {
    let version =
      this.getVersion(versionId) || this.createNewVersion(versionId);

    version.userNotes = notes;
    this.notifyListeners();
  }

  /**
   * Sets the ai notes for a specific version.
   *
   * @param versionId - The version ID
   * @param notes - The ai notes to set
   */
  public setAiNotes(versionId: number, notes: string): void {
    let version =
      this.getVersion(versionId) || this.createNewVersion(versionId);

    version.aiNotes = notes;
    this.notifyListeners();
  }

  /**
   * Adds multiple versions to the state
   *
   * @param versions - Array of version data to add
   */
  public addVersions(
    versions: Array<{ id: number; context?: Record<string, any> }>,
  ): void {
    versions.forEach(({ id, context }) => {
      if (!this.getVersion(id)) {
        this.createNewVersion(id, context);
      }
    });
    this.notifyListeners();
  }

  /**
   * Clears all versions from the state.
   * This removes all versions, their transcriptions, notes, etc.
   */
  public clearVersions(): void {
    this.state.versions = [];
    this.state.activeVersion = 0;
    this.notifyListeners();
  }
}

// Export a default instance of the StateManager
export const stateManager = new StateManager();
