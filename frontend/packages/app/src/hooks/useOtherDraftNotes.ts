import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DraftNote } from '@dna/core';
import { apiHandler } from '../api';

export interface UseOtherDraftNotesParams {
  playlistId: number | null | undefined;
  versionId: number | null | undefined;
  currentUserEmail: string | null | undefined;
}

export interface UseOtherDraftNotesResult {
  otherNotes: DraftNote[];
  isLoading: boolean;
  deleteOtherNote: (userEmail: string) => Promise<void>;
  isDeleting: boolean;
}

export function useOtherDraftNotes({
  playlistId,
  versionId,
  currentUserEmail,
}: UseOtherDraftNotesParams): UseOtherDraftNotesResult {
  const queryClient = useQueryClient();

  const isEnabled =
    playlistId != null && versionId != null && currentUserEmail != null;

  const queryKey = ['allDraftNotes', playlistId, versionId];

  const { data: allNotes = [], isLoading } = useQuery<DraftNote[], Error>({
    queryKey,
    queryFn: () =>
      apiHandler.getAllDraftNotes({
        playlistId: playlistId!,
        versionId: versionId!,
      }),
    enabled: isEnabled,
    staleTime: 30000,
  });

  const deleteMutation = useMutation<boolean, Error, string>({
    mutationFn: (userEmail: string) =>
      apiHandler.deleteDraftNote({
        playlistId: playlistId!,
        versionId: versionId!,
        userEmail,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const otherNotes = allNotes.filter(
    (note) => note.user_email !== currentUserEmail
  );

  const deleteOtherNote = async (userEmail: string) => {
    await deleteMutation.mutateAsync(userEmail);
  };

  return {
    otherNotes,
    isLoading,
    deleteOtherNote,
    isDeleting: deleteMutation.isPending,
  };
}
