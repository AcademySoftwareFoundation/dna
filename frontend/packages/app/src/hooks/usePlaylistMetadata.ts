import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DNAEvent,
  InReviewChangedEventPayload,
  PlaylistMetadata,
  PlaylistMetadataUpdate,
} from '@dna/core';
import { apiHandler } from '../api';
import { useEventSubscription } from './useDNAEvents';

export function usePlaylistMetadata(playlistId: string | null) {
  return useQuery<PlaylistMetadata | null, Error>({
    queryKey: ['playlistMetadata', playlistId],
    queryFn: () => apiHandler.getPlaylistMetadata({ playlistId: playlistId! }),
    enabled: !!playlistId,
  });
}

export function useUpsertPlaylistMetadata(playlistId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<PlaylistMetadata, Error, PlaylistMetadataUpdate>({
    mutationFn: (data: PlaylistMetadataUpdate) =>
      apiHandler.upsertPlaylistMetadata({ playlistId: playlistId!, data }),
    // The response is the full metadata document, so write it straight into
    // the cache: the UI settles when the request does, rather than whenever the
    // in_review_changed event or a refetch happens to land.
    onSuccess: (saved) => {
      queryClient.setQueryData(['playlistMetadata', playlistId], saved);
    },
  });
}

export function useSetInReview(playlistId: string | null) {
  const mutation = useUpsertPlaylistMetadata(playlistId);

  /**
   * Set the in-review version. Pass `unpin` to take over from a pinned version;
   * without it the backend rejects the move with a 409.
   */
  const setInReview = (versionId: string, unpin = false) => {
    return mutation.mutateAsync(
      unpin
        ? { in_review: versionId, in_review_pinned: false }
        : { in_review: versionId }
    );
  };

  /**
   * Pin (or unpin) the in-review version. Pinning also sends the version id so
   * it lands on the version the user clicked even if in-review moved meanwhile.
   */
  const setInReviewPinned = (versionId: string, pinned: boolean) => {
    return mutation.mutateAsync(
      pinned
        ? { in_review: versionId, in_review_pinned: true }
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

export function useInReviewChangedEvents(
  playlistId: string | readonly string[] | null
) {
  const queryClient = useQueryClient();
  const playlistKey =
    playlistId == null
      ? ''
      : typeof playlistId === 'string'
        ? playlistId
        : playlistId.join('\0');

  const handleEvent = useCallback(
    (event: DNAEvent<InReviewChangedEventPayload>) => {
      const ids = playlistKey ? playlistKey.split('\0') : [];
      if (!ids.includes(event.payload.playlist_id)) {
        return;
      }

      const targetId = event.payload.playlist_id;
      const queryKey = ['playlistMetadata', targetId];
      const existing = queryClient.getQueryData<PlaylistMetadata | null>(
        queryKey
      );
      if (existing) {
        queryClient.setQueryData<PlaylistMetadata | null>(queryKey, {
          ...existing,
          in_review: event.payload.in_review,
          in_review_pinned:
            event.payload.in_review_pinned ?? existing.in_review_pinned,
        });
        return;
      }

      void queryClient.invalidateQueries({ queryKey });
    },
    [playlistKey, queryClient]
  );

  useEventSubscription<InReviewChangedEventPayload>(
    'playlist.in_review_changed',
    handleEvent,
    { enabled: playlistKey.length > 0 }
  );
}
