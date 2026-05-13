import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DraftNote, DraftNoteUpdate, SearchResult } from '@dna/core';
import { apiHandler } from '../api';

export interface LocalDraftNote {
  content: string;
  subject: string;
  to: SearchResult[];
  cc: SearchResult[];
  links: SearchResult[];
  versionStatus: string;
  published: boolean;
  edited: boolean;
  publishedNoteId: number | null;
  attachmentIds: string[];
}

export interface UseDraftNoteParams {
  playlistId: number | null | undefined;
  versionId: number | null | undefined;
  userEmail: string | null | undefined;
  currentVersion?: SearchResult | null;
  submitter?: SearchResult | null;
}

export interface UseDraftNoteResult {
  draftNote: LocalDraftNote | null;
  updateDraftNote: (updates: Partial<LocalDraftNote>) => void;
  saveAttachmentIds: (ids: string[]) => Promise<void>;
  clearDraftNote: () => void;
  flushDebouncedSave: () => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
}

function createEmptyDraft(
  currentVersion?: SearchResult | null,
  submitter?: SearchResult | null
): LocalDraftNote {
  return {
    content: '',
    subject: '',
    to: submitter ? [submitter] : [],
    cc: [],
    links: currentVersion ? [currentVersion] : [],
    versionStatus: '',
    published: false,
    edited: false,
    publishedNoteId: null,
    attachmentIds: [],
  };
}

// Parse JSON array from string, with fallback for legacy comma-separated format
function parseEntitiesFromString(str: string): SearchResult[] {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fallback: treat as comma-separated names (legacy format)
    // Can't recover full entity data, so return empty
  }
  return [];
}

function backendToLocal(note: DraftNote): LocalDraftNote {
  // Convert links from DraftNoteLink[] to SearchResult[]
  const links: SearchResult[] = (note.links || []).map((link) => ({
    type: link.entity_type,
    id: link.entity_id,
    name: link.entity_name || '',
  }));

  return {
    content: note.content,
    subject: note.subject,
    to: parseEntitiesFromString(note.to),
    cc: parseEntitiesFromString(note.cc),
    links,
    versionStatus: note.version_status,
    published: note.published,
    edited: note.edited,
    publishedNoteId: note.published_note_id ?? null,
    attachmentIds: note.attachment_ids ?? [],
  };
}

function localToUpdate(local: LocalDraftNote): DraftNoteUpdate {
  // Store to/cc as JSON strings to preserve entity data
  const toJson = local.to.length > 0 ? JSON.stringify(local.to) : '';
  const ccJson = local.cc.length > 0 ? JSON.stringify(local.cc) : '';

  // Convert links to DraftNoteLink format (include name so it persists)
  const links = local.links.map((entity) => ({
    entity_type: entity.type,
    entity_id: entity.id,
    entity_name: entity.name,
  }));

  return {
    content: local.content,
    subject: local.subject,
    to: toJson,
    cc: ccJson,
    links,
    version_status: local.versionStatus,
    edited: local.edited,
    // attachment_ids are managed exclusively by saveAttachmentIds — omitting here
    // prevents a race condition where a post-publish content edit restores
    // attachment_ids that the server already cleared during publish
  };
}

export function useDraftNote({
  playlistId,
  versionId,
  userEmail,
  currentVersion,
  submitter,
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
              attachment_ids: data.attachment_ids ?? updated[index].attachment_ids,
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
        setLocalDraft(createEmptyDraft(currentVersion, submitter));
      } else {
        setLocalDraft(null);
      }
    } else {
      // Same context: only update system fields to avoid overwriting user input
      // (entity names in pills are only in local state, not on the server)
      if (serverDraft) {
        setLocalDraft((prev) => {
          if (!prev) return backendToLocal(serverDraft);

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
      } else if (!isLoading) {
        // Loading finished with no server draft — initialise empty if still null
        setLocalDraft((prev) => prev ?? createEmptyDraft(currentVersion, submitter));
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
        const base = prev ?? createEmptyDraft(currentVersion, submitter);

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
    [isEnabled, upsertMutation, currentVersion, submitter]
  );

  const saveAttachmentIds = useCallback(
    async (ids: string[]) => {
      if (!isEnabled) return;
      const addingAttachments = ids.length > 0;
      setLocalDraft((prev) => {
        const base = prev ?? createEmptyDraft(currentVersion, submitter);
        const edited = base.edited || addingAttachments;
        return { ...base, attachmentIds: ids, edited };
      });
      // Patch pending debounce data so a late-firing debounce doesn't overwrite with []
      if (pendingDataRef.current) {
        pendingDataRef.current = {
          ...pendingDataRef.current,
          attachmentIds: ids,
          ...(addingAttachments ? { edited: true } : {}),
        };
      }
      await upsertMutation.mutateAsync({
        data: {
          attachment_ids: ids,
          ...(addingAttachments ? { edited: true } : {}),
        },
      });
    },
    [isEnabled, upsertMutation, currentVersion, submitter]
  );

  const clearDraftNote = useCallback(() => {
    if (!isEnabled) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingDataRef.current = null;
    deleteMutation.mutate();
    setLocalDraft(createEmptyDraft(currentVersion, submitter));
  }, [isEnabled, deleteMutation, currentVersion, submitter]);

  const flushDebouncedSave = useCallback(async () => {
    if (!isEnabled) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingDataRef.current) {
      const data = localToUpdate(pendingDataRef.current);
      pendingMutationRef.current = upsertMutation.mutateAsync({ data });
      pendingDataRef.current = null;
      await pendingMutationRef.current;
    }
  }, [isEnabled, upsertMutation]);

  return {
    draftNote: localDraft,
    updateDraftNote,
    saveAttachmentIds,
    clearDraftNote,
    flushDebouncedSave,
    isSaving: upsertMutation.isPending || deleteMutation.isPending,
    isLoading,
  };
}
