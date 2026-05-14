import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useIsMutating } from '@tanstack/react-query';
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

type NoteSnapshot = {
  suggestion: string;
  prompt: string | null;
  context: string | null;
};

const MAX_NOTES_PER_VERSION = 100;

export function useAISuggestion({
  playlistId,
  versionId,
  userEmail,
  enabled = true,
}: UseAISuggestionOptions): UseAISuggestionResult {
  const isEnabled =
    enabled && playlistId != null && versionId != null && userEmail != null;

  const [snapshotsByVersionId, setSnapshotsByVersionId] = useState<
    Record<number, NoteSnapshot[]>
  >({});
  const [indexByVersionId, setIndexByVersionId] = useState<
    Record<number, number>
  >({});

  const prevWasLoadingRef = useRef(false);

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

  useEffect(() => {
    if (!isEnabled || playlistId == null || versionId == null) {
      prevWasLoadingRef.current = false;
      return;
    }

    const full = aiSuggestionManager.getFullState(playlistId, versionId);
    prevWasLoadingRef.current = full.isLoading;

    setSnapshotsByVersionId((prev) => {
      if (prev[versionId]?.length) return prev;
      if (!full.suggestion) return prev;
      return {
        ...prev,
        [versionId]: [
          {
            suggestion: full.suggestion,
            prompt: full.prompt,
            context: full.context,
          },
        ],
      };
    });

    const unsubscribe = aiSuggestionManager.onStateChange((pId, vId, newState) => {
      if (pId !== playlistId || vId !== versionId) return;

      const wasLoading = prevWasLoadingRef.current;
      prevWasLoadingRef.current = newState.isLoading;

      const completesGeneration =
        wasLoading &&
        !newState.isLoading &&
        newState.suggestion != null &&
        newState.error == null;

      if (completesGeneration) {
        setSnapshotsByVersionId((prevSnap) => {
          const existing = [...(prevSnap[versionId] ?? [])];
          const sug = newState.suggestion as string;
          const pr = newState.prompt;
          const cx = newState.context;
          const tail =
            existing.length > 0 ? existing[existing.length - 1] : undefined;
          if (
            tail?.suggestion === sug &&
            tail?.prompt === pr &&
            tail?.context === cx
          ) {
            return prevSnap;
          }

          existing.push({
            suggestion: sug,
            prompt: pr,
            context: cx,
          });

          let trimmed = existing;
          if (trimmed.length > MAX_NOTES_PER_VERSION) {
            trimmed = trimmed.slice(-MAX_NOTES_PER_VERSION);
          }
          const newIx = trimmed.length - 1;
          setIndexByVersionId((ipi) => ({ ...ipi, [versionId]: newIx }));

          return { ...prevSnap, [versionId]: trimmed };
        });
      }
    });

    return unsubscribe;
  }, [playlistId, versionId, isEnabled]);

  useEffect(() => {
    setIndexByVersionId((prev) => {
      if (!isEnabled || versionId == null) return prev;
      const list = snapshotsByVersionId[versionId];
      if (!list?.length) return prev;
      const i = prev[versionId];
      if (i === undefined) return { ...prev, [versionId]: list.length - 1 };
      return { ...prev, [versionId]: Math.min(i, list.length - 1) };
    });
  }, [isEnabled, versionId, snapshotsByVersionId]);

  const regenerate = useCallback(
    (additionalInstructions?: string) => {
      if (
        !isEnabled ||
        settingsUpsertInflight ||
        playlistId == null ||
        versionId == null ||
        userEmail == null
      ) {
        return;
      }

      aiSuggestionManager
        .generateSuggestion(
          playlistId,
          versionId,
          userEmail,
          additionalInstructions
        )
        .catch(() => {});
    },
    [
      isEnabled,
      settingsUpsertInflight,
      playlistId,
      versionId,
      userEmail,
    ]
  );

  useEffect(() => {
    if (!isEnabled || !userSettings?.regenerate_on_version_change) {
      prevVersionRef.current = versionId;
      return;
    }

    if (
      playlistId != null &&
      versionId != null &&
      userEmail != null &&
      prevVersionRef.current !== null &&
      prevVersionRef.current !== versionId
    ) {
      aiSuggestionManager
        .generateSuggestion(playlistId, versionId, userEmail)
        .catch(() => {});
    }

    prevVersionRef.current = versionId;
  }, [
    versionId,
    playlistId,
    userEmail,
    userSettings,
    isEnabled,
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
      const list = snapshotsByVersionId[versionId] ?? [];
      if (!list.length) return;
      const cur = indexByVersionId[versionId] ?? list.length - 1;
      const next = cur + delta;
      if (next < 0 || next >= list.length) return;
      setIndexByVersionId((prev) => ({ ...prev, [versionId]: next }));
    },
    [isEnabled, versionId, snapshotsByVersionId, indexByVersionId]
  );

  const goPreviousVersion = useCallback(
    () => navigateVersion(-1),
    [navigateVersion]
  );
  const goNextVersion = useCallback(
    () => navigateVersion(1),
    [navigateVersion]
  );

  const mgrState =
    isEnabled && playlistId != null && versionId != null
      ? aiSuggestionManager.getFullState(playlistId, versionId)
      : null;

  const list =
    isEnabled && versionId != null
      ? (snapshotsByVersionId[versionId] ?? [])
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
  const activeSnapshot =
    isEnabled && activeIndex >= 0 && list[activeIndex] != null
      ? list[activeIndex]!
      : null;

  const suggestion = activeSnapshot?.suggestion ?? null;
  const viewingLatest =
    historyCount > 0 && activeIndex === historyCount - 1 && activeIndex >= 0;
  const prompt = viewingLatest ? (activeSnapshot?.prompt ?? null) : null;
  const context = viewingLatest ? (activeSnapshot?.context ?? null) : null;

  const isLoading =
    (mgrState?.isLoading ?? false) ||
    settingsUpsertInflight;
  const error = mgrState?.error ?? null;

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
