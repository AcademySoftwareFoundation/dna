import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface NoteFocusContextValue {
  isNoteFocused: boolean;
  setNoteFocused: (focused: boolean) => void;
}

const NoteFocusContext = createContext<NoteFocusContextValue | null>(null);

export function NoteFocusProvider({ children }: { children: ReactNode }) {
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const setNoteFocused = useCallback((focused: boolean) => {
    setIsNoteFocused(focused);
  }, []);

  const value = useMemo(
    () => ({ isNoteFocused, setNoteFocused }),
    [isNoteFocused, setNoteFocused]
  );

  return (
    <NoteFocusContext.Provider value={value}>
      {children}
    </NoteFocusContext.Provider>
  );
}

export function useNoteFocus(): NoteFocusContextValue | null {
  return useContext(NoteFocusContext);
}
