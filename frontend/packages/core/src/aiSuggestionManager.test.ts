import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AISuggestionManager } from './aiSuggestionManager';
import type { ApiHandler } from './apiHandler';
import type { GenerateNoteResponse } from './interfaces';

const mockResponse: GenerateNoteResponse = {
  suggestion: 'Generated note',
  prompt: 'Test prompt',
  context: 'Test context',
};

describe('AISuggestionManager', () => {
  let mockApiHandler: Partial<ApiHandler>;
  let manager: AISuggestionManager;

  beforeEach(() => {
    mockApiHandler = {
      generateNote: vi.fn(),
    };
    manager = new AISuggestionManager(mockApiHandler as ApiHandler, {
      debounceMs: 100,
    });
  });

  afterEach(() => {
    manager.destroy();
    vi.clearAllMocks();
  });

  describe('getGenerationState', () => {
    it('returns idle state for new key', () => {
      const state = manager.getGenerationState(1, 1);
      expect(state).toEqual({
        isLoading: false,
        error: null,
      });
    });
  });

  describe('generateSuggestion', () => {
    it('calls API and notifies success listeners', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const onSuccess = vi.fn();
      manager.onGenerationSuccess(onSuccess);

      const result = await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(result).toEqual(mockResponse);
      expect(mockApiHandler.generateNote).toHaveBeenCalledWith({
        playlistId: 1,
        versionId: 1,
        userEmail: 'test@example.com',
      });
      expect(onSuccess).toHaveBeenCalledWith(1, 1, mockResponse);
      expect(manager.getGenerationState(1, 1)).toEqual({
        isLoading: false,
        error: null,
      });
    });

    it('sets loading state during API call', async () => {
      let resolvePromise: (value: GenerateNoteResponse) => void;
      const promise = new Promise<GenerateNoteResponse>((resolve) => {
        resolvePromise = resolve;
      });

      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockReturnValue(
        promise
      );

      const stateChanges: boolean[] = [];
      manager.onGenerationStateChange((_, __, state) => {
        stateChanges.push(state.isLoading);
      });

      const generatePromise = manager.generateSuggestion(
        1,
        1,
        'test@example.com'
      );

      expect(stateChanges).toContain(true);

      resolvePromise!(mockResponse);
      await generatePromise;

      expect(stateChanges).toContain(false);
    });

    it('captures error in generation state on API failure', async () => {
      const apiError = new Error('API Error');
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockRejectedValue(apiError);

      await expect(
        manager.generateSuggestion(1, 1, 'test@example.com')
      ).rejects.toThrow('API Error');

      const state = manager.getGenerationState(1, 1);
      expect(state.error?.message).toBe('API Error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('onGenerationStateChange', () => {
    it('notifies listeners on generation state changes', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const callback = vi.fn();
      const unsubscribe = manager.onGenerationStateChange(callback);

      await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ isLoading: false, error: null })
      );

      unsubscribe();
    });

    it('unsubscribes correctly', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const callback = vi.fn();
      const unsubscribe = manager.onGenerationStateChange(callback);

      unsubscribe();

      await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('scheduleRegeneration', () => {
    it('debounces API calls', async () => {
      vi.useFakeTimers();

      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      manager.scheduleRegeneration(1, 1, 'test@example.com');
      manager.scheduleRegeneration(1, 1, 'test@example.com');
      manager.scheduleRegeneration(1, 1, 'test@example.com');

      expect(mockApiHandler.generateNote).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);

      expect(mockApiHandler.generateNote).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('destroy', () => {
    it('clears generation state and listeners', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const callback = vi.fn();
      manager.onGenerationStateChange(callback);

      await manager.generateSuggestion(1, 1, 'test@example.com');
      callback.mockClear();

      manager.destroy();

      expect(manager.getGenerationState(1, 1)).toEqual({
        isLoading: false,
        error: null,
      });
    });
  });
});
