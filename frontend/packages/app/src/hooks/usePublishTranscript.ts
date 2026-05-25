import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiHandler } from '../api';
import type {
  PublishTranscriptParams,
  PublishTranscriptResponse,
} from '@dna/core';

export const usePublishTranscript = () => {
  const queryClient = useQueryClient();

  return useMutation<PublishTranscriptResponse, Error, PublishTranscriptParams>(
    {
      mutationFn: (params) => apiHandler.publishTranscript(params),
      onSuccess: (_, variables) => {
        // Invalidate the published-transcripts key so any future list or
        // detail query picks up the change.
        queryClient.invalidateQueries({
          queryKey: [
            'publishedTranscripts',
            variables.playlistId,
            variables.request.version_id,
          ],
        });
      },
    }
  );
};
