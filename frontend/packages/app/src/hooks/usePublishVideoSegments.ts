import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiHandler } from '../api';
import type {
  PublishVideoSegmentsParams,
  PublishVideoSegmentsResponse,
} from '@dna/core';

export const usePublishVideoSegments = () => {
  const queryClient = useQueryClient();

  return useMutation<
    PublishVideoSegmentsResponse,
    Error,
    PublishVideoSegmentsParams
  >({
    mutationFn: (params) => apiHandler.publishVideoSegments(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          'publishedVideoSegments',
          variables.playlistId,
          variables.request.version_id,
        ],
      });
    },
  });
};
