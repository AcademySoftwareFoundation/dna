import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import { parseVersionSort, type VersionSort } from '../components/versionSort';

const STORAGE_KEY = 'dna-version-sort';

interface VersionSortContextValue {
  sort: VersionSort;
  setSort: (sort: VersionSort) => void;
}

const VersionSortContext = createContext<VersionSortContextValue | null>(null);

export function VersionSortProvider({ children }: { children: ReactNode }) {
  const [sort, setSortState] = useState<VersionSort>(() =>
    parseVersionSort(localStorage.getItem(STORAGE_KEY))
  );

  const setSort = useCallback((next: VersionSort) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSortState(next);
  }, []);

  return (
    <VersionSortContext.Provider value={{ sort, setSort }}>
      {children}
    </VersionSortContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVersionSort(): VersionSortContextValue {
  const ctx = useContext(VersionSortContext);
  if (!ctx) {
    throw new Error('useVersionSort must be used within VersionSortProvider');
  }
  return ctx;
}
