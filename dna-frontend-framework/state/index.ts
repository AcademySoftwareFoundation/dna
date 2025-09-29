import { State, Version, Transcription } from '../types';

export class StateManager {
    private state: State;

    constructor(initialState?: Partial<State>) {
        this.state = {
            activeVersion: 0,
            versions: [],
            ...initialState
        };
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
        let version = this.state.versions.find((v: Version) => v.id === versionId);
        
        if (!version) {
            // Create new version if it doesn't exist
            version = {
                id: versionId,
                context: context || {},
                transcriptions: []
            };
            this.state.versions.push(version);
        } else if (context) {
            // Update context if provided
            version.context = { ...version.context, ...context };
        }
        
        // Set as active version
        this.state.activeVersion = id;
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
}

// Export a default instance
export const stateManager = new StateManager();
