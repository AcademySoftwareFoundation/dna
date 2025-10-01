import { StateManager } from "../../state";
import { TranscriptionAgent } from "../index";
import { ConnectionStatus } from "../../types";

export class VexaTranscriptionAgent extends TranscriptionAgent {
    private _baseUrl: string | undefined;
    private _apiKey: string | undefined;
    private _meetingId: string | null = null;
    private _platform: string | undefined;
    private _botId: string | null = null;
    
    constructor(stateManager: StateManager) {
        super(stateManager);

        this._baseUrl = process.env.VEXA_URL;
        this._apiKey = process.env.VEXA_API_KEY;
        this._platform = process.env.PLATFORM;
    }

    public async joinMeeting(meetingId: string): Promise<void> {
        if (!this._baseUrl) {
            throw new Error("VEXA_URL environment variable is not set");
        }

        if (!this._apiKey) {
            throw new Error("VEXA_API_KEY environment variable is not set");
        }

        this._meetingId = meetingId;

        // Request a bot from the Vexa API
        console.log("Requesting bot from the Vexa API");
        const bot = await this.requestBot(meetingId);
        console.log("Bot request completed:", bot);
    }

    public async leaveMeeting(): Promise<void> {
        if (!this._meetingId) {
            console.log("No active meeting to leave");
            return;
        }

        console.log(`Left meeting: ${this._meetingId}`);
        this._meetingId = null;
        this._botId = null;
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
        return this._meetingId !== null;
    }

    /**
     * Get the current bot ID
     */
    public getBotId(): string | null {
        return this._botId;
    }

    /**
     * Get connection status
     */
    public async getConnectionStatus(): Promise<ConnectionStatus> {
        if (!this._meetingId) {
            return ConnectionStatus.DISCONNECTED;
        }
        return ConnectionStatus.CONNECTED;
    }

    private async requestBot(meetingId: string): Promise<void> {
        const payload = {
            "platform": this._platform,
            "native_meeting_id": meetingId,
            "bot_name": "DNA-Frontend-Framework",
        }

        const url = `${this._baseUrl}/bots`;
        console.log(`Making request to: ${url}`);
        console.log(`Payload:`, JSON.stringify(payload, null, 2));
        console.log(`Headers:`, {
            'X-API-Key': `${this._apiKey}`,
            'Content-Type': 'application/json'
        });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-API-Key': `${this._apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP Error ${response.status}: ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const responseData = await response.text();
            const botData = JSON.parse(responseData);
            
            // Store the bot ID
            if (botData && botData.id) {
                this._botId = botData.id;
                console.log(`🤖 Bot created with ID: ${this._botId}`);
            } else {
                console.warn('⚠️ No bot ID received in response');
            }
            
            return botData;
        } catch (error) {
            console.error('Detailed fetch error:');
            console.error('- Error type:', error instanceof Error ? error.constructor.name : typeof error);
            console.error('- Error message:', error instanceof Error ? error.message : String(error));
            console.error('- Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            
            if (error instanceof Error && 'code' in error) {
                console.error('- Error code:', (error as any).code);
            }
            
            if (error instanceof Error && 'cause' in error) {
                console.error('- Error cause:', (error as any).cause);
            }
            
            throw error;
        }
    }
}