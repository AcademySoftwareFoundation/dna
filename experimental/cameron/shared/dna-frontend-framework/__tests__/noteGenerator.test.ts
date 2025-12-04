import { NoteGenerator } from '../notes/noteGenerator';
import { StateManager } from '../state';
import { Configuration, Transcription, Version } from '../types';
import { LLMInterface } from '../notes/LLMs/llmInterface';

// Mock the LLM interfaces
jest.mock('../notes/LLMs/openAiInterface');
jest.mock('../notes/LLMs/liteLlm');

describe('NoteGenerator', () => {
  let noteGenerator: NoteGenerator;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockLLMInterface: jest.Mocked<LLMInterface>;
  let configuration: Configuration;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock state manager
    mockStateManager = {
      getVersion: jest.fn(),
    } as any;

    // Create mock LLM interface
    mockLLMInterface = {
      generateNotes: jest.fn(),
    } as any;

    configuration = {
      vexaUrl: 'https://api.vexa.com',
      vexaApiKey: 'test-api-key',
      platform: 'google_meet',
      llmInterface: 'openai',
      llmModel: 'gpt-4',
      llmApiKey: 'test-llm-key',
      llmBaseURL: 'https://api.openai.com/v1',
    };
  });

  describe('constructor', () => {
    it('should create OpenAILLMInterface when llmInterface is "openai"', () => {
      const { OpenAILLMInterface } = require('../notes/LLMs/openAiInterface');
      (OpenAILLMInterface as jest.MockedClass<typeof OpenAILLMInterface>).mockImplementation(() => mockLLMInterface);

      noteGenerator = new NoteGenerator(mockStateManager, configuration);

      expect(OpenAILLMInterface).toHaveBeenCalledWith(configuration);
    });

    it('should create LiteLlmInterface when llmInterface is "litellm"', () => {
      const { LiteLlmInterface } = require('../notes/LLMs/liteLlm');
      (LiteLlmInterface as jest.MockedClass<typeof LiteLlmInterface>).mockImplementation(() => mockLLMInterface);

      const litellmConfig = { ...configuration, llmInterface: 'litellm' as const };
      noteGenerator = new NoteGenerator(mockStateManager, litellmConfig);

      expect(LiteLlmInterface).toHaveBeenCalledWith(litellmConfig);
    });

    it('should throw error for unsupported llmInterface', () => {
      const unsupportedConfig = { ...configuration, llmInterface: 'unsupported' as any };

      expect(() => new NoteGenerator(mockStateManager, unsupportedConfig))
        .toThrow('LLM interface unsupported not supported');
    });
  });

  describe('generateNotes', () => {
    beforeEach(() => {
      // Set up default mocks
      const { OpenAILLMInterface } = require('../notes/LLMs/openAiInterface');
      (OpenAILLMInterface as jest.MockedClass<typeof OpenAILLMInterface>).mockImplementation(() => mockLLMInterface);
      noteGenerator = new NoteGenerator(mockStateManager, configuration);
    });

    it('should throw error when version is not found', async () => {
      const versionId = 1;
      mockStateManager.getVersion.mockReturnValue(undefined);

      await expect(noteGenerator.generateNotes(versionId))
        .rejects.toThrow('Version 1 not found');
    });

    it('should generate notes from transcriptions and context', async () => {
      const versionId = 1;
      const mockVersion: Version = {
        id: '1',
        context: { name: 'Test Version', description: 'A test version' },
        transcriptions: {
          'key1': {
            text: 'Hello world',
            timestampStart: '2025-01-01T10:00:00.000Z',
            timestampEnd: '2025-01-01T10:00:05.000Z',
            speaker: 'John Doe'
          },
          'key2': {
            text: 'How are you?',
            timestampStart: '2025-01-01T10:00:05.000Z',
            timestampEnd: '2025-01-01T10:00:10.000Z',
            speaker: 'Jane Smith'
          }
        },
        userNotes: '',
        aiNotes: ''
      };

      const expectedNotes = 'Generated notes content';
      mockStateManager.getVersion.mockReturnValue(mockVersion);
      mockLLMInterface.generateNotes.mockResolvedValue(expectedNotes);

      const result = await noteGenerator.generateNotes(versionId);

      expect(mockStateManager.getVersion).toHaveBeenCalledWith(versionId);
      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining('John Doe: Hello world')
      );
      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining('Jane Smith: How are you?')
      );
      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining('Version Context:{"name":"Test Version","description":"A test version"}')
      );
      expect(result).toBe(expectedNotes);
    });

    it('should handle empty transcriptions', async () => {
      const versionId = 1;
      const mockVersion: Version = {
        id: '1',
        context: { name: 'Empty Version' },
        transcriptions: {},
        userNotes: '',
        aiNotes: ''
      };

      const expectedNotes = 'Generated notes for empty transcriptions';
      mockStateManager.getVersion.mockReturnValue(mockVersion);
      mockLLMInterface.generateNotes.mockResolvedValue(expectedNotes);

      const result = await noteGenerator.generateNotes(versionId);

      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining('Transcript:')
      );
      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining('Version Context:{"name":"Empty Version"}')
      );
      expect(result).toBe(expectedNotes);
    });

    it('should handle single transcription', async () => {
      const versionId = 1;
      const mockVersion: Version = {
        id: '1',
        context: { name: 'Single Transcription' },
        transcriptions: {
          'key1': {
            text: 'Only one message',
            timestampStart: '2025-01-01T10:00:00.000Z',
            timestampEnd: '2025-01-01T10:00:05.000Z',
            speaker: 'Speaker One'
          }
        },
        userNotes: '',
        aiNotes: ''
      };

      const expectedNotes = 'Generated notes for single transcription';
      mockStateManager.getVersion.mockReturnValue(mockVersion);
      mockLLMInterface.generateNotes.mockResolvedValue(expectedNotes);

      const result = await noteGenerator.generateNotes(versionId);

      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining('Speaker One: Only one message')
      );
      expect(result).toBe(expectedNotes);
    });

    it('should handle complex context object', async () => {
      const versionId = 1;
      const complexContext = {
        name: 'Complex Version',
        metadata: {
          shot: 'SH001',
          sequence: 'SEQ001',
          department: 'Animation'
        },
        notes: ['Note 1', 'Note 2'],
        priority: 'high'
      };

      const mockVersion: Version = {
        id: '1',
        context: complexContext,
        transcriptions: {
          'key1': {
            text: 'Test message',
            timestampStart: '2025-01-01T10:00:00.000Z',
            timestampEnd: '2025-01-01T10:00:05.000Z',
            speaker: 'Test Speaker'
          }
        },
        userNotes: '',
        aiNotes: ''
      };

      const expectedNotes = 'Generated notes for complex context';
      mockStateManager.getVersion.mockReturnValue(mockVersion);
      mockLLMInterface.generateNotes.mockResolvedValue(expectedNotes);

      const result = await noteGenerator.generateNotes(versionId);

      expect(mockLLMInterface.generateNotes).toHaveBeenCalledWith(
        expect.stringContaining(`Version Context:${JSON.stringify(complexContext)}`)
      );
      expect(result).toBe(expectedNotes);
    });

    it('should propagate errors from LLM interface', async () => {
      const versionId = 1;
      const mockVersion: Version = {
        id: '1',
        context: { name: 'Test Version' },
        transcriptions: {},
        userNotes: '',
        aiNotes: ''
      };

      const error = new Error('LLM API error');
      mockStateManager.getVersion.mockReturnValue(mockVersion);
      mockLLMInterface.generateNotes.mockRejectedValue(error);

      await expect(noteGenerator.generateNotes(versionId))
        .rejects.toThrow('LLM API error');
    });
  });
});
