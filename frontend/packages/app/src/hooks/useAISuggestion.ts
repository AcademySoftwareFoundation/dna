import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useIsMutating } from '@tanstack/react-query';
import type { UserSettings, DNAEvent, TranscriptEventPayload } from '@dna/core';
import { apiHandler } from '../api';
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
const TRANSCRIPT_DEBOUNCE_MS = 2000;

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

  const debouncersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const generateInFlightRef = useRef(false);

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ['userSettings', userEmail],
    queryFn: () => apiHandler.getUserSettings({ userEmail: userEmail! }),
    enabled: isEnabled,
    staleTime: 60000,
  });

  const settingsUpsertInflight =
    useIsMutating({
      mutationKey: ['upsertUserSettings', userEmail ?? ''],
    }) > 0 && userEmail != null;

  const prevVersionRef = useRef<number | null>(null);

  const clearDebouncerForKey = useCallback((schedKey: string) => {
    const t = debouncersRef.current.get(schedKey);
    if (t) {
      clearTimeout(t);
      debouncersRef.current.delete(schedKey);
    }
  }, []);

  const clearAllDebouncers = useCallback(() => {
    for (const t of debouncersRef.current.values()) clearTimeout(t);
    debouncersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearAllDebouncers();
    };
  }, [clearAllDebouncers]);

  const scheduleKey =
    userEmail != null && playlistId != null && versionId != null
      ? `${userEmail}:${playlistId}:${versionId}`
      : null;

  const runGenerate = useCallback(
    async (additionalInstructions?: string) => {
      if (!playlistId || !versionId || !userEmail) return;
      if (generateInFlightRef.current) return;

      const sk = `${userEmail}:${playlistId}:${versionId}`;
      clearDebouncerForKey(sk);

      generateInFlightRef.current = true;
      setIsGenerating(true);
      setError(null);

      try {
        const response = await apiHandler.generateNote({
          playlistId,
          versionId,
          userEmail,
          additionalInstructions,
        });

        setNotesByVersionId((prev) => {
          let nextNotes = [...(prev[versionId] ?? []), response.suggestion];
          if (nextNotes.length > MAX_NOTES_PER_VERSION) {
            nextNotes = nextNotes.slice(-MAX_NOTES_PER_VERSION);
          }
          const newIx = nextNotes.length - 1;
          setIndexByVersionId((ipi) => ({ ...ipi, [versionId]: newIx }));
          return { ...prev, [versionId]: nextNotes };
        });
        setLastPrompt(response.prompt);
        setLastContext(response.context);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        generateInFlightRef.current = false;
        setIsGenerating(false);
      }
    },
    [playlistId, versionId, userEmail, clearDebouncerForKey]
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
      if (!isEnabled || settingsUpsertInflight) return;
      runGenerate(additionalInstructions).catch(() => {});
    },
    [isEnabled, settingsUpsertInflight, runGenerate]
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

  const scheduleRegeneration = useCallback(() => {
    if (!scheduleKey || !playlistId || !versionId || !userEmail) return;
    clearDebouncerForKey(scheduleKey);
    const t = setTimeout(() => {
      debouncersRef.current.delete(scheduleKey);
      runGenerate().catch(() => {});
    }, TRANSCRIPT_DEBOUNCE_MS);
    debouncersRef.current.set(scheduleKey, t);
  }, [
    scheduleKey,
    playlistId,
    versionId,
    userEmail,
    runGenerate,
    clearDebouncerForKey,
  ]);

  const handleTranscriptEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_event: DNAEvent<TranscriptEventPayload>) => {
      if (!isEnabled || !userSettings?.regenerate_on_transcript_update) {
        return;
      }
      scheduleRegeneration();
    },
    [isEnabled, userSettings, scheduleRegeneration]
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

  const list = isEnabled && versionId != null ? notesByVersionId[versionId] ?? [] : [];
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

  const isLoading = isGenerating || settingsUpsertInflight;

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
