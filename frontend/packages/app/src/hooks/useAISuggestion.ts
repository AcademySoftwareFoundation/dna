import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UserSettings, DNAEvent, TranscriptEventPayload } from '@dna/core';
import { apiHandler, aiSuggestionManager } from '../api';
import { useTranscriptEvents } from './useDNAEvents';

export interface UseAISuggestionOptions {
  playlistId: number | null;
  versionId: number | null;
  userEmail: string | null;
  enabled?: boolean;
}

export interface UseAISuggestionResult {
  suggestion: string | null;
  prompt: string | null;
  context: string | null;
  isLoading: boolean;
  error: Error | null;
  regenerate: (additionalInstructions?: string) => void;
  historyCount: number;
  activeOrdinal: number | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
  goPreviousVersion: () => void;
  goNextVersion: () => void;
}

const MAX_NOTES_PER_VERSION = 100;

const DEFAULT_REGENERATE_INSTRUCTIONS =
  'Regenerate all notes from the transcript. Ignore any existing notes in the draft.';

const NO_OP_SUGGESTION_PATTERN =
  /^(?:there are )?no new notes?[\s.!]*$|^(?:there are )?no notes? (?:to add|generated|available)[\s.!]*$/i;

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

export function useAISuggestion({
  playlistId,
  versionId,
  userEmail,
  enabled = true,
}: UseAISuggestionOptions): UseAISuggestionResult {
  const isEnabled =
    enabled && playlistId != null && versionId != null && userEmail != null;

  const [notesByVersionId, setNotesByVersionId] = useState<
    Record<number, string[]>
  >({});
  const [indexByVersionId, setIndexByVersionId] = useState<
    Record<number, number>
  >({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [lastContext, setLastContext] = useState<string | null>(null);

  const prevVersionRef = useRef<number | null>(null);

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ['userSettings', userEmail],
    queryFn: () => apiHandler.getUserSettings({ userEmail: userEmail! }),
    enabled: isEnabled,
    staleTime: 60000,
  });

  useEffect(() => {
    if (!isEnabled || playlistId == null || versionId == null) {
      return;
    }

    const initialGenerationSnapshot =
      aiSuggestionManager.getGenerationState(playlistId, versionId);
    setIsGenerating(initialGenerationSnapshot.isLoading);
    setError(initialGenerationSnapshot.error);

    const unsubscribeFromGenerationState =
      aiSuggestionManager.onGenerationStateChange(
        (changedPlaylistId, changedVersionId, generationState) => {
          if (
            changedPlaylistId !== playlistId ||
            changedVersionId !== versionId
          ) {
            return;
          }
          setIsGenerating(generationState.isLoading);
          setError(generationState.error);
        }
      );

    const unsubscribeFromGenerationSuccess =
      aiSuggestionManager.onGenerationSuccess(
        (changedPlaylistId, changedVersionId, generatedNote) => {
          if (
            changedPlaylistId !== playlistId ||
            changedVersionId !== versionId
          ) {
            return;
          }
          if (!isUsableSuggestion(generatedNote.suggestion)) {
            return;
          }

          setNotesByVersionId((previousNotesByVersionId) => {
            const existing = previousNotesByVersionId[versionId] ?? [];
            let nextNotesForVersion = [...existing, generatedNote.suggestion];
            if (nextNotesForVersion.length > MAX_NOTES_PER_VERSION) {
              nextNotesForVersion = nextNotesForVersion.slice(
                -MAX_NOTES_PER_VERSION
              );
            }
            const newestNoteIndexInVersion = nextNotesForVersion.length - 1;
            setIndexByVersionId((previousIndexesByVersionId) => ({
              ...previousIndexesByVersionId,
              [versionId]: newestNoteIndexInVersion,
            }));
            return {
              ...previousNotesByVersionId,
              [versionId]: nextNotesForVersion,
            };
          });
          setLastPrompt(generatedNote.prompt);
          setLastContext(generatedNote.context);
        }
      );

    return () => {
      unsubscribeFromGenerationState();
      unsubscribeFromGenerationSuccess();
    };
  }, [playlistId, versionId, isEnabled]);

  const runGenerate = useCallback(
    async (
      additionalInstructions?: string,
      options?: { requireFresh?: boolean }
    ) => {
      if (!playlistId || !versionId || !userEmail) return;

      try {
        await aiSuggestionManager.generateSuggestion(
          playlistId,
          versionId,
          userEmail,
          additionalInstructions,
          options
        );
      } catch {
      }
    },
    [playlistId, versionId, userEmail]
  );

  useEffect(() => {
    setIndexByVersionId((prev) => {
      if (!isEnabled || versionId == null) return prev;
      const list = notesByVersionId[versionId];
      if (!list?.length) return prev;
      const i = prev[versionId];
      if (i === undefined) return { ...prev, [versionId]: list.length - 1 };
      return { ...prev, [versionId]: Math.min(i, list.length - 1) };
    });
  }, [isEnabled, versionId, notesByVersionId]);

  const regenerate = useCallback(
    (additionalInstructions?: string) => {
      if (!isEnabled) return;
      const instructions =
        additionalInstructions?.trim() || DEFAULT_REGENERATE_INSTRUCTIONS;
      runGenerate(instructions, { requireFresh: true }).catch(() => {});
    },
    [isEnabled, runGenerate]
  );

  useEffect(() => {
    if (!isEnabled || !userSettings?.regenerate_on_version_change) {
      prevVersionRef.current = versionId;
      return;
    }

    if (
      prevVersionRef.current !== null &&
      prevVersionRef.current !== versionId
    ) {
      runGenerate().catch(() => {});
    }

    prevVersionRef.current = versionId;
  }, [
    versionId,
    playlistId,
    userEmail,
    userSettings,
    isEnabled,
    runGenerate,
  ]);

  const handleTranscriptEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_event: DNAEvent<TranscriptEventPayload>) => {
      if (
        !isEnabled ||
        !userSettings?.regenerate_on_transcript_update ||
        playlistId == null ||
        versionId == null ||
        userEmail == null
      ) {
        return;
      }

      aiSuggestionManager.scheduleRegeneration(
        playlistId,
        versionId,
        userEmail
      );
    },
    [isEnabled, userSettings, playlistId, versionId, userEmail]
  );

  useTranscriptEvents(handleTranscriptEvent, {
    playlistId,
    versionId,
    enabled: isEnabled && !!userSettings?.regenerate_on_transcript_update,
  });

  const navigateVersion = useCallback(
    (delta: -1 | 1) => {
      if (!isEnabled || versionId == null) return;
      const list = notesByVersionId[versionId] ?? [];
      if (!list.length) return;
      const cur = indexByVersionId[versionId] ?? list.length - 1;
      const next = cur + delta;
      if (next < 0 || next >= list.length) return;
      setIndexByVersionId((prev) => ({ ...prev, [versionId]: next }));
    },
    [isEnabled, versionId, notesByVersionId, indexByVersionId]
  );

  const goPreviousVersion = useCallback(
    () => navigateVersion(-1),
    [navigateVersion]
  );
  const goNextVersion = useCallback(
    () => navigateVersion(1),
    [navigateVersion]
  );

  const list =
    isEnabled && versionId != null
      ? (notesByVersionId[versionId] ?? [])
      : [];
  const activeIndex =
    !isEnabled || versionId == null || !list.length
      ? -1
      : (indexByVersionId[versionId] ?? list.length - 1);

  const historyCount = list.length;
  const activeOrdinal = historyCount > 0 ? activeIndex + 1 : null;
  const canGoPrevious = historyCount > 0 && activeIndex > 0;
  const canGoNext =
    historyCount > 0 && activeIndex >= 0 && activeIndex < historyCount - 1;
  const suggestion =
    isEnabled && activeIndex >= 0 && list[activeIndex] != null
      ? list[activeIndex]!
      : null;

  const viewingLatest =
    historyCount > 0 && activeIndex === historyCount - 1 && activeIndex >= 0;
  const prompt = viewingLatest ? lastPrompt : null;
  const context = viewingLatest ? lastContext : null;

  const isLoading = isGenerating;

  return useMemo(
    () => ({
      suggestion,
      prompt,
      context,
      isLoading,
      error,
      regenerate,
      historyCount,
      activeOrdinal,
      canGoPrevious,
      canGoNext,
      goPreviousVersion,
      goNextVersion,
    }),
    [
      suggestion,
      prompt,
      context,
      isLoading,
      error,
      regenerate,
      historyCount,
      activeOrdinal,
      canGoPrevious,
      canGoNext,
      goPreviousVersion,
      goNextVersion,
    ]
  );
}
