import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { HotkeysProvider as RHHProvider } from 'react-hotkeys-hook';
import {
  HOTKEY_ACTIONS,
  HOTKEY_ACTIONS_MAP,
  STORAGE_KEY,
  type HotkeyAction,
} from './hotkeysConfig';

type KeyMap = Record<string, string>;

interface HotkeyContextValue {
  getKeysForAction: (actionId: string) => string;
  setKeysForAction: (actionId: string, keys: string) => void;
  resetToDefaults: () => void;
  getAllActions: () => HotkeyAction[];
  getLabel: (actionId: string) => string;
}

const HotkeyContext = createContext<HotkeyContextValue | null>(null);

function loadKeyMap(): KeyMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {};
}

function saveKeyMap(keyMap: KeyMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keyMap));
}

function formatKeysForDisplay(keys: string): string {
  return keys
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === 'meta')
        return navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl';
      if (p === 'shift') return '\u21E7';
      if (p === 'alt')
        return navigator.platform.includes('Mac') ? '\u2325' : 'Alt';
      if (p === 'ctrl') return 'Ctrl';
      if (p === 'down') return '\u2193';
      if (p === 'up') return '\u2191';
      if (p === 'left') return '\u2190';
      if (p === 'right') return '\u2192';
      if (p === 'space') return 'Space';
      if (p === 'escape') return 'Esc';
      return p.toUpperCase();
    })
    .join(' + ');
}

interface HotkeysProviderProps {
  children: ReactNode;
}

export function HotkeysProvider({ children }: HotkeysProviderProps) {
  const [keyMap, setKeyMap] = useState<KeyMap>(loadKeyMap);

  const getKeysForAction = useCallback(
    (actionId: string): string => {
      return (
        keyMap[actionId] || HOTKEY_ACTIONS_MAP[actionId]?.defaultKeys || ''
      );
    },
    [keyMap]
  );

  const setKeysForAction = useCallback((actionId: string, keys: string) => {
    setKeyMap((prev) => {
      const next = { ...prev, [actionId]: keys };
      saveKeyMap(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setKeyMap({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getAllActions = useCallback(() => HOTKEY_ACTIONS, []);

  const getLabel = useCallback(
    (actionId: string): string => {
      const keys = getKeysForAction(actionId);
      return formatKeysForDisplay(keys);
    },
    [getKeysForAction]
  );

  return (
    <HotkeyContext.Provider
      value={{
        getKeysForAction,
        setKeysForAction,
        resetToDefaults,
        getAllActions,
        getLabel,
      }}
    >
      <RHHProvider>{children}</RHHProvider>
    </HotkeyContext.Provider>
  );
}

export function useHotkeyConfig() {
  const ctx = useContext(HotkeyContext);
  if (!ctx) {
    throw new Error('useHotkeyConfig must be used within HotkeysProvider');
  }
  return ctx;
}
