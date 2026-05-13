import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DraftNote, NoteQCResult } from '@dna/core';
import { apiHandler } from '../api';

function draftKey(d: DraftNote): string {
  return d._id;
}

function ignoreKey(draftKey: string, checkId: string): string {
  return `${draftKey}:${checkId}`;
}

/** Stable identity per draft so content edits do not re-run QC for every note. */
function draftsIdentityFingerprint(drafts: DraftNote[]): string {
  return drafts
    .map((d) => `${draftKey(d)}\0${d.user_email}\0${d.version_id}`)
    .sort()
    .join('|');
}

export interface UseNoteQCChecksOptions {
  open: boolean;
  playlistId: number;
  drafts: DraftNote[];
}

export function useNoteQCChecks({ open, playlistId, drafts }: UseNoteQCChecksOptions) {
  const [results, setResults] = useState<Record<string, NoteQCResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [refreshingDraftKey, setRefreshingDraftKey] = useState<string | null>(null);

  const fingerprint = useMemo(() => draftsIdentityFingerprint(drafts), [drafts]);

  useEffect(() => {
    if (!open) {
      setIgnored(new Set());
      return;
    }
    if (drafts.length === 0) {
      setResults({});
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const entries = await Promise.all(
          drafts.map(async (d) => {
            const list = await apiHandler.runQCChecks({
              playlistId,
              versionId: d.version_id,
              userEmail: d.user_email,
            });
            return [draftKey(d), list] as const;
          })
        );
        if (cancelled) return;
        const next: Record<string, NoteQCResult[]> = {};
        for (const [k, v] of entries) {
          next[k] = v;
        }
        setResults(next);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, playlistId, fingerprint]);

  const toggleIgnore = useCallback((dk: string, checkId: string) => {
    const key = ignoreKey(dk, checkId);
    setIgnored((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const refreshDraft = useCallback(
    async (d: DraftNote) => {
      const key = draftKey(d);
      setRefreshingDraftKey(key);
      try {
        const list = await apiHandler.runQCChecks({
          playlistId,
          versionId: d.version_id,
          userEmail: d.user_email,
        });
        setResults((prev) => ({ ...prev, [key]: list }));
      } finally {
        setRefreshingDraftKey(null);
      }
    },
    [playlistId]
  );

  const hasBlockingErrors = useCallback(
    (dk: string) => {
      const list = results[dk] ?? [];
      for (const r of list) {
        if (r.passed) continue;
        if (r.severity !== 'error') continue;
        if (ignored.has(ignoreKey(dk, r.check_id))) continue;
        return true;
      }
      return false;
    },
    [results, ignored]
  );

  return {
    results,
    loading,
    ignored,
    toggleIgnore,
    refreshDraft,
    hasBlockingErrors,
    refreshingDraftKey,
  };
}
