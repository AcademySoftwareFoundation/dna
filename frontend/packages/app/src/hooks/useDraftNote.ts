import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DraftNote, DraftNoteUpdate } from '@dna/core';
import { apiHandler } from '../api';

export interface LocalDraftNote {
  content: string;
  subject: string;
  to: string;
  cc: string;
  linksText: string;
  versionStatus: string;
}

export interface UseDraftNoteParams {
  playlistId: number | null | undefined;
  versionId: number | null | undefined;
  userEmail: string | null | undefined;
}

export interface UseDraftNoteResult {
  draftNote: LocalDraftNote | null;
  updateDraftNote: (updates: Partial<LocalDraftNote>) => void;
  clearDraftNote: () => void;
  isSaving: boolean;
  isLoading: boolean;
}

function createEmptyDraft(): LocalDraftNote {
  return {
    content: '',
    subject: '',
    to: '',
    cc: '',
    linksText: '',
    versionStatus: '',
  };
}

function backendToLocal(note: DraftNote): LocalDraftNote {
  return {
    content: note.content,
    subject: note.subject,
    to: note.to,
    cc: note.cc,
    linksText: '',
    versionStatus: note.version_status,
  };
}

function localToUpdate(local: LocalDraftNote): DraftNoteUpdate {
  return {
    content: local.content,
    subject: local.subject,
    to: local.to,
    cc: local.cc,
    links: [],
    version_status: local.versionStatus,
  };
}

export function useDraftNote({
  playlistId,
  versionId,
  userEmail,
}: UseDraftNoteParams): UseDraftNoteResult {
  const queryClient = useQueryClient();
  const [localDraft, setLocalDraft] = useState<LocalDraftNote | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMutationRef = useRef<Promise<DraftNote> | null>(null);
  const pendingDataRef = useRef<LocalDraftNote | null>(null);

  const isEnabled =
    playlistId != null && versionId != null && userEmail != null;

  const queryKey = ['draftNote', playlistId, versionId, userEmail];

  const { data: serverDraft, isLoading } = useQuery<DraftNote | null, Error>({
    queryKey,
    queryFn: () =>
      apiHandler.getDraftNote({
        playlistId: playlistId!,
        versionId: versionId!,
        userEmail: userEmail!,
      }),
    enabled: isEnabled,
    staleTime: 0,
  });

  const upsertMutation = useMutation<
    DraftNote,
    Error,
    { data: DraftNoteUpdate }
  >({
    mutationFn: ({ data }) =>
      apiHandler.upsertDraftNote({
        playlistId: playlistId!,
        versionId: versionId!,
        userEmail: userEmail!,
        data,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      queryClient.invalidateQueries({
        queryKey: ['draftNotes', playlistId],
      });
    },
  });

  const deleteMutation = useMutation<boolean, Error, void>({
    mutationFn: () =>
      apiHandler.deleteDraftNote({
        playlistId: playlistId!,
        versionId: versionId!,
        userEmail: userEmail!,
      }),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
    },
  });

  useEffect(() => {
    if (!isEnabled) {
      setLocalDraft(null);
      return;
    }
    if (serverDraft) {
      setLocalDraft(backendToLocal(serverDraft));
    } else if (serverDraft === null && !isLoading) {
      setLocalDraft(createEmptyDraft());
    }
  }, [serverDraft, isEnabled, isLoading]);

  useEffect(() => {
    const flushPending = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingDataRef.current && isEnabled) {
        const data = localToUpdate(pendingDataRef.current);
        pendingMutationRef.current = upsertMutation.mutateAsync({ data });
        pendingDataRef.current = null;
      }
    };

    return () => {
      flushPending();
    };
  }, [playlistId, versionId, userEmail, isEnabled]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingDataRef.current || pendingMutationRef.current) {
        e.preventDefault();
        if (pendingDataRef.current && isEnabled) {
          const data = localToUpdate(pendingDataRef.current);
          navigator.sendBeacon?.(
            `${import.meta.env.VITE_API_BASE_URL}/playlists/${playlistId}/versions/${versionId}/draft-notes/${encodeURIComponent(userEmail!)}`,
            JSON.stringify(data)
          );
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [playlistId, versionId, userEmail, isEnabled]);

  const updateDraftNote = useCallback(
    (updates: Partial<LocalDraftNote>) => {
      if (!isEnabled) return;

      setLocalDraft((prev) => {
        const base = prev ?? createEmptyDraft();
        const updated: LocalDraftNote = {
          ...base,
          ...updates,
        };
        pendingDataRef.current = updated;

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          if (pendingDataRef.current) {
            const data = localToUpdate(pendingDataRef.current);
            pendingMutationRef.current = upsertMutation.mutateAsync({ data });
            pendingDataRef.current = null;
          }
        }, 300);

        return updated;
      });
    },
    [isEnabled, upsertMutation]
  );

  const clearDraftNote = useCallback(() => {
    if (!isEnabled) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingDataRef.current = null;
    deleteMutation.mutate();
    setLocalDraft(createEmptyDraft());
  }, [isEnabled, deleteMutation]);

  return {
    draftNote: localDraft,
    updateDraftNote,
    clearDraftNote,
    isSaving: upsertMutation.isPending || deleteMutation.isPending,
    isLoading,
  };
}
