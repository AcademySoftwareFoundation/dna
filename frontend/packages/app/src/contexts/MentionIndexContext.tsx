import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { SearchResult } from '@dna/core';
import {
  MENTION_PREFETCH_ENTITY_TYPES,
  MENTION_PREFETCH_LIMIT,
  mergeMentionPrefetchResults,
} from '@dna/core';
import { apiHandler } from '../api';

const REFRESH_MS = 5 * 60 * 1000;

export interface MentionIndexContextValue {
  /** Project this index was built for (null when prefetch disabled). */
  projectId: number | null;
  mergedCandidates: SearchResult[];
  isIndexLoading: boolean;
  isIndexFetching: boolean;
  hasAnyError: boolean;
}

const MentionIndexContext = createContext<MentionIndexContextValue | null>(
  null
);

export function MentionIndexProvider({
  projectId,
  children,
}: {
  projectId: number | null;
  children: ReactNode;
}) {
  const pid = projectId;
  const queries = useQueries({
    queries: [...MENTION_PREFETCH_ENTITY_TYPES].map((entityType) => ({
      queryKey: ['mentionEntityPrefetch', pid, entityType] as const,
      queryFn: () =>
        apiHandler.searchEntities({
          query: '',
          entityTypes: [entityType],
          projectId: pid ?? undefined,
          limit: MENTION_PREFETCH_LIMIT,
        }),
      enabled: pid != null,
      staleTime: REFRESH_MS,
      refetchInterval: REFRESH_MS,
      refetchIntervalInBackground: true,
    })),
  });

  const isIndexLoading = pid != null && queries.some((q) => q.isPending);
  const isIndexFetching = pid != null && queries.some((q) => q.isFetching);
  const hasAnyError = queries.some((q) => q.isError);

  const dataSignature = queries
    .map((q) => `${q.dataUpdatedAt}:${q.status}:${(q.data ?? []).length}`)
    .join('|');

  const value = useMemo((): MentionIndexContextValue => {
    const mergedCandidates = mergeMentionPrefetchResults(
      queries.map((q) => q.data ?? [])
    );
    return {
      projectId: pid ?? null,
      mergedCandidates,
      isIndexLoading,
      isIndexFetching,
      hasAnyError,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `queries` implied by `dataSignature`
  }, [pid, dataSignature, isIndexLoading, isIndexFetching, hasAnyError]);

  return (
    <MentionIndexContext.Provider value={value}>
      {children}
    </MentionIndexContext.Provider>
  );
}

export function useMentionIndex(): MentionIndexContextValue | null {
  return useContext(MentionIndexContext);
}
