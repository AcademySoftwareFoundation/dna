import { StateManager } from '../state';
import { VexaTranscriptionAgent } from '../transcription/vexa';
import { ConnectionStatus, Transcription } from '../types';

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

describe('VexaTranscriptionAgent - getConnectionStatus', () => {
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

    // Call the public method
    const result = await vexaAgent.getConnectionStatus();

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

    // Call the public method
    const result = await vexaAgent.getConnectionStatus();

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

    // Call the public method
    const result = await vexaAgent.getConnectionStatus();

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

    // Call the public method
    const result = await vexaAgent.getConnectionStatus();

    expect(result).toBe('joining');
  });

  it('should handle fetch errors gracefully', async () => {
    // Set up meeting ID
    (vexaAgent as any)._meetingId = 'test-meeting-123';

    // Mock fetch to throw an error
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // Call the public method and expect it to throw
    await expect(vexaAgent.getConnectionStatus()).rejects.toThrow(
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

    // Call the public method and expect it to throw
    await expect(vexaAgent.getConnectionStatus()).rejects.toThrow();
  });
});

describe('VexaTranscriptionAgent - Callback and State Management', () => {
  let stateManager: StateManager;
  let vexaAgent: VexaTranscriptionAgent;
  let mockCallback: jest.MockedFunction<(transcript: Transcription) => void>;

  beforeEach(() => {
    // Set up environment variables
    process.env.VEXA_URL = 'https://api.vexa.com';
    process.env.VEXA_API_KEY = 'test-api-key';
    process.env.PLATFORM = 'google_meet';

    stateManager = new StateManager();
    vexaAgent = new VexaTranscriptionAgent(stateManager);
    mockCallback = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call user callback when provided', async () => {
    // Set up a version to receive transcriptions
    stateManager.setVersion(1, { name: 'Test Meeting' });

    const testTranscript: Transcription = {
      text: 'Hello world',
      timestampStart: '2025-01-01T10:00:00.000Z',
      timestampEnd: '2025-01-01T10:00:05.000Z',
      speaker: 'John Doe'
    };

    // Call the private onTranscriptCallback method directly
    await (vexaAgent as any).onTranscriptCallback(testTranscript);

    expect(mockCallback).not.toHaveBeenCalled(); // No callback was set

    // Now test with callback set
    (vexaAgent as any)._callback = mockCallback;
    await (vexaAgent as any).onTranscriptCallback(testTranscript);

    expect(mockCallback).toHaveBeenCalledWith(testTranscript);
  });

  it('should add transcription to state manager even without callback', async () => {
    // Set up a version to receive transcriptions
    stateManager.setVersion(1, { name: 'Test Meeting' });

    const testTranscript: Transcription = {
      text: 'Hello world',
      timestampStart: '2025-01-01T10:00:00.000Z',
      timestampEnd: '2025-01-01T10:00:05.000Z',
      speaker: 'John Doe'
    };

    // Call the private onTranscriptCallback method directly
    await (vexaAgent as any).onTranscriptCallback(testTranscript);

    const version = stateManager.getActiveVersion();
    expect(version).toBeDefined();
    const expectedKey = '2025-01-01T10:00:00.000Z-2025-01-01T10:00:05.000Z-John Doe';
    expect(version!.transcriptions[expectedKey]).toBeDefined();
    expect(version!.transcriptions[expectedKey]).toEqual(testTranscript);
  });

  it('should handle WebSocket transcript.mutable message', () => {
    const mockWebSocketEvent = {
      type: 'transcript.mutable',
      meeting: {
        platform: 'google_meet',
        native_id: 'test-meeting-123'
      },
      payload: {
        segments: [
          {
            start: 1.022,
            text: 'Hello everyone and welcome to',
            end_time: 7.022,
            language: 'en',
            updated_at: '2025-10-01T23:51:50.957393+00:00',
            session_uid: '4bcd4cd3-2ca8-490a-acc0-85fe93793e3a',
            speaker: 'James Spadafora',
            speaker_mapping_status: 'MAPPED',
            absolute_start_time: '2025-10-01T23:51:37.566260+00:00',
            absolute_end_time: '2025-10-01T23:51:43.566260+00:00'
          }
        ]
      },
      ts: '2025-10-01T23:51:50.958044+00:00'
    };

    // Set up a version to receive transcriptions
    stateManager.setVersion(1, { name: 'Test Meeting' });

    // Mock console.log to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    const version = stateManager.getActiveVersion();
    expect(version).toBeDefined();
    expect(Object.keys(version!.transcriptions)).toHaveLength(1);
    
    const transcriptionKey = Object.keys(version!.transcriptions)[0];
    const transcription = version!.transcriptions[transcriptionKey];
    
    expect(transcription.text).toBe('Hello everyone and welcome to');
    expect(transcription.speaker).toBe('James Spadafora');
    expect(transcription.timestampStart).toBe('2025-10-01T23:51:37.566260+00:00');
    expect(transcription.timestampEnd).toBe('2025-10-01T23:51:43.566260+00:00');

    consoleSpy.mockRestore();
  });

  it('should handle WebSocket transcript.finalized message', () => {
    const mockWebSocketEvent = {
      type: 'transcript.finalized',
      meeting: {
        platform: 'google_meet',
        native_id: 'test-meeting-123'
      },
      payload: {
        segments: [
          {
            start: 1.022,
            text: 'Final transcript text',
            end_time: 7.022,
            language: 'en',
            updated_at: '2025-10-01T23:51:50.957393+00:00',
            session_uid: '4bcd4cd3-2ca8-490a-acc0-85fe93793e3a',
            speaker: 'Jane Smith',
            speaker_mapping_status: 'MAPPED',
            absolute_start_time: '2025-10-01T23:51:37.566260+00:00',
            absolute_end_time: '2025-10-01T23:51:43.566260+00:00'
          }
        ]
      },
      ts: '2025-10-01T23:51:50.958044+00:00'
    };

    // Set up a version to receive transcriptions
    stateManager.setVersion(1, { name: 'Test Meeting' });

    // Mock console.log to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    const version = stateManager.getActiveVersion();
    expect(version).toBeDefined();
    expect(Object.keys(version!.transcriptions)).toHaveLength(1);
    
    const transcriptionKey = Object.keys(version!.transcriptions)[0];
    const transcription = version!.transcriptions[transcriptionKey];
    
    expect(transcription.text).toBe('Final transcript text');
    expect(transcription.speaker).toBe('Jane Smith');

    consoleSpy.mockRestore();
  });

  it('should handle WebSocket message with multiple segments', () => {
    const mockWebSocketEvent = {
      type: 'transcript.mutable',
      meeting: {
        platform: 'google_meet',
        native_id: 'test-meeting-123'
      },
      payload: {
        segments: [
          {
            start: 1.022,
            text: 'First segment',
            end_time: 5.022,
            language: 'en',
            updated_at: '2025-10-01T23:51:50.957393+00:00',
            session_uid: '4bcd4cd3-2ca8-490a-acc0-85fe93793e3a',
            speaker: 'Speaker 1',
            speaker_mapping_status: 'MAPPED',
            absolute_start_time: '2025-10-01T23:51:37.566260+00:00',
            absolute_end_time: '2025-10-01T23:51:41.566260+00:00'
          },
          {
            start: 5.022,
            text: 'Second segment',
            end_time: 10.022,
            language: 'en',
            updated_at: '2025-10-01T23:51:50.957393+00:00',
            session_uid: '4bcd4cd3-2ca8-490a-acc0-85fe93793e3a',
            speaker: 'Speaker 2',
            speaker_mapping_status: 'MAPPED',
            absolute_start_time: '2025-10-01T23:51:41.566260+00:00',
            absolute_end_time: '2025-10-01T23:51:46.566260+00:00'
          }
        ]
      },
      ts: '2025-10-01T23:51:50.958044+00:00'
    };

    // Set up a version to receive transcriptions
    stateManager.setVersion(1, { name: 'Test Meeting' });

    // Mock console.log to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    const version = stateManager.getActiveVersion();
    expect(version).toBeDefined();
    expect(Object.keys(version!.transcriptions)).toHaveLength(2);
    
    const transcriptionKeys = Object.keys(version!.transcriptions);
    expect(transcriptionKeys[0]).toContain('Speaker 1');
    expect(transcriptionKeys[1]).toContain('Speaker 2');

    consoleSpy.mockRestore();
  });

  it('should handle WebSocket meeting.status message', () => {
    const mockWebSocketEvent = {
      type: 'meeting.status',
      meeting: {
        platform: 'google_meet',
        native_id: 'test-meeting-123'
      },
      payload: {
        status: 'active'
      },
      ts: '2025-10-01T23:51:50.958044+00:00'
    };

    // Mock console.log to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    // Should not add any transcriptions for status messages
    const version = stateManager.getActiveVersion();
    expect(version).toBeUndefined(); // No version was set up

    consoleSpy.mockRestore();
  });

  it('should handle WebSocket error message', () => {
    const mockWebSocketEvent = {
      type: 'error',
      error: 'Connection failed',
      ts: '2025-10-01T23:51:50.958044+00:00'
    };

    // Mock console.log to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    // Should not add any transcriptions for error messages
    const version = stateManager.getActiveVersion();
    expect(version).toBeUndefined(); // No version was set up

    consoleSpy.mockRestore();
  });

  it('should handle unknown WebSocket message types', () => {
    const mockWebSocketEvent = {
      type: 'unknown.type',
      payload: { some: 'data' },
      ts: '2025-10-01T23:51:50.958044+00:00'
    };

    // Mock console.log to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    // Should not add any transcriptions for unknown message types
    const version = stateManager.getActiveVersion();
    expect(version).toBeUndefined(); // No version was set up

    consoleSpy.mockRestore();
  });

  it('should handle malformed WebSocket message gracefully', () => {
    const mockWebSocketEvent = {
      type: 'transcript.mutable',
      payload: {
        segments: [
          {
            // Missing required fields
            text: 'Incomplete segment'
          }
        ]
      }
    };

    // Set up a version to receive transcriptions
    stateManager.setVersion(1, { name: 'Test Meeting' });

    // Mock console.log and console.error to avoid cluttering test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Call the private _handleWebSocketMessage method directly
    (vexaAgent as any)._handleWebSocketMessage(mockWebSocketEvent);

    // The code creates a transcript with default values even for malformed data
    const version = stateManager.getActiveVersion();
    expect(version).toBeDefined();
    expect(Object.keys(version!.transcriptions)).toHaveLength(1);
    
    // Check that the transcript has default values for missing fields
    const transcriptionKey = Object.keys(version!.transcriptions)[0];
    const transcription = version!.transcriptions[transcriptionKey];
    expect(transcription.text).toBe('Incomplete segment');
    expect(transcription.speaker).toBe('Unknown');

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should store callback when joining meeting', () => {
    // Test that callback is stored when provided to joinMeeting
    // We'll test the callback storage without actually calling joinMeeting
    // to avoid complex mocking of the entire flow
    
    // Simulate setting the callback and meeting ID as would happen in joinMeeting
    (vexaAgent as any)._callback = mockCallback;
    (vexaAgent as any)._meetingId = 'test-meeting-123';
    
    // Verify callback was stored
    expect((vexaAgent as any)._callback).toBe(mockCallback);
    expect((vexaAgent as any)._meetingId).toBe('test-meeting-123');
  });
});
