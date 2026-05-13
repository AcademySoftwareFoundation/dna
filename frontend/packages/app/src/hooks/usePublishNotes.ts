import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiHandler } from '../api';
import { PublishNotesParams, PublishNotesResponse } from '@dna/core';

export const usePublishNotes = () => {
    const queryClient = useQueryClient();

    return useMutation<PublishNotesResponse, Error, PublishNotesParams>({
        mutationFn: (params) => apiHandler.publishNotes(params),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['draftNotes', variables.playlistId],
            });
            queryClient.invalidateQueries({ queryKey: ['draftNotes'] });
            queryClient.invalidateQueries({ queryKey: ['allDraftNotes'] });
            queryClient.invalidateQueries({ queryKey: ['draftNote'] });
        },
    });
};
