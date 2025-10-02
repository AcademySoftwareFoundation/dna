import { State, Version, Transcription } from '../types';

type StateChangeListener = (state: State) => void;

export class StateManager {
    private state: State;
    private listeners: Set<StateChangeListener> = new Set();

    constructor(initialState?: Partial<State>) {
        this.state = {
            activeVersion: 0,
            versions: [],
            ...initialState
        };
    }



    private createNewVersion(id: number, context?: Record<string, any>): Version {
        const newVersion = {
            id: id.toString(),
            context: context || {},
            transcriptions: {},
            userNotes: "",
            aiNotes: ""
        };
        this.state.versions.push(newVersion);
        return newVersion;
    }
    /**
     * Sets the current version to the provided version ID.
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
     * Gets the currently active version
     */
    getActiveVersion(): Version | undefined {
        return this.state.versions.find((v: Version) => v.id === this.state.activeVersion.toString());
    }

    /**
     * Gets a specific version by ID
     */
    getVersion(id: number): Version | undefined {
        return this.state.versions.find((v: Version) => v.id === id.toString());
    }

    /**
     * Gets all versions
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

    addTranscription(transcription: Transcription): void {
        const key = `${transcription.timestampStart}-${transcription.timestampEnd}-${transcription.speaker}`;
        const version = this.getActiveVersion();
        if (version) {
            version.transcriptions[key] = transcription;
            this.notifyListeners();
        }
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: StateChangeListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of state changes
     */
    private notifyListeners(): void {
        const currentState = this.getState();
        this.listeners.forEach(listener => listener(currentState));
    }

    public setUserNotes(versionId: number, notes: string): void {
        let version = this.getVersion(versionId) || this.createNewVersion(versionId);

        version.userNotes = notes;
        this.notifyListeners();
    }

    public setAiNotes(versionId: number, notes: string): void {
        let version = this.getVersion(versionId) || this.createNewVersion(versionId);

        version.aiNotes = notes;
        this.notifyListeners();
    }
}

// Export a default instance
export const stateManager = new StateManager();
