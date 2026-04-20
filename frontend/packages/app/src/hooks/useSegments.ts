import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  StoredSegment,
  type DNAEvent,
  type TranscriptEventPayload,
} from '@dna/core';
import {
  createTranscriptManager,
  type TranscriptManager,
  type TranscriptMessage,
} from '@vexaai/transcript-rendering';
import { apiHandler } from '../api';
import { useEventSubscription } from './useDNAEvents';

export interface UseSegmentsOptions {
  playlistId: number | null;
  versionId: number | null;
  enabled?: boolean;
}

export interface UseSegmentsResult {
  segments: StoredSegment[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * React hook exposing deduplicated transcript segments for a playlist/version.
 *
 * Single dedup authority: `@vexaai/transcript-rendering`'s `TranscriptManager`.
 *
 * Load order is designed so WS ticks never get wiped by a late REST response
 * and a cached REST response is always merged into the manager before WS
 * ticks start stacking on top:
 *
 * 1. On (playlist, version) change: `manager.clear()`, then seed the manager
 *    from React Query's existing cache for this queryKey (if any) via the
 *    additive tick path.
 * 2. `useQuery` fetches fresh REST; the response is also merged additively
 *    (NOT via `bootstrap()`, which clears state).
 * 3. WS `transcript` events call `manager.handleMessage()` directly.
 *
 * All three paths converge on the same confirmed/pending maps, keyed by
 * Vexa's stable `segment_id`, so duplicates are impossible.
 */
export function useSegments({
  playlistId,
  versionId,
  enabled = true,
}: UseSegmentsOptions): UseSegmentsResult {
  const queryClient = useQueryClient();
  const isEnabled = enabled && playlistId != null && versionId != null;
  const queryKey = useMemo(
    () => ['segments', playlistId, versionId],
    [playlistId, versionId]
  );

  const managerRef = useRef<TranscriptManager<StoredSegment> | null>(null);
  if (managerRef.current === null) {
    managerRef.current = createTranscriptManager<StoredSegment>();
  }

  const activeKeyRef = useRef<string>('');
  const activeKey = `${playlistId ?? '-'}:${versionId ?? '-'}`;

  const [liveSegments, setLiveSegments] = useState<StoredSegment[] | null>(null);

  // Additive merge: feed confirmed segments into the manager via the tick
  // path (which does not clear state), then pull the reconciled array out.
  const mergeConfirmed = useCallback((rest: StoredSegment[]): StoredSegment[] => {
    const mgr = managerRef.current!;
    if (rest && rest.length > 0) {
      mgr.handleMessage({ type: 'transcript', confirmed: rest, pending: [] });
    }
    return mgr.getSegments();
  }, []);

  // Version change — reset manager, then seed from any cached REST already
  // in React Query so WS ticks append onto the historical transcript rather
  // than replacing it.
  useEffect(() => {
    activeKeyRef.current = activeKey;
    const mgr = managerRef.current!;
    mgr.clear();
    const cached = queryClient.getQueryData<StoredSegment[]>(queryKey);
    if (cached && cached.length > 0) {
      const seeded = mergeConfirmed(cached);
      setLiveSegments(seeded);
    } else {
      setLiveSegments(null);
    }
  }, [activeKey, queryClient, queryKey, mergeConfirmed]);

  const { data, isLoading, isError, error } = useQuery<StoredSegment[], Error>({
    queryKey,
    queryFn: async ({ queryKey: qk }) => {
      const [, qPlaylistId, qVersionId] = qk as [string, number, number];
      const capturedKey = `${qPlaylistId ?? '-'}:${qVersionId ?? '-'}`;
      const rest = await apiHandler.getSegmentsForVersion({
        playlistId: qPlaylistId,
        versionId: qVersionId,
      });
      // If the user switched versions while we were fetching, cache the
      // raw REST under the old queryKey (still valid data for that version)
      // but don't touch the current manager (it's for a different version).
      if (activeKeyRef.current !== capturedKey) {
        return rest;
      }
      const merged = mergeConfirmed(rest);
      setLiveSegments(merged);
      return merged;
    },
    enabled: isEnabled,
    staleTime: 30000,
  });

  const handleTranscript = useCallback(
    (event: DNAEvent<TranscriptEventPayload>) => {
      const payload = event.payload;
      if (playlistId != null && payload.playlist_id !== playlistId) return;
      if (versionId != null && payload.version_id !== versionId) return;
      const message: TranscriptMessage = {
        type: 'transcript',
        speaker: payload.speaker,
        confirmed: (payload.confirmed ?? []) as StoredSegment[],
        pending: (payload.pending ?? []) as StoredSegment[],
        ts: payload.ts,
      };
      const next = managerRef.current!.handleMessage(message);
      if (next) {
        setLiveSegments(next);
        queryClient.setQueryData<StoredSegment[]>(queryKey, next);
      }
    },
    [queryClient, queryKey, playlistId, versionId]
  );

  useEventSubscription<TranscriptEventPayload>('transcript', handleTranscript, {
    enabled: isEnabled,
  });

  return {
    segments: liveSegments ?? data ?? [],
    isLoading,
    isError,
    error: error ?? null,
  };
}
