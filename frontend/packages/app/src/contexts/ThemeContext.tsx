import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

import { ACCENTS, DEFAULT_ACCENT, type AccentName } from '../styles';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'dna-theme-mode';
const ACCENT_STORAGE_KEY = 'dna-accent-color';

interface ThemeModeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accent: AccentName;
  setAccent: (accent: AccentName) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function isAccentName(value: string | null): value is AccentName {
  return value !== null && value in ACCENTS;
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  });

  const [accent, setAccentState] = useState<AccentName>(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccentName(stored) ? stored : DEFAULT_ACCENT;
  });

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const setAccent = useCallback((next: AccentName) => {
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
    setAccentState(next);
  }, []);

  return (
    <ThemeModeContext.Provider value={{ mode, setMode, accent, setAccent }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  }
  return ctx;
}
