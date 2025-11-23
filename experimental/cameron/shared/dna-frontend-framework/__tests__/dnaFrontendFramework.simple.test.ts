import { DNAFrontendFramework } from '../index';
import { Configuration } from '../types';

// Mock fetch globally for any HTTP requests
global.fetch = jest.fn();

describe('DNAFrontendFramework - Integration Tests', () => {
  let framework: DNAFrontendFramework;
  let configuration: Configuration;

  beforeEach(() => {
    jest.clearAllMocks();

    configuration = {
      vexaUrl: 'https://api.vexa.com',
      vexaApiKey: 'test-api-key',
      platform: 'google_meet',
      llmInterface: 'openai',
      llmModel: 'gpt-4',
      llmApiKey: 'test-llm-key',
      llmBaseURL: 'https://api.openai.com/v1',
    };

    framework = new DNAFrontendFramework(configuration);
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(framework).toBeInstanceOf(DNAFrontendFramework);
    });

    it('should create instances of all required components', () => {
      expect(framework.getStateManager()).toBeDefined();
      expect(framework.getNoteGenerator()).toBeDefined();
    });
  });

  describe('getStateManager', () => {
    it('should return the state manager instance', () => {
      const stateManager = framework.getStateManager();
      expect(stateManager).toBeDefined();
      expect(typeof stateManager.setVersion).toBe('function');
      expect(typeof stateManager.getVersion).toBe('function');
      expect(typeof stateManager.addTranscription).toBe('function');
    });
  });

  describe('getNoteGenerator', () => {
    it('should return the note generator instance', () => {
      const noteGenerator = framework.getNoteGenerator();
      expect(noteGenerator).toBeDefined();
      expect(typeof noteGenerator.generateNotes).toBe('function');
    });
  });

  describe('setVersion', () => {
    it('should delegate to state manager', async () => {
      const versionId = 1;
      const context = { name: 'Test Version' };

      await framework.setVersion(versionId, context);

      const stateManager = framework.getStateManager();
      const version = stateManager.getVersion(versionId);
      expect(version).toBeDefined();
      expect(version?.context).toEqual(context);
    });

    it('should work without context', async () => {
      const versionId = 1;

      await framework.setVersion(versionId);

      const stateManager = framework.getStateManager();
      const version = stateManager.getVersion(versionId);
      expect(version).toBeDefined();
    });
  });

  describe('subscribeToStateChanges', () => {
    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = framework.subscribeToStateChanges(listener);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('setUserNotes', () => {
    it('should delegate to state manager', () => {
      const versionId = 1;
      const notes = 'User notes content';

      framework.setUserNotes(versionId, notes);

      const stateManager = framework.getStateManager();
      const version = stateManager.getVersion(versionId);
      expect(version?.userNotes).toBe(notes);
    });
  });

  describe('setAiNotes', () => {
    it('should delegate to state manager', () => {
      const versionId = 1;
      const notes = 'AI notes content';

      framework.setAiNotes(versionId, notes);

      const stateManager = framework.getStateManager();
      const version = stateManager.getVersion(versionId);
      expect(version?.aiNotes).toBe(notes);
    });
  });

  describe('addVersions', () => {
    it('should delegate to state manager', () => {
      const versions = [
        { id: 1, context: { name: 'Version 1' } },
        { id: 2, context: { name: 'Version 2' } },
      ];

      framework.addVersions(versions);

      const stateManager = framework.getStateManager();
      const allVersions = stateManager.getVersions();
      expect(allVersions).toHaveLength(2);
    });
  });

  describe('transcription agent methods', () => {
    it('should have joinMeeting method', () => {
      expect(typeof framework.joinMeeting).toBe('function');
    });

    it('should have leaveMeeting method', () => {
      expect(typeof framework.leaveMeeting).toBe('function');
    });

    it('should have getConnectionStatus method', () => {
      expect(typeof framework.getConnectionStatus).toBe('function');
    });
  });

  describe('generateNotes', () => {
    it('should have generateNotes method', () => {
      expect(typeof framework.generateNotes).toBe('function');
    });

    it('should throw error when version is not found', async () => {
      const versionId = 999; // Non-existent version

      await expect(framework.generateNotes(versionId))
        .rejects.toThrow('Version 999 not found');
    });
  });
});
