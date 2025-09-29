import { StateManager } from "./state";
import { TranscriptionAgent } from "./transcription";
import { VexaTranscriptionAgent } from "./transcription/vexa";
import { ConnectionStatus } from "./types";

export class DNAFrontendFramework {
    private stateManager: StateManager;
    private transcriptionAgent: TranscriptionAgent;

    constructor() {
        this.stateManager = new StateManager();
        this.transcriptionAgent = new VexaTranscriptionAgent(this.stateManager);
    }

    public getStateManager(): StateManager {
        return this.stateManager;
    }


    public async joinMeeting(meetingId: string): Promise<void> {
        await this.transcriptionAgent.joinMeeting(meetingId);
    }

    public async leaveMeeting(): Promise<void> {
        await this.transcriptionAgent.leaveMeeting();
    }

    public async getConnectionStatus(): Promise<ConnectionStatus> {
        return this.transcriptionAgent.getConnectionStatus();
    }
}

// Export all types and classes
export { StateManager } from "./state";
export { TranscriptionAgent } from "./transcription";
export { VexaTranscriptionAgent } from "./transcription/vexa";
export { ConnectionStatus } from "./types";
export * from "./types";

