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
        // 之後若有 "published transcripts" 列表的 query，這裡可以加對應 key。
        // 目前 V1 沒有列表 UI，只需要單純讓外面知道 mutate 成功。
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
