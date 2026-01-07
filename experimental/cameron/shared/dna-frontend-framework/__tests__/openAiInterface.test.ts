import { OpenAILLMInterface } from '../notes/LLMs/openAiInterface';
import { Configuration } from '../types';

// Mock the OpenAI library
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('OpenAILLMInterface', () => {
  let openAiInterface: OpenAILLMInterface;
  let mockOpenAI: any;
  let configuration: Configuration;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockClear();

    configuration = {
      vexaUrl: 'https://api.vexa.com',
      vexaApiKey: 'test-api-key',
      platform: 'google_meet',
      llmInterface: 'openai',
      llmModel: 'gpt-4',
      llmApiKey: 'test-openai-key',
      llmBaseURL: 'https://api.openai.com/v1',
    };

    openAiInterface = new OpenAILLMInterface(configuration);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: configuration.llmApiKey,
        baseURL: configuration.llmBaseURL,
      });
    });

    it('should set correct properties from configuration', () => {
      expect(openAiInterface.key).toBe(configuration.llmApiKey);
      expect(openAiInterface.model).toBe(configuration.llmModel);
    });
  });

  describe('generateNotes', () => {
    it('should call OpenAI API with correct parameters', async () => {
      const prompt = 'Test prompt for note generation';
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Generated notes content',
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await openAiInterface.generateNotes(prompt);

      expect(mockCreate).toHaveBeenCalledWith({
        model: configuration.llmModel,
        messages: [{ role: 'user', content: prompt }],
      });
      expect(result).toBe('Generated notes content');
    });

    it('should handle empty content response', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await openAiInterface.generateNotes(prompt);

      expect(result).toBe('');
    });

    it('should handle undefined content response', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        choices: [
          {
            message: {},
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await openAiInterface.generateNotes(prompt);

      expect(result).toBe('');
    });

    it('should handle multiple choices and return first one', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'First choice content',
            },
          },
          {
            message: {
              content: 'Second choice content',
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await openAiInterface.generateNotes(prompt);

      expect(result).toBe('First choice content');
    });

    it('should handle empty choices array', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        choices: [],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await openAiInterface.generateNotes(prompt);

      expect(result).toBe('');
    });

    it('should propagate API errors', async () => {
      const prompt = 'Test prompt';
      const error = new Error('OpenAI API error');
      mockCreate.mockRejectedValue(error);

      await expect(openAiInterface.generateNotes(prompt))
        .rejects.toThrow('OpenAI API error');
    });

    it('should handle network errors', async () => {
      const prompt = 'Test prompt';
      const error = new Error('Network error');
      mockCreate.mockRejectedValue(error);

      await expect(openAiInterface.generateNotes(prompt))
        .rejects.toThrow('Network error');
    });

    it('should handle rate limit errors', async () => {
      const prompt = 'Test prompt';
      const error = new Error('Rate limit exceeded');
      mockCreate.mockRejectedValue(error);

      await expect(openAiInterface.generateNotes(prompt))
        .rejects.toThrow('Rate limit exceeded');
    });

    it('should work with different model configurations', async () => {
      const customConfig = {
        ...configuration,
        llmModel: 'gpt-3.5-turbo',
        llmApiKey: 'custom-key',
        llmBaseURL: 'https://custom.openai.com/v1',
      };

      const customInterface = new OpenAILLMInterface(customConfig);
      const prompt = 'Test prompt';
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Generated content',
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await customInterface.generateNotes(prompt);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });
      expect(result).toBe('Generated content');
    });

    it('should handle long prompts', async () => {
      const longPrompt = 'A'.repeat(10000); // Very long prompt
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Generated content for long prompt',
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await openAiInterface.generateNotes(longPrompt);

      expect(mockCreate).toHaveBeenCalledWith({
        model: configuration.llmModel,
        messages: [{ role: 'user', content: longPrompt }],
      });
      expect(result).toBe('Generated content for long prompt');
    });
  });
});
