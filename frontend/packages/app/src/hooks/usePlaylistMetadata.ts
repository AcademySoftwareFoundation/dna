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

  return {
    setInReview,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
