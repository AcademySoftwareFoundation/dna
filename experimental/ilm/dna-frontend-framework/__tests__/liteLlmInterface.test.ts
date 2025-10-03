import { LiteLlmInterface } from '../notes/LLMs/liteLlm';
import { Configuration } from '../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('LiteLlmInterface', () => {
  let liteLlmInterface: LiteLlmInterface;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let configuration: Configuration;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    configuration = {
      vexaUrl: 'https://api.vexa.com',
      vexaApiKey: 'test-api-key',
      platform: 'google_meet',
      llmInterface: 'litellm',
      llmModel: 'gpt-4',
      llmApiKey: 'test-litellm-key',
      llmBaseURL: 'https://api.litellm.ai',
    };

    liteLlmInterface = new LiteLlmInterface(configuration);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(liteLlmInterface.key).toBe(configuration.llmApiKey);
      expect(liteLlmInterface.model).toBe(configuration.llmModel);
    });
  });

  describe('generateNotes', () => {
    it('should call LiteLLM API with correct parameters', async () => {
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(prompt);

      expect(mockFetch).toHaveBeenCalledWith(`${configuration.llmBaseURL}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({
          model: configuration.llmModel,
          messages: [{ role: 'user', content: prompt }],
        }),
        headers: {
          'x-litellm-api-key': configuration.llmApiKey,
        },
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(prompt);

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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(prompt);

      expect(result).toBe('');
    });

    it('should handle empty choices array', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        choices: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(prompt);

      expect(result).toBe('');
    });

    it('should handle missing choices property', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(prompt);

      expect(result).toBe('');
    });

    it('should handle HTTP error responses', async () => {
      const prompt = 'Test prompt';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      } as Response);

      await expect(liteLlmInterface.generateNotes(prompt))
        .rejects.toThrow('HTTP error! status: 400');
    });

    it('should handle different HTTP error status codes', async () => {
      const prompt = 'Test prompt';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(liteLlmInterface.generateNotes(prompt))
        .rejects.toThrow('HTTP error! status: 500');
    });

    it('should handle network errors', async () => {
      const prompt = 'Test prompt';
      const error = new Error('Network error');
      mockFetch.mockRejectedValueOnce(error);

      await expect(liteLlmInterface.generateNotes(prompt))
        .rejects.toThrow('Network error');
    });

    it('should handle JSON parsing errors', async () => {
      const prompt = 'Test prompt';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);

      await expect(liteLlmInterface.generateNotes(prompt))
        .rejects.toThrow('Invalid JSON');
    });

    it('should work with different model configurations', async () => {
      const customConfig = {
        ...configuration,
        llmModel: 'claude-3-sonnet',
        llmApiKey: 'custom-litellm-key',
        llmBaseURL: 'https://custom.litellm.ai',
      };

      const customInterface = new LiteLlmInterface(customConfig);
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await customInterface.generateNotes(prompt);

      expect(mockFetch).toHaveBeenCalledWith('https://custom.litellm.ai/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: prompt }],
        }),
        headers: {
          'x-litellm-api-key': 'custom-litellm-key',
        },
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(longPrompt);

      expect(mockFetch).toHaveBeenCalledWith(`${configuration.llmBaseURL}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({
          model: configuration.llmModel,
          messages: [{ role: 'user', content: longPrompt }],
        }),
        headers: {
          'x-litellm-api-key': configuration.llmApiKey,
        },
      });
      expect(result).toBe('Generated content for long prompt');
    });

    it('should handle special characters in prompt', async () => {
      const specialPrompt = 'Test prompt with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Generated content with special chars',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(specialPrompt);

      expect(mockFetch).toHaveBeenCalledWith(`${configuration.llmBaseURL}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({
          model: configuration.llmModel,
          messages: [{ role: 'user', content: specialPrompt }],
        }),
        headers: {
          'x-litellm-api-key': configuration.llmApiKey,
        },
      });
      expect(result).toBe('Generated content with special chars');
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await liteLlmInterface.generateNotes(prompt);

      expect(result).toBe('First choice content');
    });
  });
});
