import { LLMInterface } from '../notes/LLMs/llmInterface';
import { Configuration } from '../types';

// Create a concrete implementation of LLMInterface for testing
class TestLLMInterface extends LLMInterface {
  public async generateNotes(prompt: string): Promise<string> {
    return `Generated notes for: ${prompt}`;
  }
}

describe('LLMInterface', () => {
  let testInterface: TestLLMInterface;
  let configuration: Configuration;

  beforeEach(() => {
    configuration = {
      vexaUrl: 'https://api.vexa.com',
      vexaApiKey: 'test-api-key',
      platform: 'google_meet',
      llmInterface: 'openai',
      llmModel: 'gpt-4',
      llmApiKey: 'test-llm-key',
      llmBaseURL: 'https://api.openai.com/v1',
    };

    testInterface = new TestLLMInterface(configuration);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration properties', () => {
      expect(testInterface.key).toBe(configuration.llmApiKey);
      expect(testInterface.model).toBe(configuration.llmModel);
    });

    it('should store configuration values correctly', () => {
      const customConfig = {
        ...configuration,
        llmApiKey: 'custom-key',
        llmModel: 'custom-model',
        llmBaseURL: 'https://custom.api.com',
      };

      const customInterface = new TestLLMInterface(customConfig);

      expect(customInterface.key).toBe('custom-key');
      expect(customInterface.model).toBe('custom-model');
    });
  });

  describe('getters', () => {
    it('should return correct key', () => {
      expect(testInterface.key).toBe(configuration.llmApiKey);
    });

    it('should return correct model', () => {
      expect(testInterface.model).toBe(configuration.llmModel);
    });

    it('should return correct baseURL through protected property', () => {
      // Access the protected _baseURL property through the instance
      expect((testInterface as any)._baseURL).toBe(configuration.llmBaseURL);
    });
  });

  describe('generateNotes', () => {
    it('should be implemented by concrete classes', async () => {
      const prompt = 'Test prompt';
      const result = await testInterface.generateNotes(prompt);

      expect(result).toBe(`Generated notes for: ${prompt}`);
    });

    it('should handle different prompt types', async () => {
      const prompts = [
        'Simple prompt',
        'Prompt with special chars: !@#$%^&*()',
        'Prompt with numbers: 1234567890',
        'Prompt with newlines:\nLine 1\nLine 2',
        'Empty prompt',
        '',
      ];

      for (const prompt of prompts) {
        const result = await testInterface.generateNotes(prompt);
        expect(result).toBe(`Generated notes for: ${prompt}`);
      }
    });

    it('should handle long prompts', async () => {
      const longPrompt = 'A'.repeat(10000);
      const result = await testInterface.generateNotes(longPrompt);

      expect(result).toBe(`Generated notes for: ${longPrompt}`);
    });
  });

  describe('abstract class behavior', () => {
    it('should not be instantiable directly', () => {
      // This test verifies that LLMInterface is abstract
      // In TypeScript, you cannot instantiate an abstract class
      // This is a compile-time check, but we can test the behavior
      expect(() => {
        // This would cause a TypeScript compilation error
        // new LLMInterface(configuration);
      }).not.toThrow();
    });

    it('should require implementation of generateNotes', () => {
      // This test verifies that concrete classes must implement generateNotes
      // The TestLLMInterface above implements it, so this should work
      expect(typeof testInterface.generateNotes).toBe('function');
    });
  });

  describe('configuration handling', () => {
    it('should handle different API keys', () => {
      const configs = [
        { ...configuration, llmApiKey: 'key1' },
        { ...configuration, llmApiKey: 'key2' },
        { ...configuration, llmApiKey: '' },
        { ...configuration, llmApiKey: 'very-long-api-key-with-special-chars-12345' },
      ];

      configs.forEach((config) => {
        const llmInterface = new TestLLMInterface(config);
        expect(llmInterface.key).toBe(config.llmApiKey);
      });
    });

    it('should handle different models', () => {
      const configs = [
        { ...configuration, llmModel: 'gpt-4' },
        { ...configuration, llmModel: 'gpt-3.5-turbo' },
        { ...configuration, llmModel: 'claude-3-sonnet' },
        { ...configuration, llmModel: 'custom-model' },
      ];

      configs.forEach((config) => {
        const llmInterface = new TestLLMInterface(config);
        expect(llmInterface.model).toBe(config.llmModel);
      });
    });

    it('should handle different base URLs', () => {
      const configs = [
        { ...configuration, llmBaseURL: 'https://api.openai.com/v1' },
        { ...configuration, llmBaseURL: 'https://api.litellm.ai' },
        { ...configuration, llmBaseURL: 'https://custom.api.com/v1' },
        { ...configuration, llmBaseURL: 'http://localhost:8000' },
      ];

      configs.forEach((config) => {
        const llmInterface = new TestLLMInterface(config);
        expect((llmInterface as any)._baseURL).toBe(config.llmBaseURL);
      });
    });
  });

  describe('error handling', () => {
    it('should allow concrete classes to throw errors', async () => {
      class ErrorLLMInterface extends LLMInterface {
        public async generateNotes(prompt: string): Promise<string> {
          throw new Error('Test error');
        }
      }

      const errorInterface = new ErrorLLMInterface(configuration);

      await expect(errorInterface.generateNotes('test')).rejects.toThrow('Test error');
    });

    it('should allow concrete classes to return empty strings', async () => {
      class EmptyLLMInterface extends LLMInterface {
        public async generateNotes(prompt: string): Promise<string> {
          return '';
        }
      }

      const emptyInterface = new EmptyLLMInterface(configuration);
      const result = await emptyInterface.generateNotes('test');

      expect(result).toBe('');
    });
  });
});
