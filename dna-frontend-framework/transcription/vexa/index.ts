import { StateManager } from "../../state";
import { TranscriptionAgent } from "../index";
import { ConnectionStatus } from "../../types";
import WebSocket from 'ws';

export class VexaTranscriptionAgent extends TranscriptionAgent {
    private _baseUrl: string | undefined;
    private _apiKey: string | undefined;
    private _websocket: WebSocket | null = null;
    private _meetingId: string | null = null;
    
    constructor(stateManager: StateManager) {
        super(stateManager);

        this._baseUrl = process.env.VEXA_URL;
        this._apiKey = process.env.VEXA_API_KEY;
    }

    public async joinMeeting(meetingId: string): Promise<void> {
        if (!this._baseUrl) {
            throw new Error("VEXA_URL environment variable is not set");
        }

        if (!this._apiKey) {
            throw new Error("VEXA_API_KEY environment variable is not set");
        }

        if (this._websocket && this._websocket.readyState === WebSocket.OPEN) {
            console.log("Already connected to a meeting. Please leave the current meeting first.");
            return;
        }

        this._meetingId = meetingId;



        // Request a bot from the Vexa API
        const bot = await this.requestBot(meetingId);
        
        try {
            // Construct WebSocket URL - assuming the pattern is /meetings/{meetingId}/ws
            const wsUrl = `${this._baseUrl}/meetings/${meetingId}/ws`;
            
            // Create WebSocket connection with authentication header
            this._websocket = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${this._apiKey}`,
                    'User-Agent': 'DNA-Frontend-Framework/1.0.0'
                }
            });

            // Set up event handlers
            this._websocket.on('open', () => {
                console.log(`Successfully joined meeting: ${meetingId}`);
            });

            this._websocket.on('message', (data: WebSocket.Data) => {
                this.handleWebsocketMessage(data);
            });

            this._websocket.on('error', (error: Error) => {
                console.error(`WebSocket error for meeting ${meetingId}:`, error);
            });

            this._websocket.on('close', (code: number, reason: Buffer) => {
                console.log(`WebSocket connection closed for meeting ${meetingId}. Code: ${code}, Reason: ${reason.toString()}`);
                this._websocket = null;
                this._meetingId = null;
            });

        } catch (error) {
            console.error(`Failed to join meeting ${meetingId}:`, error);
            throw error;
        }
    }

    public async leaveMeeting(): Promise<void> {
        if (!this._websocket) {
            console.log("No active meeting to leave");
            return;
        }

        if (this._websocket.readyState === WebSocket.OPEN) {
            this._websocket.close(1000, 'User requested disconnect');
            console.log(`Left meeting: ${this._meetingId}`);
        } else {
            console.log("WebSocket connection is not open");
        }

        this._websocket = null;
        this._meetingId = null;
    }

    private async handleWebsocketMessage(data: WebSocket.Data): Promise<void> {
        try {
            // Parse the incoming data as JSON
            const event = JSON.parse(data.toString());
            
            // Print the event to console
            console.log("=== Vexa WebSocket Event ===");
            console.log(JSON.stringify(event, null, 2));
            console.log("===========================");
            
            // You could add additional processing here if needed
            // For example, updating the state manager with transcription data
            
        } catch (error) {
            console.error("Error parsing WebSocket event:", error);
            console.log("Raw data received:", data.toString());
        }
    }

    /**
     * Get the current meeting ID
     */
    public getCurrentMeetingId(): string | null {
        return this._meetingId;
    }

    /**
     * Check if currently connected to a meeting
     */
    public isConnected(): boolean {
        return this._websocket !== null && this._websocket.readyState === WebSocket.OPEN;
    }

    /**
     * Get connection status
     */
    public async getConnectionStatus(): Promise<ConnectionStatus> {
        if (!this._websocket) {
            return ConnectionStatus.DISCONNECTED;
        }
        
        switch (this._websocket.readyState) {
            case WebSocket.CONNECTING:
                return ConnectionStatus.CONNECTING;
            case WebSocket.OPEN:
                return ConnectionStatus.CONNECTED;
            case WebSocket.CLOSING:
                return ConnectionStatus.CLOSED;
            case WebSocket.CLOSED:
                return ConnectionStatus.CLOSED;
            default:
                return ConnectionStatus.UNKNOWN;
        }
    }

    private async requestBot(meetingId: string): Promise<void> {
        const payload = {
            "platform": "meet",
            "native_meeting_id": meetingId,
            "bot_name": "DNA-Frontend-Framework",
        }

        const response = await fetch(`${this._baseUrl}/bots`, {
            method: 'POST',
            headers: {
                'X-API-Key': `${this._apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        console.log(response);
    }
}