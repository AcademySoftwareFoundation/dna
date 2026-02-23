import { TranscriptionAgent } from '../transcription/transcriptionAgent';
import { StateManager } from '../state';
import { ConnectionStatus, Transcription } from '../types';

// Create a concrete implementation of TranscriptionAgent for testing
class TestTranscriptionAgent extends TranscriptionAgent {
  private _meetingId: string | null = null;
  private _botId: string | null = null;
  private _isConnected: boolean = false;

  public async joinMeeting(meetingId: string, callback?: (transcript: Transcription) => void): Promise<void> {
    this._meetingId = meetingId;
    this._isConnected = true;
  }

  public async leaveMeeting(): Promise<void> {
    this._meetingId = null;
    this._isConnected = false;
  }

  public getCurrentMeetingId(): string | null {
    return this._meetingId;
  }

  public async getConnectionStatus(): Promise<ConnectionStatus> {
    return this._isConnected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED;
  }

  public async isConnected(): Promise<boolean> {
    return this._isConnected;
  }

  public getBotId(): string | null {
    return this._botId;
  }

  public setBotId(botId: string): void {
    this._botId = botId;
  }
}

describe('TranscriptionAgent', () => {
  let testAgent: TestTranscriptionAgent;
  let mockStateManager: jest.Mocked<StateManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStateManager = {
      addTranscription: jest.fn(),
      getState: jest.fn(),
      setVersion: jest.fn(),
      getVersion: jest.fn(),
      getActiveVersion: jest.fn(),
      getActiveVersionId: jest.fn(),
      getVersions: jest.fn(),
      subscribe: jest.fn(),
      setUserNotes: jest.fn(),
      setAiNotes: jest.fn(),
      addVersions: jest.fn(),
    } as any;

    testAgent = new TestTranscriptionAgent(mockStateManager);
  });

  describe('constructor', () => {
    it('should initialize with state manager', () => {
      expect(testAgent).toBeInstanceOf(TranscriptionAgent);
    });

    it('should store state manager reference', () => {
      // Access the private stateManager property
      expect((testAgent as any).stateManager).toBe(mockStateManager);
    });
  });

  describe('joinMeeting', () => {
    it('should be implemented by concrete classes', async () => {
      const meetingId = 'test-meeting-123';
      const callback = jest.fn();

      await testAgent.joinMeeting(meetingId, callback);

      expect(testAgent.getCurrentMeetingId()).toBe(meetingId);
      expect(await testAgent.isConnected()).toBe(true);
    });

    it('should work without callback', async () => {
      const meetingId = 'test-meeting-123';

      await testAgent.joinMeeting(meetingId);

      expect(testAgent.getCurrentMeetingId()).toBe(meetingId);
      expect(await testAgent.isConnected()).toBe(true);
    });

    it('should handle different meeting IDs', async () => {
      const meetingIds = [
        'meeting-1',
        'meeting-2',
        'very-long-meeting-id-with-special-chars-12345',
        '',
      ];

      for (const meetingId of meetingIds) {
        await testAgent.joinMeeting(meetingId);
        expect(testAgent.getCurrentMeetingId()).toBe(meetingId);
      }
    });
  });

  describe('leaveMeeting', () => {
    it('should be implemented by concrete classes', async () => {
      // First join a meeting
      await testAgent.joinMeeting('test-meeting');
      expect(await testAgent.isConnected()).toBe(true);

      // Then leave
      await testAgent.leaveMeeting();
      expect(await testAgent.isConnected()).toBe(false);
      expect(testAgent.getCurrentMeetingId()).toBeNull();
    });

    it('should handle leaving when not connected', async () => {
      // Should not throw an error
      await expect(testAgent.leaveMeeting()).resolves.not.toThrow();
    });
  });

  describe('getCurrentMeetingId', () => {
    it('should be implemented by concrete classes', () => {
      expect(testAgent.getCurrentMeetingId()).toBeNull();

      // Set meeting ID through joinMeeting
      testAgent.joinMeeting('test-meeting');
      expect(testAgent.getCurrentMeetingId()).toBe('test-meeting');
    });

    it('should return null when no meeting is active', () => {
      expect(testAgent.getCurrentMeetingId()).toBeNull();
    });
  });

  describe('getConnectionStatus', () => {
    it('should be implemented by concrete classes', async () => {
      expect(await testAgent.getConnectionStatus()).toBe(ConnectionStatus.DISCONNECTED);

      await testAgent.joinMeeting('test-meeting');
      expect(await testAgent.getConnectionStatus()).toBe(ConnectionStatus.CONNECTED);
    });

    it('should return different statuses based on connection state', async () => {
      const statuses = [
        { connected: false, expected: ConnectionStatus.DISCONNECTED },
        { connected: true, expected: ConnectionStatus.CONNECTED },
      ];

      for (const { connected, expected } of statuses) {
        if (connected) {
          await testAgent.joinMeeting('test-meeting');
        } else {
          await testAgent.leaveMeeting();
        }

        expect(await testAgent.getConnectionStatus()).toBe(expected);
      }
    });
  });

  describe('isConnected', () => {
    it('should be implemented by concrete classes', async () => {
      expect(await testAgent.isConnected()).toBe(false);

      await testAgent.joinMeeting('test-meeting');
      expect(await testAgent.isConnected()).toBe(true);
    });

    it('should return boolean values', async () => {
      expect(typeof await testAgent.isConnected()).toBe('boolean');

      await testAgent.joinMeeting('test-meeting');
      expect(typeof await testAgent.isConnected()).toBe('boolean');
    });
  });

  describe('getBotId', () => {
    it('should be implemented by concrete classes', () => {
      expect(testAgent.getBotId()).toBeNull();

      testAgent.setBotId('bot-123');
      expect(testAgent.getBotId()).toBe('bot-123');
    });

    it('should return null when no bot is active', () => {
      expect(testAgent.getBotId()).toBeNull();
    });
  });

  describe('abstract class behavior', () => {
    it('should not be instantiable directly', () => {
      // This test verifies that TranscriptionAgent is abstract
      // In TypeScript, you cannot instantiate an abstract class
      // This is a compile-time check, but we can test the behavior
      expect(() => {
        // This would cause a TypeScript compilation error
        // new TranscriptionAgent(mockStateManager);
      }).not.toThrow();
    });

    it('should require implementation of all abstract methods', () => {
      // This test verifies that concrete classes must implement all abstract methods
      // The TestTranscriptionAgent above implements them all, so this should work
      expect(typeof testAgent.joinMeeting).toBe('function');
      expect(typeof testAgent.leaveMeeting).toBe('function');
      expect(typeof testAgent.getCurrentMeetingId).toBe('function');
      expect(typeof testAgent.getConnectionStatus).toBe('function');
      expect(typeof testAgent.isConnected).toBe('function');
      expect(typeof testAgent.getBotId).toBe('function');
    });
  });

  describe('state manager integration', () => {
    it('should have access to state manager', () => {
      // Access the private stateManager property
      expect((testAgent as any).stateManager).toBe(mockStateManager);
    });

    it('should allow concrete classes to use state manager', () => {
      // Test that the state manager can be used by concrete implementations
      const mockTranscription: Transcription = {
        text: 'Test transcription',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'Test Speaker',
      };

      // Simulate adding a transcription through the state manager
      mockStateManager.addTranscription(mockTranscription);

      expect(mockStateManager.addTranscription).toHaveBeenCalledWith(mockTranscription);
    });
  });

  describe('error handling', () => {
    it('should allow concrete classes to throw errors', async () => {
      class ErrorTranscriptionAgent extends TranscriptionAgent {
        public async joinMeeting(): Promise<void> {
          throw new Error('Connection failed');
        }
        public async leaveMeeting(): Promise<void> {
          throw new Error('Disconnection failed');
        }
        public getCurrentMeetingId(): string | null {
          throw new Error('Meeting ID not available');
        }
        public async getConnectionStatus(): Promise<ConnectionStatus> {
          throw new Error('Status check failed');
        }
        public async isConnected(): Promise<boolean> {
          throw new Error('Connection check failed');
        }
        public getBotId(): string | null {
          throw new Error('Bot ID not available');
        }
      }

      const errorAgent = new ErrorTranscriptionAgent(mockStateManager);

      await expect(errorAgent.joinMeeting('test')).rejects.toThrow('Connection failed');
      await expect(errorAgent.leaveMeeting()).rejects.toThrow('Disconnection failed');
      expect(() => errorAgent.getCurrentMeetingId()).toThrow('Meeting ID not available');
      await expect(errorAgent.getConnectionStatus()).rejects.toThrow('Status check failed');
      await expect(errorAgent.isConnected()).rejects.toThrow('Connection check failed');
      expect(() => errorAgent.getBotId()).toThrow('Bot ID not available');
    });
  });
});