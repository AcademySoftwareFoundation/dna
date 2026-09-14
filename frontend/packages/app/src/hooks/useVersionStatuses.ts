import { useQuery } from '@tanstack/react-query';
import { StatusOption } from '@dna/core';
import { apiHandler } from '../api';

export interface UseVersionStatusesParams {
  projectId?: number;
}

export interface UseVersionStatusesResult {
  statuses: StatusOption[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch valid version status options from ShotGrid.
 * Caches results for 5 minutes to reduce API calls.
 */
export function useVersionStatuses({
  projectId,
}: UseVersionStatusesParams = {}): UseVersionStatusesResult {
  const { data, isLoading, error } = useQuery<StatusOption[], Error>({
    queryKey: ['versionStatuses', projectId],
    queryFn: () => apiHandler.getVersionStatuses({ projectId }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    statuses: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
