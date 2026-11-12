import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlaylistMetadata, PlaylistMetadataUpdate } from '@dna/core';
import { apiHandler } from '../api';

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
    onSuccess: (saved) => {
      queryClient.setQueryData(['playlistMetadata', playlistId], saved);
    },
  });
}
