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
  published: boolean;
  edited: boolean;
  publishedNoteId: number | null;
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
    published: false,
    edited: false,
    publishedNoteId: null,
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
    published: note.published,
    edited: note.edited,
    publishedNoteId: note.published_note_id ?? null,
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
    edited: local.edited,
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
    { data: DraftNoteUpdate },
    { previousDraftNotes: DraftNote[] | undefined }
  >({
    mutationFn: ({ data }) =>
      apiHandler.upsertDraftNote({
        playlistId: playlistId!,
        versionId: versionId!,
        userEmail: userEmail!,
        data,
      }),
    onMutate: async ({ data }) => {
      await queryClient.cancelQueries({ queryKey: ['draftNotes', playlistId] });
      const previousDraftNotes = queryClient.getQueryData<DraftNote[]>(['draftNotes', playlistId]);

      if (previousDraftNotes) {
        queryClient.setQueryData<DraftNote[]>(['draftNotes', playlistId], (old) => {
          if (!old) return old;
          const index = old.findIndex((n) => n.version_id === versionId);
          if (index !== -1) {
            const updated = [...old];
            updated[index] = {
              ...updated[index],
              content: data.content ?? updated[index].content,
              subject: data.subject ?? updated[index].subject,
              to: data.to ?? updated[index].to,
              cc: data.cc ?? updated[index].cc,
              version_status: data.version_status ?? updated[index].version_status,
              edited: data.edited ?? updated[index].edited,
            };
            return updated;
          } else {
            return [
              ...old,
              {
                id: -1,
                _id: 'temp_id',
                version_id: versionId!,
                playlist_id: playlistId!,
                user_id: -1,
                user_email: userEmail!,
                content: data.content ?? '',
                subject: data.subject ?? '',
                to: data.to ?? '',
                cc: data.cc ?? '',
                links: data.links ?? [],
                version_status: data.version_status ?? '',
                published: false,
                edited: data.edited ?? false,
                published_note_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ];
          }
        });
      }

      return { previousDraftNotes };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousDraftNotes) {
        queryClient.setQueryData(['draftNotes', playlistId], context.previousDraftNotes);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['draftNotes', playlistId],
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
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

  const lastContextRef = useRef<{
    playlistId?: number | null;
    versionId?: number | null;
    userEmail?: string | null;
  }>({});

  useEffect(() => {
    if (!isEnabled) {
      setLocalDraft(null);
      lastContextRef.current = {};
      return;
    }

    const currentContext = { playlistId, versionId, userEmail };
    const isContextSwitch =
      playlistId !== lastContextRef.current.playlistId ||
      versionId !== lastContextRef.current.versionId ||
      userEmail !== lastContextRef.current.userEmail;

    if (isContextSwitch) {
      lastContextRef.current = currentContext;
      if (serverDraft) {
        setLocalDraft(backendToLocal(serverDraft));
      } else if (!isLoading) {
        setLocalDraft(createEmptyDraft());
      } else {
        setLocalDraft(null);
      }
    } else {
      // Same context: only update system fields to avoid overwriting user input
      if (serverDraft) {
        setLocalDraft((prev) => {
          if (!prev) return backendToLocal(serverDraft);

          // Only update if system fields changed to avoid unnecessary re-renders
          if (
            prev.published === serverDraft.published &&
            prev.edited === serverDraft.edited &&
            prev.publishedNoteId === (serverDraft.published_note_id ?? null)
          ) {
            return prev;
          }

          return {
            ...prev,
            published: serverDraft.published,
            edited: serverDraft.edited,
            publishedNoteId: serverDraft.published_note_id ?? null,
          };
        });
      }
    }
  }, [serverDraft, isEnabled, isLoading, playlistId, versionId, userEmail]);

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

        // Determine if this update counts as an "edit" that should trigger republishing
        // We only care if meaningful content changed (content, subject, to, cc)
        // System updates (published status) shouldn't trigger this manually usually
        let isEdited = base.edited;

        const meaningfulFields: (keyof LocalDraftNote)[] = ['content', 'subject', 'to', 'cc'];
        const hasMeaningfulChange = meaningfulFields.some(field =>
          updates[field] !== undefined && updates[field] !== base[field]
        );

        if (hasMeaningfulChange) {
          isEdited = true;
        }

        const updated: LocalDraftNote = {
          ...base,
          ...updates,
          edited: isEdited,
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
