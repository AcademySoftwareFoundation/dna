import {useMemo, useState} from 'react';
import {searchDemoEntities, type DemoEntity} from './entities';

// Stands in for frontend/packages/app/src/hooks/useEntitySearch in docs
// demos (see plugins/dna-app-embed.ts): the same shape, answered from the
// sample entities without React Query or a debounce.

export function useEntitySearch({
  entityTypes,
  limit = 10,
}: {
  entityTypes: string[];
  projectId?: string;
  limit?: number;
  debounceMs?: number;
  networkEnabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const types = entityTypes.join(',');
  const results = useMemo(
    (): DemoEntity[] => (query.trim() ? searchDemoEntities(query, types.split(','), limit) : []),
    [query, types, limit],
  );
  return {query, setQuery, debouncedQuery: query, results, isLoading: false, error: null};
}
