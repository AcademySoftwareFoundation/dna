/**
 * Orchestrates generate-note HTTP calls (and debounced transcript-driven refetch).
 * Does not persist suggestion text; callers (e.g. React state) own that.
 */

import type { ApiHandler } from './apiHandler';
import type {
  AISuggestionGenerationState,
  AISuggestionGenerationStateChangeCallback,
  AISuggestionGenerationSuccessCallback,
  GenerateNoteResponse,
} from './interfaces';

export interface AISuggestionManagerOptions {
  debounceMs?: number;
}

type GenerationMap = Map<string, AISuggestionGenerationState>;

function buildKey(playlistId: number, versionId: number): string {
  return `${playlistId}-${versionId}`;
}

function idleGenerationState(): AISuggestionGenerationState {
  return { isLoading: false, error: null };
}

export class AISuggestionManager {
  private apiHandler: ApiHandler;
  private generationByKey: GenerationMap = new Map();
  private generationListeners = new Set<
    AISuggestionGenerationStateChangeCallback
  >();
  private successListeners = new Set<AISuggestionGenerationSuccessCallback>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceMs: number;

  constructor(
    apiHandler: ApiHandler,
    options: AISuggestionManagerOptions = {}
  ) {
    this.apiHandler = apiHandler;
    this.debounceMs = options.debounceMs ?? 1000;
  }

  private getGeneration(playlistId: number, versionId: number) {
    const key = buildKey(playlistId, versionId);
    let state = this.generationByKey.get(key);
    if (!state) {
      state = idleGenerationState();
      this.generationByKey.set(key, state);
    }
    return state;
  }

  private setGeneration(
    playlistId: number,
    versionId: number,
    updates: Partial<AISuggestionGenerationState>
  ): void {
    const key = buildKey(playlistId, versionId);
    const current = this.getGeneration(playlistId, versionId);
    const next: AISuggestionGenerationState = { ...current, ...updates };
    this.generationByKey.set(key, next);
    this.notifyGeneration(playlistId, versionId, next);
  }

  private notifyGeneration(
    playlistId: number,
    versionId: number,
    state: AISuggestionGenerationState
  ): void {
    for (const callback of this.generationListeners) {
      try {
        callback(playlistId, versionId, state);
      } catch {
      }
    }
  }

  private notifySuccess(
    playlistId: number,
    versionId: number,
    response: GenerateNoteResponse
  ): void {
    for (const callback of this.successListeners) {
      try {
        callback(playlistId, versionId, response);
      } catch {
      }
    }
  }

  getGenerationState(
    playlistId: number,
    versionId: number
  ): AISuggestionGenerationState {
    const snapshot = this.getGeneration(playlistId, versionId);
    return { ...snapshot };
  }

  onGenerationStateChange(
    callback: AISuggestionGenerationStateChangeCallback
  ): () => void {
    this.generationListeners.add(callback);
    return () => {
      this.generationListeners.delete(callback);
    };
  }

  onGenerationSuccess(
    callback: AISuggestionGenerationSuccessCallback
  ): () => void {
    this.successListeners.add(callback);
    return () => {
      this.successListeners.delete(callback);
    };
  }

  async generateSuggestion(
    playlistId: number,
    versionId: number,
    userEmail: string,
    additionalInstructions?: string
  ): Promise<GenerateNoteResponse> {
    const key = buildKey(playlistId, versionId);

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(key);
    }

    this.setGeneration(playlistId, versionId, {
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

      this.setGeneration(playlistId, versionId, idleGenerationState());
      this.notifySuccess(playlistId, versionId, response);

      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setGeneration(playlistId, versionId, {
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
      ).catch(() => {});
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.generationListeners.clear();
    this.successListeners.clear();
    this.generationByKey.clear();
  }
}
