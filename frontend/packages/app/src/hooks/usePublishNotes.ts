import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiHandler } from '../api';
import { PublishNotesParams, PublishNotesResponse } from '@dna/core';

export const usePublishNotes = () => {
    const queryClient = useQueryClient();

    return useMutation<PublishNotesResponse, Error, PublishNotesParams>({
        mutationFn: (params) => apiHandler.publishNotes(params),
        onSuccess: (_, variables) => {
            // Invalidate draft notes query to refresh the list (and potentially show published status)
            queryClient.invalidateQueries({
                queryKey: ['draftNotes', variables.playlistId],
            });
            // Also invalidate all draft notes in case we are viewing a different slice?
            // The current draft note view usually uses ['draftNotes', playlistId, versionId]
            // or ['allDraftNotes', playlistId, versionId].
            // The backend publishes for the whole playlist.
            // So we should invalidate heavily to be safe.
            queryClient.invalidateQueries({ queryKey: ['draftNotes'] });
            queryClient.invalidateQueries({ queryKey: ['allDraftNotes'] });
        },
    });
};
