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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['playlistMetadata', playlistId],
      });
    },
  });
}

export function useSetInReview(playlistId: string | null) {
  const mutation = useUpsertPlaylistMetadata(playlistId);

  const setInReview = (versionId: string) => {
    return mutation.mutateAsync({ in_review: versionId });
  };

  return {
    setInReview,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useInReviewChangedEvents(playlistId: string | null) {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    (event: DNAEvent<InReviewChangedEventPayload>) => {
      if (!playlistId || event.payload.playlist_id !== playlistId) {
        return;
      }

      const queryKey = ['playlistMetadata', playlistId];
      const existing = queryClient.getQueryData<PlaylistMetadata | null>(
        queryKey
      );
      if (existing) {
        queryClient.setQueryData<PlaylistMetadata | null>(queryKey, {
          ...existing,
          in_review: event.payload.in_review,
        });
        return;
      }

      void queryClient.invalidateQueries({ queryKey });
    },
    [playlistId, queryClient]
  );

  useEventSubscription<InReviewChangedEventPayload>(
    'playlist.in_review_changed',
    handleEvent,
    { enabled: !!playlistId }
  );
}
