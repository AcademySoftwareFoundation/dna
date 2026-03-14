import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Version } from '@dna/core';
import { apiHandler } from '../api';
import { AddVersionToPlaylistParams } from '@dna/core';

export const useAddVersionToPlaylist = () => {
  const queryClient = useQueryClient();

  return useMutation<Version[], Error, AddVersionToPlaylistParams>({
    mutationFn: (params) => apiHandler.addVersionToPlaylist(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['versions', variables.playlistId],
      });
    },
  });
};
