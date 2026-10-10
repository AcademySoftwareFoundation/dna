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

export interface GenerateSuggestionOptions {
  requireFresh?: boolean;
}

type GenerationMap = Map<string, AISuggestionGenerationState>;

type LatestSuggestion = {
  suggestion: string | null;
  prompt: string | null;
  context: string | null;
};

const NO_OP_SUGGESTION_PATTERN =
  /^(?:there are )?no new notes?[\s.!]*$|^(?:there are )?no notes? (?:to add|generated|available)[\s.!]*$/i;

function buildKey(playlistId: number, versionId: number): string {
  return `${playlistId}-${versionId}`;
}

function buildRequestKey(
  playlistId: number,
  versionId: number,
  additionalInstructions?: string
): string {
  const instructionsKey = additionalInstructions?.trim() ?? '';
  return `${buildKey(playlistId, versionId)}:${instructionsKey}`;
}

function idleGenerationState(): AISuggestionGenerationState {
  return { isLoading: false, error: null };
}

function idleLatestSuggestion(): LatestSuggestion {
  return { suggestion: null, prompt: null, context: null };
}

function isNoOpSuggestion(text: string): boolean {
  const trimmed = text.trim();
  return (
    !trimmed ||
    NO_OP_SUGGESTION_PATTERN.test(trimmed) ||
    /\bno new notes?\b/i.test(trimmed)
  );
}

function isUsableSuggestion(
  text: string | null | undefined
): text is string {
  return (
    typeof text === 'string' &&
    text.trim().length > 0 &&
    !isNoOpSuggestion(text)
  );
}

function getUnusableSuggestionError(text: string | null | undefined): Error {
  const trimmed = (text ?? '').trim();
  return new Error(
    trimmed.length === 0
      ? 'Generated note was empty'
      : 'The model had no new notes to add'
  );
}

export class AISuggestionManager {
  private apiHandler: ApiHandler;
  private generationByKey: GenerationMap = new Map();
  private latestByKey = new Map<string, LatestSuggestion>();
  private generationListeners = new Set<
    AISuggestionGenerationStateChangeCallback
  >();
  private successListeners = new Set<AISuggestionGenerationSuccessCallback>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlightByKey = new Map<string, Promise<GenerateNoteResponse>>();
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

  private getLatest(playlistId: number, versionId: number): LatestSuggestion {
    return (
      this.latestByKey.get(buildKey(playlistId, versionId)) ??
      idleLatestSuggestion()
    );
  }

  private setLatest(
    playlistId: number,
    versionId: number,
    latest: LatestSuggestion
  ): void {
    this.latestByKey.set(buildKey(playlistId, versionId), latest);
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

  generateSuggestion(
    playlistId: number,
    versionId: number,
    userEmail: string,
    additionalInstructions?: string,
    options: GenerateSuggestionOptions = {}
  ): Promise<GenerateNoteResponse> {
    const requestKey = buildRequestKey(
      playlistId,
      versionId,
      additionalInstructions
    );

    const existingRequest = this.inFlightByKey.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    const promise = (async (): Promise<GenerateNoteResponse> => {
      const { requireFresh = false } = options;
      const key = buildKey(playlistId, versionId);

      const existingTimer = this.debounceTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.debounceTimers.delete(key);
      }

      if (requireFresh) {
        this.setLatest(playlistId, versionId, idleLatestSuggestion());
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

        const current = this.getLatest(playlistId, versionId);

        if (isUsableSuggestion(response.suggestion)) {
          this.setLatest(playlistId, versionId, {
            suggestion: response.suggestion,
            prompt: response.prompt,
            context: response.context,
          });
          this.setGeneration(playlistId, versionId, idleGenerationState());
        } else if (!requireFresh && isUsableSuggestion(current.suggestion)) {
          this.setGeneration(playlistId, versionId, idleGenerationState());
        } else {
          if (requireFresh) {
            this.setLatest(playlistId, versionId, idleLatestSuggestion());
          }
          this.setGeneration(playlistId, versionId, {
            isLoading: false,
            error: getUnusableSuggestionError(response.suggestion),
          });
        }

        this.notifySuccess(playlistId, versionId, response);

        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (requireFresh) {
          this.setLatest(playlistId, versionId, idleLatestSuggestion());
        }
        this.setGeneration(playlistId, versionId, {
          isLoading: false,
          error,
        });
        throw error;
      }
    })();

    let tracked: Promise<GenerateNoteResponse>;
    tracked = promise.finally(() => {
      if (this.inFlightByKey.get(requestKey) === tracked) {
        this.inFlightByKey.delete(requestKey);
      }
    });

    this.inFlightByKey.set(requestKey, tracked);
    return tracked;
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
    this.inFlightByKey.clear();
    this.generationListeners.clear();
    this.successListeners.clear();
    this.generationByKey.clear();
    this.latestByKey.clear();
  }
}
