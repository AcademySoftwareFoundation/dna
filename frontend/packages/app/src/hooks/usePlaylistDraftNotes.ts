import { useQuery } from '@tanstack/react-query';
import { DraftNote } from '@dna/core';
import { apiHandler } from '../api';

export function usePlaylistDraftNotes(
    playlistId?: number | null
) {
    const isEnabled = playlistId != null;

    return useQuery<DraftNote[], Error>({
        queryKey: ['draftNotes', playlistId],
        queryFn: () =>
            apiHandler.getPlaylistDraftNotes(playlistId!),
        enabled: isEnabled,
        staleTime: 1000 * 60, // 1 minute
    });
}
