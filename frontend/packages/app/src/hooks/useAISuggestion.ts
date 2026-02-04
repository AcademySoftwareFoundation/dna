import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AISuggestionManager,
  type AISuggestionState,
  type UserSettings,
  type DNAEvent,
  type SegmentEventPayload,
} from '@dna/core';
import { apiHandler } from '../api';
import { useSegmentEvents } from './useDNAEvents';

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
}

const managerInstance = new AISuggestionManager(apiHandler, {
  debounceMs: 2000,
});

export function useAISuggestion({
  playlistId,
  versionId,
  userEmail,
  enabled = true,
}: UseAISuggestionOptions): UseAISuggestionResult {
  const isEnabled =
    enabled && playlistId != null && versionId != null && userEmail != null;

  const [state, setState] = useState<AISuggestionState>(() =>
    isEnabled
      ? managerInstance.getSnapshot(playlistId!, versionId!)
      : {
          suggestion: null,
          prompt: null,
          context: null,
          isLoading: false,
          error: null,
        }
  );

  const { data: userSettings } = useQuery<UserSettings | null>({
    queryKey: ['userSettings', userEmail],
    queryFn: () => apiHandler.getUserSettings({ userEmail: userEmail! }),
    enabled: isEnabled,
    staleTime: 60000,
  });

  const prevVersionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      setState({
        suggestion: null,
        prompt: null,
        context: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    const currentState = managerInstance.getSnapshot(playlistId!, versionId!);
    setState(currentState);

    const unsubscribe = managerInstance.onStateChange((pId, vId, newState) => {
      if (pId === playlistId && vId === versionId) {
        setState(newState);
      }
    });

    return unsubscribe;
  }, [playlistId, versionId, isEnabled]);

  useEffect(() => {
    if (!isEnabled || !userSettings?.regenerate_on_version_change) {
      prevVersionRef.current = versionId;
      return;
    }

    if (
      prevVersionRef.current !== null &&
      prevVersionRef.current !== versionId
    ) {
      managerInstance
        .generateSuggestion(playlistId!, versionId!, userEmail!)
        .catch(() => {
          // Error is captured in state
        });
    }

    prevVersionRef.current = versionId;
  }, [versionId, playlistId, userEmail, userSettings, isEnabled]);

  const handleSegmentEvent = useCallback(
    (_event: DNAEvent<SegmentEventPayload>) => {
      if (!isEnabled || !userSettings?.regenerate_on_transcript_update) {
        return;
      }

      managerInstance.scheduleRegeneration(playlistId!, versionId!, userEmail!);
    },
    [playlistId, versionId, userEmail, userSettings, isEnabled]
  );

  useSegmentEvents(handleSegmentEvent, {
    playlistId,
    versionId,
    enabled: isEnabled && !!userSettings?.regenerate_on_transcript_update,
  });

  const regenerate = useCallback(
    (additionalInstructions?: string) => {
      if (!isEnabled) return;

      managerInstance
        .generateSuggestion(
          playlistId!,
          versionId!,
          userEmail!,
          additionalInstructions
        )
        .catch(() => {
          // Error is captured in state
        });
    },
    [playlistId, versionId, userEmail, isEnabled]
  );

  return useMemo(
    () => ({
      suggestion: state.suggestion,
      prompt: state.prompt,
      context: state.context,
      isLoading: state.isLoading,
      error: state.error,
      regenerate,
    }),
    [
      state.suggestion,
      state.prompt,
      state.context,
      state.isLoading,
      state.error,
      regenerate,
    ]
  );
}
