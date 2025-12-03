import { StateManager } from "../../state";
import { TranscriptionAgent } from "../index";
import { Configuration, ConnectionStatus, Transcription } from "../../types";
import { WebSocketEvent } from "./types";

export class VexaTranscriptionAgent extends TranscriptionAgent {
  // Base URL + API for the Vexa API Gateway
  private _baseUrl: string | undefined;
  private _apiKey: string | undefined;

  // Information about the meeting the bot will be joining
  private _meetingId: string | null = null;
  private _platform: string | undefined;

  // Information about the bot
  private _botId: string | null = null;

  // WebSocket for the transcription service
  private _ws: WebSocket | null = null;
  private _wsUrl: string | undefined;

  // Call back that a frontend application to use to receive transcriptions
  // or trigger other actions when a transcription is received
  private _callback?: (transcript: Transcription) => void;

  // State manager for the transcription agent
  private _stateManager: StateManager;

  // Track which transcription segments have already been processed globally
  // This prevents duplicate transcripts when Vexa sends historical segments
  private _processedTranscriptKeys: Set<string> = new Set();

  /**
   * Constructor for the VexaTranscriptionAgent
   *
   * @param stateManager - The state manager to use
   * @param configuration - The configuration to use
   */
  constructor(stateManager: StateManager, configuration: Configuration) {
    super(stateManager);

    this._baseUrl = configuration.vexaUrl;
    this._apiKey = configuration.vexaApiKey;
    this._platform = configuration.platform;

    this._callback = undefined;
    this._setupWebSocketUrl();
    this._stateManager = stateManager;
  }

  /**
   * Given the provided meeting ID, join the meeting and subscribe to the transcription service.
   *
   * This will check to see if there is a bot already in the meeting, if not it will request a bot from the Vexa API.
   * It will then connect to the WebSocket for the transcription service and subscribe to the meeting.
   *
   * @param meetingId  - The ID of the meeting to join
   * @param callback  - A optional callback function to receive transcriptions
   */
  public async joinMeeting(
    meetingId: string,
    callback?: (transcript: Transcription) => void,
  ): Promise<void> {
    if (!this._baseUrl) {
      throw new Error("VEXA_URL environment variable is not set");
    }

    if (!this._apiKey) {
      throw new Error("VEXA_API_KEY environment variable is not set");
    }

    this._meetingId = meetingId;
    this._callback = callback;

    // Check if the bot already exists
    const bot = await this._getBotInfo();
    if (bot && bot.status !== "completed") {
      console.log("Bot already exists:", bot);
    } else {
      // Request a bot from the Vexa API
      console.log("Requesting bot from the Vexa API");
      const bot = await this.requestBot(meetingId);
      console.log("Bot request completed:", bot);
    }

    // Connect to WebSocket for real-time transcription
    await this._connectWebSocket();
  }

  public async leaveMeeting(): Promise<void> {
    if (!this._meetingId) {
      return;
    }

    // Disconnect WebSocket first
    this._disconnectWebSocket();

    const response = await fetch(
      `${this._baseUrl}/bots/${this._platform}/${this._meetingId}`,
      {
        method: "DELETE",
        headers: {
          "X-API-Key": `${this._apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(`HTTP Error ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    this._meetingId = null;
    this._botId = null;
  }

  /**
   * Get the current meeting ID.
   */
  public getCurrentMeetingId(): string | null {
    return this._meetingId;
  }

  /**
   * Check if the transcription agent is connected to the meeting.
   *
   * This is done via the Vexa api gateway.
   */
  public async isConnected(): Promise<boolean> {
    return (
      this._meetingId !== null &&
      (await this.getConnectionStatus()) === ConnectionStatus.CONNECTED
    );
  }

  /**
   * Access the ID of the bot.
   *
   */
  public getBotId(): string | null {
    return this._botId;
  }

  /**
   * Setup the WebSocket URL for the transcription service.
   *
   * This is based on the VEXA_URL environment variable.
   */
  private _setupWebSocketUrl(): void {
    if (!this._baseUrl) return;

    // Convert HTTP/HTTPS URL to WebSocket URL
    if (this._baseUrl.startsWith("https://")) {
      this._wsUrl = this._baseUrl.replace("https://", "wss://") + "/ws";
    } else if (this._baseUrl.startsWith("http://")) {
      this._wsUrl = this._baseUrl.replace("http://", "ws://") + "/ws";
    } else {
      this._wsUrl = "wss://devapi.dev.vexa.ai/ws";
    }
  }

  /**
   * Get the information about the bot in the meeting.
   *
   * This is done via the Vexa api gateway.
   */
  private async _getBotInfo(): Promise<Record<string, any> | null> {
    if (!this._meetingId) {
      return null;
    }
    const url = `${this._baseUrl}/meetings`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": `${this._apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const responseData = await response.text();
    const meetingData = JSON.parse(responseData);
    // TODO: We currently need to iterate over all the meetings to find the one that matches the meeting ID.
    // This is not efficient and we should update vexa to return the meeting info directly.
    for (const meeting of meetingData.meetings) {
      if (meeting.native_meeting_id === this._meetingId) {
        return meeting;
      }
    }
    return null;
  }

  /**
   * Get the connection status of the transcription agent.
   *
   * This is done via the Vexa api gateway.
   */
  public async getConnectionStatus(): Promise<ConnectionStatus> {
    if (!this._meetingId) {
      return ConnectionStatus.DISCONNECTED;
    }

    const vexaStatusMap = {
      active: ConnectionStatus.CONNECTED,
      joining: ConnectionStatus.CONNECTING,
      error: ConnectionStatus.ERROR,
      closed: ConnectionStatus.CLOSED,
      unknown: ConnectionStatus.UNKNOWN,
      disconnected: ConnectionStatus.DISCONNECTED,
      requested: ConnectionStatus.CONNECTING,
      awaiting_admission: ConnectionStatus.CONNECTING,
    };

    const botInfo = await this._getBotInfo();
    if (botInfo) {
      try {
        return vexaStatusMap[
          botInfo.status.toLowerCase() as keyof typeof vexaStatusMap
        ];
      } catch (error) {
        console.error(
          "Error getting connection status for:",
          botInfo.status.toLowerCase(),
        );
        return ConnectionStatus.UNKNOWN;
      }
    } else {
      return ConnectionStatus.UNKNOWN;
    }
  }

  /**
   * Request a bot from the Vexa api gateway.
   *
   * This will spin up a new docker container with a bot to join the meet.
   */
  private async requestBot(meetingId: string): Promise<void> {
    const payload = {
      platform: this._platform,
      native_meeting_id: meetingId,
      bot_name: "DNA-Frontend-Framework",
    };

    const url = `${this._baseUrl}/bots`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-Key": `${this._apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
      }

      return botData;
    } catch (error) {
      console.error("Detailed fetch error:");
      console.error(
        "- Error type:",
        error instanceof Error ? error.constructor.name : typeof error,
      );
      console.error(
        "- Error message:",
        error instanceof Error ? error.message : String(error),
      );
      console.error(
        "- Error stack:",
        error instanceof Error ? error.stack : "No stack trace",
      );

      if (error instanceof Error && "code" in error) {
        console.error("- Error code:", (error as any).code);
      }

      if (error instanceof Error && "cause" in error) {
        console.error("- Error cause:", (error as any).cause);
      }

      throw error;
    }
  }

  /**
   * Connect to the WebSocket for the transcription service.
   *
   * This will subscribe to the meeting and start receiving transcriptions.
   */
  private async _connectWebSocket(): Promise<void> {
    if (!this._wsUrl || !this._apiKey) {
      console.error("WebSocket URL or API key not available");
      return;
    }

    if (this._ws?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }

    const wsUrl = `${this._wsUrl}?api_key=${encodeURIComponent(this._apiKey)}`;

    return new Promise((resolve, reject) => {
      try {
        this._ws = new WebSocket(wsUrl);

        this._ws.onopen = () => {
          console.log("✅ [WEBSOCKET] Connected to Vexa transcription service");
          this._subscribeToMeeting();
          resolve();
        };

        this._ws.onmessage = (event) => {
          try {
            const data: WebSocketEvent = JSON.parse(event.data);
            this._handleWebSocketMessage(data);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        this._ws.onclose = (event) => {
          console.log("❌ [WEBSOCKET] Disconnected with code:", event.code);
        };

        this._ws.onerror = (error) => {
          console.error("🔴 [WEBSOCKET] Connection error:", error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private _disconnectWebSocket(): void {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  /**
   * Subscribe to the meeting.
   *
   * This will subscribe to the meeting and start receiving transcriptions.
   */
  private async _subscribeToMeeting(): Promise<void> {
    if (
      !this._ws ||
      this._ws.readyState !== WebSocket.OPEN ||
      !this._meetingId ||
      !this._platform
    ) {
      console.error(
        "Cannot subscribe: WebSocket not ready or missing meeting info",
      );
      return;
    }

    const message = {
      action: "subscribe",
      meetings: [
        {
          platform: this._platform,
          native_id: this._meetingId,
          native_meeting_id: this._meetingId,
        },
      ],
    };

    console.log("🔌 [WEBSOCKET] Subscribing to meeting:", message);
    this._ws.send(JSON.stringify(message));
  }

  /**
   * Callback for when a transcription is received.
   *
   * Update the state manager with the new transcription segment and
   * call the callback function if it is set.
   */
  private async onTranscriptCallback(transcript: Transcription): Promise<void> {
    if (this._callback) {
      this._callback(transcript);
    }
    this._stateManager.addTranscription(transcript);
    const state = this._stateManager.getState();
  }

  /**
   * Handle the WebSocket message.
   *
   * @param data - The WebSocket event data
   */
  private _handleWebSocketMessage(data: WebSocketEvent): void {
    switch (data.type) {
      case "transcript.mutable":
      case "transcript.finalized":
        // Handle both single segment and segments array
        const segments =
          data.payload.segments ||
          (data.payload.segment ? [data.payload.segment] : []);

        for (const segment of segments) {
          try {
            const transcript: Transcription = {
              text: segment.text || "",
              timestampStart:
                segment.absolute_start_time || new Date().toISOString(),
              timestampEnd:
                segment.absolute_end_time || new Date().toISOString(),
              speaker: segment.speaker || "Unknown",
            };

            // Create a unique key for this transcript segment
            const transcriptKey = `${transcript.timestampStart}-${transcript.speaker}-${transcript.text}`;

            // Skip if we've already processed this segment (prevents historical replay duplication)
            if (this._processedTranscriptKeys.has(transcriptKey)) {
              continue;
            }

            // Mark this segment as processed
            this._processedTranscriptKeys.add(transcriptKey);

            this.onTranscriptCallback(transcript);
          } catch (error) {
            console.error(
              "❌ [WEBSOCKET] Error creating transcript from segment:",
              error,
            );
            console.error("❌ [WEBSOCKET] Segment data:", segment);
          }
        }
        break;

      case "meeting.status":
        console.log("🟡 [WEBSOCKET] Processing meeting.status event");
        console.log("🟡 [WEBSOCKET] Status:", data.payload?.status);
        break;

      case "error":
        console.log("🔴 [WEBSOCKET] Processing error event");
        console.log("🔴 [WEBSOCKET] Error:", data.error);
        break;

      case "subscribed":
        console.log(
          "🔌 [WEBSOCKET] Subscription confirmed for meetings:",
          (data as any).meetings,
        );
        break;

      case "unsubscribed":
        console.log(
          "🔌 [WEBSOCKET] Unsubscription confirmed for meetings:",
          (data as any).meetings,
        );
        break;

      default:
        console.log("❓ [WEBSOCKET] Unknown event type:", data.type);
        console.log("❓ [WEBSOCKET] Full data:", data);
    }
  }
}
