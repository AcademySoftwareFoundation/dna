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
 * - REST bootstrap populates the manager's `confirmed` map.
 * - WS `transcript` events (raw Vexa shape forwarded by DNA backend) feed
 *   `manager.handleMessage()` directly — draft/confirmed distinction preserved.
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

  // One manager per (playlist, version); reset on change.
  const managerRef = useRef<TranscriptManager<StoredSegment> | null>(null);
  if (managerRef.current === null) {
    managerRef.current = createTranscriptManager<StoredSegment>();
  }
  useEffect(() => {
    managerRef.current?.clear();
  }, [playlistId, versionId]);

  const [liveSegments, setLiveSegments] = useState<StoredSegment[] | null>(null);

  const { data, isLoading, isError, error } = useQuery<StoredSegment[], Error>({
    queryKey,
    queryFn: async () => {
      const rest = await apiHandler.getSegmentsForVersion({
        playlistId: playlistId!,
        versionId: versionId!,
      });
      const bootstrapped = managerRef.current!.bootstrap(rest);
      setLiveSegments(bootstrapped);
      return bootstrapped;
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
