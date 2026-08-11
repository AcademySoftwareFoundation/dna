import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlaylistMetadata, PlaylistMetadataUpdate } from '@dna/core';
import { apiHandler } from '../api';

export function usePlaylistMetadata(playlistId: number | null) {
  return useQuery<PlaylistMetadata | null, Error>({
    queryKey: ['playlistMetadata', playlistId],
    queryFn: () => apiHandler.getPlaylistMetadata({ playlistId: playlistId! }),
    enabled: !!playlistId,
  });
}

export function useUpsertPlaylistMetadata(playlistId: number | null) {
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

export function useSetInReview(playlistId: number | null) {
  const mutation = useUpsertPlaylistMetadata(playlistId);

  const setInReview = (versionId: number) => {
    return mutation.mutateAsync({ in_review: versionId });
  };

  /**
   * Set in review without pinning, clearing any pin left over from an earlier
   * RV session. For picking a version while nothing is driving in review.
   */
  const selectInReview = (versionId: number) => {
    return mutation.mutateAsync({
      in_review: versionId,
      in_review_pinned: false,
    });
  };

  /** Hold in review on this version, ignoring RV's playhead until unpinned. */
  const pinInReview = (versionId: number) => {
    return mutation.mutateAsync({
      in_review: versionId,
      in_review_pinned: true,
    });
  };

  /** Release the pin; the backend snaps in_review back to RV if it's synced. */
  const unpinInReview = () => {
    return mutation.mutateAsync({ in_review_pinned: false });
  };

  return {
    setInReview,
    selectInReview,
    pinInReview,
    unpinInReview,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
