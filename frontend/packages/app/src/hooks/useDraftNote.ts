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
  saveVersionStatus: (status: string) => Promise<void>;
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

export function backendToLocal(note: DraftNote): LocalDraftNote {
  // Convert links from DraftNoteLink[] to SearchResult[]
  const links: SearchResult[] = (note.links || []).map((link) => ({
    type: link.entity_type,
    id: link.entity_id,
    name: link.entity_name || '',
  }));

  return {
    content: note.content ?? '',
    subject: note.subject ?? '',
    to: parseEntitiesFromString(note.to ?? ''),
    cc: parseEntitiesFromString(note.cc ?? ''),
    links,
    versionStatus: note.version_status ?? '',
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
    initialData: () => {
      const allDrafts = queryClient.getQueryData<DraftNote[]>(['draftNotes', playlistId]);
      return allDrafts?.find(
        (n) => n.version_id === versionId && n.user_email === userEmail
      );
    },
  });

  const upsertMutation = useMutation<
    DraftNote,
    Error,
    { data: DraftNoteUpdate },
    {
      previousDraftNotes: DraftNote[] | undefined;
      previousDraftNote: DraftNote | null | undefined;
      targetQueryKey: (string | number | null | undefined)[];
      targetPlaylistId: number | null | undefined;
      targetVersionId: number | null | undefined;
    }
  >({
    mutationFn: ({ data }) =>
      apiHandler.upsertDraftNote({
        playlistId: playlistId!,
        versionId: versionId!,
        userEmail: userEmail!,
        data,
      }),
    onMutate: async ({ data }) => {
      const targetQueryKey = ['draftNote', playlistId, versionId, userEmail];
      const playlistQueryKey = ['draftNotes', playlistId];

      await Promise.all([
        queryClient.cancelQueries({ queryKey: targetQueryKey }),
        queryClient.cancelQueries({ queryKey: playlistQueryKey }),
      ]);

      const previousDraftNote = queryClient.getQueryData<DraftNote | null>(targetQueryKey);
      const previousDraftNotes = queryClient.getQueryData<DraftNote[]>(playlistQueryKey);

      // Optimistically update the single draft note cache
      queryClient.setQueryData<DraftNote | null>(targetQueryKey, (old) => {
        if (!old) {
          return {
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
            attachment_ids: data.attachment_ids ?? [],
          };
        }
        return {
          ...old,
          content: data.content ?? old.content,
          subject: data.subject ?? old.subject,
          to: data.to ?? old.to,
          cc: data.cc ?? old.cc,
          links: data.links ?? old.links,
          version_status: data.version_status ?? old.version_status,
          edited: data.edited ?? old.edited,
          attachment_ids: data.attachment_ids ?? old.attachment_ids,
        };
      });

      // Optimistically update the playlist draft notes list cache
      queryClient.setQueryData<DraftNote[]>(playlistQueryKey, (old) => {
        const list = old ? [...old] : [];
        const index = list.findIndex(
          (n) => n.version_id === versionId && n.user_email === userEmail
        );
        if (index !== -1) {
          list[index] = {
            ...list[index],
            content: data.content ?? list[index].content,
            subject: data.subject ?? list[index].subject,
            to: data.to ?? list[index].to,
            cc: data.cc ?? list[index].cc,
            links: data.links ?? list[index].links,
            version_status: data.version_status ?? list[index].version_status,
            edited: data.edited ?? list[index].edited,
            attachment_ids: data.attachment_ids ?? list[index].attachment_ids,
          };
        } else {
          list.push({
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
            attachment_ids: data.attachment_ids ?? [],
          });
        }
        return list;
      });

      return {
        previousDraftNotes,
        previousDraftNote,
        targetQueryKey,
        targetPlaylistId: playlistId,
        targetVersionId: versionId,
      };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousDraftNotes !== undefined) {
        queryClient.setQueryData(['draftNotes', context.targetPlaylistId], context.previousDraftNotes);
      }
      if (context?.previousDraftNote !== undefined) {
        queryClient.setQueryData(context.targetQueryKey, context.previousDraftNote);
      }
      if (context?.targetVersionId === versionId) {
        if (context.previousDraftNote) {
          setLocalDraft(backendToLocal(context.previousDraftNote));
        } else {
          setLocalDraft(createEmptyDraft(currentVersion, submitter));
        }
      }
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.targetPlaylistId != null) {
        queryClient.invalidateQueries({
          queryKey: ['draftNotes', context.targetPlaylistId],
        });
      }
    },
    onSuccess: (result, _variables, context) => {
      const qk = context?.targetQueryKey ?? queryKey;
      queryClient.setQueryData(qk, result);
      if (context?.targetPlaylistId != null) {
        queryClient.setQueryData<DraftNote[]>(
          ['draftNotes', context.targetPlaylistId],
          (old) => {
            if (!old) return old;
            const index = old.findIndex(
              (n) => n.version_id === result.version_id && n.user_email === result.user_email
            );
            if (index !== -1) {
              const updated = [...old];
              updated[index] = result;
              return updated;
            }
            return [...old, result];
          }
        );
      }
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
      // Same context: update system fields, and note fields (body, subject,
      // to/cc, links) when this instance has no unsaved edits, so changes
      // saved elsewhere (e.g. the publish dialog's editor for the same draft)
      // are reflected here. versionStatus counts as a system field: publishing
      // clears it on the server, and the local dropdown must follow.
      if (serverDraft) {
        setLocalDraft((prev) => {
          if (!prev) return backendToLocal(serverDraft);

          // Never clobber edits that are pending debounce or mid-save
          const hasUnsavedEdits =
            pendingDataRef.current !== null || upsertMutation.isPending;

          const server = backendToLocal(serverDraft);
          const next: LocalDraftNote = {
            ...prev,
            published: server.published,
            edited: server.edited,
            publishedNoteId: server.publishedNoteId,
            versionStatus: server.versionStatus,
            ...(hasUnsavedEdits
              ? {}
              : {
                  content: server.content,
                  subject: server.subject,
                  to: server.to,
                  cc: server.cc,
                  links: server.links,
                  attachmentIds: server.attachmentIds,
                }),
          };

          // Keep previous references for deep-equal lists so downstream
          // memos don't churn
          const sameEntities =
            JSON.stringify(next.to) === JSON.stringify(prev.to) &&
            JSON.stringify(next.cc) === JSON.stringify(prev.cc) &&
            JSON.stringify(next.links) === JSON.stringify(prev.links);
          if (sameEntities) {
            next.to = prev.to;
            next.cc = prev.cc;
            next.links = prev.links;
          }
          const sameAttachments =
            next.attachmentIds.join(',') === prev.attachmentIds.join(',');
          if (sameAttachments) {
            next.attachmentIds = prev.attachmentIds;
          }

          if (
            next.published === prev.published &&
            next.edited === prev.edited &&
            next.publishedNoteId === prev.publishedNoteId &&
            next.versionStatus === prev.versionStatus &&
            next.content === prev.content &&
            next.subject === prev.subject &&
            sameEntities &&
            sameAttachments
          ) {
            return prev;
          }

          return next;
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

  const saveVersionStatus = useCallback(
    async (status: string) => {
      if (!isEnabled) return;
      const base =
        pendingDataRef.current ??
        localDraft ??
        createEmptyDraft(currentVersion, submitter);
      const next: LocalDraftNote = { ...base, versionStatus: status };
      setLocalDraft(next);
      if (pendingDataRef.current) {
        pendingDataRef.current = next;
      }
      // Existing draft: patch version_status alone so a body edit being typed
      // in another view (e.g. the publish dialog's editor for this same draft)
      // isn't overwritten with a stale copy. New draft: write the whole thing
      // so the prefilled submitter and version link persist too, matching what
      // a status change made from the main UI creates.
      await upsertMutation.mutateAsync({
        data: serverDraft ? { version_status: status } : localToUpdate(next),
      });
    },
    [
      isEnabled,
      upsertMutation,
      currentVersion,
      submitter,
      localDraft,
      serverDraft,
    ]
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
    saveVersionStatus,
    clearDraftNote,
    flushDebouncedSave,
    isSaving: upsertMutation.isPending || deleteMutation.isPending,
    isLoading,
  };
}
