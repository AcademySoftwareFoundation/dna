import {createContext, useContext, useMemo, useState, type ReactNode} from 'react';

// State behind the fake app modules: who is "signed in" and which colour
// mode the docs are in. Provided by LiveLoginDemo, read by the fake
// useAuth / useThemeMode in ./contexts.ts.

interface DemoState {
  mode: 'dark' | 'light';
  email: string | null;
  setEmail: (email: string | null) => void;
}

const DemoStateContext = createContext<DemoState | null>(null);

export function DemoStateProvider({
  mode,
  children,
}: {
  mode: 'dark' | 'light';
  children: ReactNode;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const value = useMemo(() => ({mode, email, setEmail}), [mode, email]);
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
