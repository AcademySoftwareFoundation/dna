import { useQueryClient, useQueries } from '@tanstack/react-query';
import { findInReviewHolders, type PlaylistMetadata } from '@dna/core';
import { apiHandler } from '../api';
import { useToast } from '../contexts/ToastContext';
import { useInReviewChangedEvents, useSetInReview } from './usePlaylistMetadata';

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 409
  );
}

export function useSessionPlaylistMetadata(playlistIds: readonly string[]) {
  return useQueries({
    queries: playlistIds.map((playlistId) => ({
      queryKey: ['playlistMetadata', playlistId],
      queryFn: () => apiHandler.getPlaylistMetadata({ playlistId }),
      enabled: playlistIds.length > 0,
    })),
  });
}

/**
 * Set in-review for the active playlist, clearing it from every other playlist
 * in the session first. A pinned holder returns 409 and is left in place.
 */
export function useSessionSetInReview(
  activePlaylistId: string | null,
  sessionPlaylistIds: readonly string[] | null
) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const active = useSetInReview(activePlaylistId);
  const inSession = !!sessionPlaylistIds && sessionPlaylistIds.length > 0;

  useInReviewChangedEvents(inSession ? sessionPlaylistIds : null);

  const loadMetadata = async (playlistId: string) => {
    const cached = queryClient.getQueryData<PlaylistMetadata | null>([
      'playlistMetadata',
      playlistId,
    ]);
    if (cached !== undefined) return cached;
    return queryClient.fetchQuery({
      queryKey: ['playlistMetadata', playlistId],
      queryFn: () => apiHandler.getPlaylistMetadata({ playlistId }),
    });
  };

  const setInReview = async (versionId: string, unpin = false) => {
    if (inSession && activePlaylistId && sessionPlaylistIds) {
      const metadataList = (
        await Promise.all(sessionPlaylistIds.map((id) => loadMetadata(id)))
      ).filter((item): item is PlaylistMetadata => !!item);
      const holders = findInReviewHolders(metadataList, activePlaylistId);
      const ordered = [
        ...holders.filter((holder) => !holder.in_review_pinned),
        ...holders.filter((holder) => holder.in_review_pinned),
      ];
      for (const holder of ordered) {
        try {
          const cleared = await apiHandler.upsertPlaylistMetadata({
            playlistId: holder.playlist_id,
            data: { clear_in_review: true },
          });
          queryClient.setQueryData(
            ['playlistMetadata', holder.playlist_id],
            cleared
          );
        } catch (error) {
          if (isConflict(error)) {
            showToast({
              type: 'error',
              title: 'In review is pinned',
              description:
                'Unpin it on the other playlist before moving in review.',
            });
            return;
          }
          throw error;
        }
      }
    }
    return active.setInReview(versionId, unpin);
  };

  return {
    setInReview,
    setInReviewPinned: active.setInReviewPinned,
    isLoading: active.isLoading,
    error: active.error,
  };
}
