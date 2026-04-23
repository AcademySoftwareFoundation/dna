import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchResult, SearchableEntityType } from '@dna/core';
import { apiHandler } from '../api';

interface UseEntitySearchOptions {
  entityTypes: SearchableEntityType[];
  projectId?: number;
  limit?: number;
  debounceMs?: number;
  /** When false, never hits the network (e.g. local mention index is authoritative). */
  networkEnabled?: boolean;
}

interface UseEntitySearchReturn {
  query: string;
  setQuery: (query: string) => void;
  /** Query after debounce (matches what the network request uses). */
  debouncedQuery: string;
  results: SearchResult[];
  isLoading: boolean;
  error: Error | null;
}

export function useEntitySearch({
  entityTypes,
  projectId,
  limit = 10,
  debounceMs = 300,
  networkEnabled = true,
}: UseEntitySearchOptions): UseEntitySearchReturn {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const {
    data: results = [],
    isLoading,
    error,
  } = useQuery<SearchResult[], Error>({
    queryKey: ['entitySearch', debouncedQuery, entityTypes, projectId, limit],
    queryFn: () =>
      apiHandler.searchEntities({
        query: debouncedQuery,
        entityTypes,
        projectId,
        limit,
      }),
    enabled: networkEnabled && debouncedQuery.length > 0,
    staleTime: 30000, // Cache results for 30 seconds
  });

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    isLoading: networkEnabled && isLoading && debouncedQuery.length > 0,
    error,
  };
}
