/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  parseNomenclatureEnv,
  resolveNomenclature,
  type NomenclatureOverrides,
  type ResolvedNomenclature,
} from './nomenclature';

const ENV_OVERRIDES = parseNomenclatureEnv(import.meta.env.VITE_NOMENCLATURE);

const NomenclatureContext = createContext<ResolvedNomenclature | null>(null);

interface NomenclatureProviderProps {
  children: ReactNode;
  overrides?: NomenclatureOverrides;
}

export function NomenclatureProvider({
  children,
  overrides,
}: NomenclatureProviderProps) {
  const value = useMemo(
    () => resolveNomenclature(overrides ?? ENV_OVERRIDES),
    [overrides]
  );
  return (
    <NomenclatureContext.Provider value={value}>
      {children}
    </NomenclatureContext.Provider>
  );
}

export function useNomenclature(): ResolvedNomenclature {
  const ctx = useContext(NomenclatureContext);
  if (!ctx) {
    throw new Error('useNomenclature must be used within NomenclatureProvider');
  }
  return ctx;
}
