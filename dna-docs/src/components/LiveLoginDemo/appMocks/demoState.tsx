import {createContext, useContext, useMemo, useState, type ReactNode} from 'react';

// State behind the fake app modules: who is "signed in", which colour mode
// the docs are in, and whether this demo has sessions switched on. Provided
// by LoginDemo, read by the fake useAuth / useThemeMode / useFeatureFlags in
// ./contexts.ts.

interface DemoState {
  mode: 'dark' | 'light';
  email: string | null;
  setEmail: (email: string | null) => void;
  /** The sessions feature flag, as the sign-in screen sees it. */
  sessions: boolean;
}

const DemoStateContext = createContext<DemoState | null>(null);

export function DemoStateProvider({
  mode,
  sessions = false,
  initialEmail = null,
  children,
}: {
  mode: 'dark' | 'light';
  sessions?: boolean;
  /** Start already signed in as this address. */
  initialEmail?: string | null;
  children: ReactNode;
}) {
  const [email, setEmail] = useState<string | null>(initialEmail);
  const value = useMemo(() => ({mode, email, setEmail, sessions}), [mode, email, sessions]);
  return (
    <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>
  );
}

export function useDemoState(): DemoState {
  const state = useContext(DemoStateContext);
  if (!state) {
    throw new Error('DNA app demos must be rendered inside DemoStateProvider');
  }
  return state;
}
