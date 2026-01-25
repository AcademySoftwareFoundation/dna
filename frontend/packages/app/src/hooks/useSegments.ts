import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StoredSegment, type DNAEvent, type SegmentEventPayload } from '@dna/core';
import { apiHandler } from '../api';
import { useSegmentEvents } from './useDNAEvents';

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

export function useSegments({
  playlistId,
  versionId,
  enabled = true,
}: UseSegmentsOptions): UseSegmentsResult {
  const queryClient = useQueryClient();
  const isEnabled = enabled && playlistId != null && versionId != null;

  const queryKey = ['segments', playlistId, versionId];

  const { data, isLoading, isError, error } = useQuery<StoredSegment[], Error>({
    queryKey,
    queryFn: () =>
      apiHandler.getSegmentsForVersion({
        playlistId: playlistId!,
        versionId: versionId!,
      }),
    enabled: isEnabled,
    staleTime: 30000,
  });

  const handleSegmentEvent = useCallback(
    (event: DNAEvent<SegmentEventPayload>) => {
      const segmentData = event.payload;

      queryClient.setQueryData<StoredSegment[]>(queryKey, (oldData) => {
        if (!oldData) return oldData;

        const existingIndex = oldData.findIndex(
          (s) => s.segment_id === segmentData.segment_id
        );

        const updatedSegment: StoredSegment = {
          id: segmentData.segment_id,
          segment_id: segmentData.segment_id,
          playlist_id: segmentData.playlist_id,
          version_id: segmentData.version_id,
          text: segmentData.text,
          speaker: segmentData.speaker,
          absolute_start_time: segmentData.absolute_start_time,
          absolute_end_time: segmentData.absolute_end_time || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          const newData = [...oldData];
          newData[existingIndex] = {
            ...oldData[existingIndex],
            ...updatedSegment,
            updated_at: new Date().toISOString(),
          };
          return newData;
        } else {
          const newData = [...oldData, updatedSegment];
          return newData.sort((a, b) =>
            a.absolute_start_time.localeCompare(b.absolute_start_time)
          );
        }
      });
    },
    [queryClient, queryKey]
  );

  useSegmentEvents(handleSegmentEvent, {
    playlistId,
    versionId,
    enabled: isEnabled,
  });

  return {
    segments: data ?? [],
    isLoading,
    isError,
    error: error ?? null,
  };
}
