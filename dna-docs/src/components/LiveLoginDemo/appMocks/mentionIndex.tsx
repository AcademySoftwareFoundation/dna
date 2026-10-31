import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {DEMO_ENTITIES, type DemoEntity} from './entities';

// Stands in for frontend/packages/app/src/contexts/MentionIndexContext in
// docs demos (see plugins/dna-app-embed.ts). The app prefetches every
// mentionable entity with React Query; here the index is the sample set,
// ready immediately.

export interface MentionIndexContextValue {
  projectId: string | null;
  mergedCandidates: DemoEntity[];
  isIndexLoading: boolean;
  isIndexFetching: boolean;
  hasAnyError: boolean;
}

const MentionIndexContext = createContext<MentionIndexContextValue | null>(null);

export function MentionIndexProvider({
  projectId,
  children,
}: {
  projectId: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    (): MentionIndexContextValue => ({
      projectId,
      mergedCandidates: DEMO_ENTITIES,
      isIndexLoading: false,
      isIndexFetching: false,
      hasAnyError: false,
    }),
    [projectId],
  );
  return (
    <MentionIndexContext.Provider value={value}>{children}</MentionIndexContext.Provider>
  );
}

export function useMentionIndex(): MentionIndexContextValue | null {
  return useContext(MentionIndexContext);
}
