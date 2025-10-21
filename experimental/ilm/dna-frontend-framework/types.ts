export interface State {
    activeVersion: number;
    versions: Version[];
}

export interface Version {
    id: string;
    context: Record<string, any>;
    transcriptions: Record<string, Transcription>;
    userNotes: string;
    aiNotes: string;
}

export interface Transcription {
    text: string;
    timestampStart: string;
    timestampEnd: string;
    speaker: string;
}

export enum ConnectionStatus {
    CONNECTING = "connecting",
    CONNECTED = "connected",
    DISCONNECTED = "disconnected",
    ERROR = "error",
    CLOSED = "closed",
    UNKNOWN = "unknown",
}

export interface Configuration {
    vexaUrl: string;
    vexaApiKey: string;
    platform: string;
    llmInterface: "openai" | "litellm";
    llmModel: string;
    llmApiKey: string;
    llmBaseURL: string;
}