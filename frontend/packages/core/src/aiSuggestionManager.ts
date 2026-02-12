/**
 * AI Suggestion Manager
 *
 * Framework-agnostic class for managing AI note suggestion state.
 */

import type { ApiHandler } from './apiHandler';
import type {
  AISuggestionState,
  AISuggestionStateChangeCallback,
} from './interfaces';

export interface AISuggestionManagerOptions {
  debounceMs?: number;
}

type StateMap = Map<string, AISuggestionState>;

function buildKey(playlistId: number, versionId: number): string {
  return `${playlistId}-${versionId}`;
}

function createInitialState(): AISuggestionState {
  return {
    suggestion: null,
    prompt: null,
    context: null,
    isLoading: false,
    error: null,
  };
}

export class AISuggestionManager {
  private apiHandler: ApiHandler;
  private states: StateMap = new Map();
  private listeners: Set<AISuggestionStateChangeCallback> = new Set();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private debounceMs: number;

  constructor(
    apiHandler: ApiHandler,
    options: AISuggestionManagerOptions = {}
  ) {
    this.apiHandler = apiHandler;
    this.debounceMs = options.debounceMs ?? 1000;
  }

  private getState(playlistId: number, versionId: number): AISuggestionState {
    const key = buildKey(playlistId, versionId);
    let state = this.states.get(key);
    if (!state) {
      state = createInitialState();
      this.states.set(key, state);
    }
    return state;
  }

  private setState(
    playlistId: number,
    versionId: number,
    updates: Partial<AISuggestionState>
  ): void {
    const key = buildKey(playlistId, versionId);
    const current = this.getState(playlistId, versionId);
    const newState: AISuggestionState = { ...current, ...updates };
    this.states.set(key, newState);
    this.notifyListeners(playlistId, versionId, newState);
  }

  private notifyListeners(
    playlistId: number,
    versionId: number,
    state: AISuggestionState
  ): void {
    for (const callback of this.listeners) {
      try {
        callback(playlistId, versionId, state);
      } catch {
        // Ignore listener errors
      }
    }
  }

  getSuggestion(playlistId: number, versionId: number): string | null {
    return this.getState(playlistId, versionId).suggestion;
  }

  getFullState(playlistId: number, versionId: number): AISuggestionState {
    return this.getState(playlistId, versionId);
  }

  clearSuggestion(playlistId: number, versionId: number): void {
    this.setState(playlistId, versionId, {
      suggestion: null,
      error: null,
    });
  }

  async generateSuggestion(
    playlistId: number,
    versionId: number,
    userEmail: string,
    additionalInstructions?: string
  ): Promise<string> {
    const key = buildKey(playlistId, versionId);

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(key);
    }

    this.setState(playlistId, versionId, {
      isLoading: true,
      error: null,
    });

    try {
      const response = await this.apiHandler.generateNote({
        playlistId,
        versionId,
        userEmail,
        additionalInstructions,
      });

      this.setState(playlistId, versionId, {
        suggestion: response.suggestion,
        prompt: response.prompt,
        context: response.context,
        isLoading: false,
        error: null,
      });

      return response.suggestion;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState(playlistId, versionId, {
        isLoading: false,
        error,
      });
      throw error;
    }
  }

  scheduleRegeneration(
    playlistId: number,
    versionId: number,
    userEmail: string,
    additionalInstructions?: string
  ): void {
    const key = buildKey(playlistId, versionId);

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.generateSuggestion(
        playlistId,
        versionId,
        userEmail,
        additionalInstructions
      ).catch(() => {
        // Error is already captured in state
      });
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  onStateChange(callback: AISuggestionStateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  getSnapshot(playlistId: number, versionId: number): AISuggestionState {
    return this.getState(playlistId, versionId);
  }

  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.listeners.clear();
    this.states.clear();
  }
}
