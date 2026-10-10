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
    it('calls API and clears loading state on success', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const result = await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(result).toEqual(mockResponse);
      expect(mockApiHandler.generateNote).toHaveBeenCalledWith({
        playlistId: 1,
        versionId: 1,
        userEmail: 'test@example.com',
      });
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

    it('reuses the in-flight request for the same playlist/version/instructions key', async () => {
      let resolvePromise: (value: GenerateNoteResponse) => void;
      const promise = new Promise<GenerateNoteResponse>((resolve) => {
        resolvePromise = resolve;
      });

      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockReturnValue(
        promise
      );

      const first = manager.generateSuggestion(1, 1, 'test@example.com');
      const second = manager.generateSuggestion(1, 1, 'test@example.com');

      expect(mockApiHandler.generateNote).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);

      resolvePromise!(mockResponse);
      await expect(first).resolves.toEqual(mockResponse);
    });

    it('captures error in state on API failure', async () => {
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

    it('sets error when response is empty and no prior suggestion exists', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        suggestion: '',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      await manager.generateSuggestion(1, 1, 'test@example.com');

      const state = manager.getGenerationState(1, 1);
      expect(state.error?.message).toBe('Generated note was empty');
      expect(state.isLoading).toBe(false);
    });

    it('sets error when response is a no-op and no prior suggestion exists', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        suggestion: 'No new notes.',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      await manager.generateSuggestion(1, 1, 'test@example.com');

      const state = manager.getGenerationState(1, 1);
      expect(state.error?.message).toBe('The model had no new notes to add');
    });

    it('preserves prior suggestion when a no-op response is returned without requireFresh', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockResponse);

      await manager.generateSuggestion(1, 1, 'test@example.com');

      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        suggestion: 'There are no new notes',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      await manager.generateSuggestion(1, 1, 'test@example.com');

      const state = manager.getGenerationState(1, 1);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('clears prior suggestion and sets error when requireFresh gets a no-op response', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockResponse);

      await manager.generateSuggestion(1, 1, 'test@example.com');

      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        suggestion: 'There are no new notes',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      await manager.generateSuggestion(1, 1, 'test@example.com', undefined, {
        requireFresh: true,
      });

      const state = manager.getGenerationState(1, 1);
      expect(state.error?.message).toBe('The model had no new notes to add');
      expect(state.isLoading).toBe(false);
    });

    it('sets loading state when requireFresh generation starts', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockResponse);

      await manager.generateSuggestion(1, 1, 'test@example.com');

      let resolvePromise: (value: GenerateNoteResponse) => void;
      const promise = new Promise<GenerateNoteResponse>((resolve) => {
        resolvePromise = resolve;
      });

      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockReturnValue(
        promise
      );

      const generatePromise = manager.generateSuggestion(
        1,
        1,
        'test@example.com',
        'Regenerate all notes',
        { requireFresh: true }
      );

      expect(manager.getGenerationState(1, 1).isLoading).toBe(true);

      resolvePromise!(mockResponse);
      await generatePromise;

      expect(manager.getGenerationState(1, 1)).toEqual({
        isLoading: false,
        error: null,
      });
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
        expect.objectContaining({
          isLoading: false,
          error: null,
        })
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

  describe('onGenerationSuccess', () => {
    it('notifies listeners with the raw API response on success', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const callback = vi.fn();
      const unsubscribe = manager.onGenerationSuccess(callback);

      await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(callback).toHaveBeenCalledWith(1, 1, mockResponse);

      unsubscribe();
    });

    it('unsubscribes correctly', async () => {
      (
        mockApiHandler.generateNote as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResponse);

      const callback = vi.fn();
      const unsubscribe = manager.onGenerationSuccess(callback);

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
    it('clears state and listeners', async () => {
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
