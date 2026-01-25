import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AISuggestionManager } from './aiSuggestionManager';
import type { ApiHandler } from './apiHandler';

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

  describe('getSuggestion', () => {
    it('returns null for non-existent key', () => {
      const result = manager.getSuggestion(1, 1);
      expect(result).toBeNull();
    });
  });

  describe('getFullState', () => {
    it('returns initial state for new key', () => {
      const state = manager.getFullState(1, 1);
      expect(state).toEqual({
        suggestion: null,
        prompt: null,
        context: null,
        isLoading: false,
        error: null,
      });
    });
  });

  describe('generateSuggestion', () => {
    it('calls API and updates state on success', async () => {
      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        suggestion: 'Generated note',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      const result = await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(result).toBe('Generated note');
      expect(mockApiHandler.generateNote).toHaveBeenCalledWith({
        playlistId: 1,
        versionId: 1,
        userEmail: 'test@example.com',
      });
      expect(manager.getSuggestion(1, 1)).toBe('Generated note');
    });

    it('sets loading state during API call', async () => {
      let resolvePromise: (value: { suggestion: string; prompt: string; context: string }) => void;
      const promise = new Promise<{ suggestion: string; prompt: string; context: string }>((resolve) => {
        resolvePromise = resolve;
      });

      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockReturnValue(promise);

      const stateChanges: boolean[] = [];
      manager.onStateChange((_, __, state) => {
        stateChanges.push(state.isLoading);
      });

      const generatePromise = manager.generateSuggestion(1, 1, 'test@example.com');

      expect(stateChanges).toContain(true);

      resolvePromise!({ suggestion: 'Done', prompt: 'Test', context: 'Test' });
      await generatePromise;

      expect(stateChanges).toContain(false);
    });

    it('captures error in state on API failure', async () => {
      const error = new Error('API Error');
      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(
        manager.generateSuggestion(1, 1, 'test@example.com')
      ).rejects.toThrow('API Error');

      const state = manager.getFullState(1, 1);
      expect(state.error?.message).toBe('API Error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('clearSuggestion', () => {
    it('clears suggestion and error', async () => {
      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        suggestion: 'Note',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      await manager.generateSuggestion(1, 1, 'test@example.com');
      expect(manager.getSuggestion(1, 1)).toBe('Note');

      manager.clearSuggestion(1, 1);

      expect(manager.getSuggestion(1, 1)).toBeNull();
    });
  });

  describe('onStateChange', () => {
    it('notifies listeners on state changes', async () => {
      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        suggestion: 'Note',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      const callback = vi.fn();
      const unsubscribe = manager.onStateChange(callback);

      await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ suggestion: 'Note' })
      );

      unsubscribe();
    });

    it('unsubscribes correctly', async () => {
      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        suggestion: 'Note',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      const callback = vi.fn();
      const unsubscribe = manager.onStateChange(callback);

      unsubscribe();

      await manager.generateSuggestion(1, 1, 'test@example.com');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('scheduleRegeneration', () => {
    it('debounces API calls', async () => {
      vi.useFakeTimers();

      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        suggestion: 'Note',
        prompt: 'Test prompt',
        context: 'Test context',
      });

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
    it('clears all state and listeners', async () => {
      (mockApiHandler.generateNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        suggestion: 'Note',
        prompt: 'Test prompt',
        context: 'Test context',
      });

      const callback = vi.fn();
      manager.onStateChange(callback);

      await manager.generateSuggestion(1, 1, 'test@example.com');
      callback.mockClear();

      manager.destroy();

      expect(manager.getSuggestion(1, 1)).toBeNull();
    });
  });
});
