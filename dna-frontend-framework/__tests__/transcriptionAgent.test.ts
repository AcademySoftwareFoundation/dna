import { StateManager } from '../state';
import { VexaTranscriptionAgent } from '../transcription/vexa';
import { ConnectionStatus } from '../types';

describe('VexaTranscriptionAgent', () => {
  let stateManager: StateManager;
  let vexaAgent: VexaTranscriptionAgent;

  beforeEach(() => {
    stateManager = new StateManager();
    vexaAgent = new VexaTranscriptionAgent(stateManager);
  });

  it('should initialize with no active meeting', async () => {
    expect(vexaAgent.getCurrentMeetingId()).toBeNull();
    expect(await vexaAgent.isConnected()).toBe(false);
    expect(await vexaAgent.getConnectionStatus()).toBe(
      ConnectionStatus.DISCONNECTED
    );
  });

  it('should throw error when joining meeting without environment variables', async () => {
    // Clear environment variables
    const originalVexaUrl = process.env.VEXA_URL;
    const originalVexaApiKey = process.env.VEXA_API_KEY;

    delete process.env.VEXA_URL;
    delete process.env.VEXA_API_KEY;

    await expect(vexaAgent.joinMeeting('test-meeting')).rejects.toThrow(
      'VEXA_URL environment variable is not set'
    );

    // Restore environment variables
    if (originalVexaUrl) process.env.VEXA_URL = originalVexaUrl;
    if (originalVexaApiKey) process.env.VEXA_API_KEY = originalVexaApiKey;
  });

  it('should handle leaving meeting when not connected', async () => {
    // Should not throw an error
    await expect(vexaAgent.leaveMeeting()).resolves.not.toThrow();
  });

  it('should track meeting ID correctly', () => {
    // Simulate setting meeting ID (normally done in joinMeeting)
    (vexaAgent as any)._meetingId = 'test-meeting-123';
    expect(vexaAgent.getCurrentMeetingId()).toBe('test-meeting-123');
  });
});

describe('VexaTranscriptionAgent - getBotStatus', () => {
  let stateManager: StateManager;
  let vexaAgent: VexaTranscriptionAgent;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Set up environment variables BEFORE creating the agent
    process.env.VEXA_URL = 'https://api.vexa.com';
    process.env.VEXA_API_KEY = 'test-api-key';
    process.env.PLATFORM = 'google_meet';

    stateManager = new StateManager();
    vexaAgent = new VexaTranscriptionAgent(stateManager);

    // Mock fetch globally
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return active status when meeting is found and active', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'test-meeting-123';

    // Mock successful response
    const mockResponse = {
      meetings: [
        {
          id: 12,
          user_id: 5,
          platform: 'google_meet',
          native_meeting_id: 'test-meeting-123',
          status: 'active',
          bot_container_id: 'vexa-bot-12-e0f1c1d5',
          start_time: '2025-10-01T17:35:13.780434',
          end_time: null,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    // Call the private method
    const result = await (vexaAgent as any).getBotStatus();

    expect(result).toBe('active');
    expect(mockFetch).toHaveBeenCalledWith('https://api.vexa.com/meetings', {
      method: 'GET',
      headers: {
        'X-API-Key': 'test-api-key',
        'Content-Type': 'application/json',
      },
    });
  });

  it('should return unknown status when no matching meeting is found', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'non-existent-meeting';

    // Mock response with different meeting ID
    const mockResponse = {
      meetings: [
        {
          id: 12,
          user_id: 5,
          platform: 'google_meet',
          native_meeting_id: 'different-meeting-123',
          status: 'active',
          bot_container_id: 'vexa-bot-12-e0f1c1d5',
          start_time: '2025-10-01T17:35:13.780434',
          end_time: null,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    // Call the private method
    const result = await (vexaAgent as any).getBotStatus();

    expect(result).toBe(ConnectionStatus.UNKNOWN);
  });

  it('should return unknown status when meetings array is empty', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'test-meeting-123';

    // Mock response with empty meetings array
    const mockResponse = {
      meetings: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    // Call the private method
    const result = await (vexaAgent as any).getBotStatus();

    expect(result).toBe(ConnectionStatus.UNKNOWN);
  });

  it('should handle different meeting statuses correctly', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'test-meeting-123';

    // Mock response with different status
    const mockResponse = {
      meetings: [
        {
          id: 12,
          user_id: 5,
          platform: 'google_meet',
          native_meeting_id: 'test-meeting-123',
          status: 'joining',
          bot_container_id: 'vexa-bot-12-e0f1c1d5',
          start_time: '2025-10-01T17:35:13.780434',
          end_time: null,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    // Call the private method
    const result = await (vexaAgent as any).getBotStatus();

    expect(result).toBe('joining');
  });

  it('should handle fetch errors gracefully', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'test-meeting-123';

    // Mock fetch to throw an error
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // Call the private method and expect it to throw
    await expect((vexaAgent as any).getBotStatus()).rejects.toThrow(
      'Network error'
    );
  });

  it('should handle malformed JSON response', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'test-meeting-123';

    // Mock response with invalid JSON
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('invalid json'),
    } as Response);

    // Call the private method and expect it to throw
    await expect((vexaAgent as any).getBotStatus()).rejects.toThrow();
  });
});
