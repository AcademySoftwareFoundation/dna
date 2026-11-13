import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DNAEvent,
  Session,
  SessionInReviewChangedEventPayload,
} from '@dna/core';
import { apiHandler } from '../api';
import { useToast } from '../contexts/ToastContext';
import { useNomenclature } from '../nomenclature';
import { useEventSubscription } from './useDNAEvents';

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 409
  );
}

export function useSessionInReviewEvents(sessionId: string | null) {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    (event: DNAEvent<SessionInReviewChangedEventPayload>) => {
      if (!sessionId || event.payload.session_id !== sessionId) {
        return;
      }
      queryClient.setQueryData<Session | undefined>(
        ['session', sessionId],
        (current) =>
          current
            ? {
                ...current,
                in_review_playlist_id: event.payload.in_review_playlist_id,
                in_review_version_id: event.payload.in_review_version_id,
                in_review_pinned: event.payload.in_review_pinned,
              }
            : current
      );
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({
        queryKey: ['sessionPlaylists', sessionId],
      });
    },
    [sessionId, queryClient]
  );

  useEventSubscription<SessionInReviewChangedEventPayload>(
    'session.in_review_changed',
    handleEvent,
    { enabled: !!sessionId }
  );
}

/**
 * Set / pin in-review on a DNA session for the active playlist.
 */
export function useSessionSetInReview(
  sessionId: string | null,
  activePlaylistId: string | null
) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const t = useNomenclature();

  useSessionInReviewEvents(sessionId);

  const mutation = useMutation({
    mutationFn: (data: {
      in_review_playlist_id?: string | null;
      in_review_version_id?: string | null;
      in_review_pinned?: boolean;
      clear_in_review?: boolean;
    }) =>
      apiHandler.updateSessionInReview({
        sessionId: sessionId!,
        data,
      }),
    onSuccess: (session) => {
      queryClient.setQueryData(['session', session.id], session);
      queryClient.setQueryData(
        ['sessionPlaylists', session.id],
        {
          session_id: session.id,
          playlist_ids: session.playlist_ids ?? [],
        }
      );
    },
  });

  const setInReview = async (versionId: string, unpin = false) => {
    if (!sessionId || !activePlaylistId) return;
    try {
      return await mutation.mutateAsync(
        unpin
          ? {
              in_review_playlist_id: activePlaylistId,
              in_review_version_id: versionId,
              in_review_pinned: false,
            }
          : {
              in_review_playlist_id: activePlaylistId,
              in_review_version_id: versionId,
            }
      );
    } catch (error) {
      if (isConflict(error)) {
        showToast({
          type: 'error',
          title: 'In review is pinned',
          description: `Unpin it before moving in review on this ${t.session.lower}.`,
        });
        return;
      }
      throw error;
    }
  };

  const setInReviewPinned = async (versionId: string, pinned: boolean) => {
    if (!sessionId || !activePlaylistId) return;
    return mutation.mutateAsync(
      pinned
        ? {
            in_review_playlist_id: activePlaylistId,
            in_review_version_id: versionId,
            in_review_pinned: true,
          }
        : { in_review_pinned: false }
    );
  };

  return {
    setInReview,
    setInReviewPinned,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
