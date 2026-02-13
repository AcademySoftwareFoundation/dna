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
  clearDraftNote: () => void;
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
    name: '', // Name not stored in backend, will need to be fetched or cached
  }));

  return {
    content: note.content,
    subject: note.subject,
    to: parseEntitiesFromString(note.to),
    cc: parseEntitiesFromString(note.cc),
    links,
    versionStatus: note.version_status,
  };
}

function localToUpdate(local: LocalDraftNote): DraftNoteUpdate {
  // Store to/cc as JSON strings to preserve entity data
  const toJson = local.to.length > 0 ? JSON.stringify(local.to) : '';
  const ccJson = local.cc.length > 0 ? JSON.stringify(local.cc) : '';

  // Convert links to DraftNoteLink format
  const links = local.links.map((entity) => ({
    entity_type: entity.type,
    entity_id: entity.id,
  }));

  return {
    content: local.content,
    subject: local.subject,
    to: toJson,
    cc: ccJson,
    links,
    version_status: local.versionStatus,
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
  const hasInitializedRef = useRef(false);

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
      hasInitializedRef.current = false;
      return;
    }
    // Only sync from server on initial load, not after our own mutations.
    // The server response loses entity names for links, so re-syncing
    // would overwrite the richer local state and cause pills to vanish.
    if (hasInitializedRef.current) return;

    if (serverDraft) {
      setLocalDraft(backendToLocal(serverDraft));
      hasInitializedRef.current = true;
    } else if (serverDraft === null && !isLoading) {
      setLocalDraft(createEmptyDraft(currentVersion, submitter));
      hasInitializedRef.current = true;
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
        const base = prev ?? createEmptyDraft(currentVersion, submitter);
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

  return {
    draftNote: localDraft,
    updateDraftNote,
    clearDraftNote,
    isSaving: upsertMutation.isPending || deleteMutation.isPending,
    isLoading,
  };
}
