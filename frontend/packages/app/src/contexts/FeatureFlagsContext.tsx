/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

const TRANSCRIPTION_KEY = 'dna-transcription-enabled';
const AI_KEY = 'dna-ai-enabled';

interface FeatureFlagsContextValue {
  transcriptionEnabled: boolean;
  aiEnabled: boolean;
  setTranscriptionEnabled: (enabled: boolean) => void;
  setAiEnabled: (enabled: boolean) => void;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [transcriptionEnabled, setTranscriptionState] = useState(() => {
    const stored = localStorage.getItem(TRANSCRIPTION_KEY);
    return stored === 'true';
  });

  const [aiEnabled, setAiState] = useState(() => {
    const stored = localStorage.getItem(AI_KEY);
    return stored === 'true';
  });

  const setTranscriptionEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(TRANSCRIPTION_KEY, String(enabled));
    setTranscriptionState(enabled);
  }, []);

  const setAiEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(AI_KEY, String(enabled));
    setAiState(enabled);
  }, []);

  return (
    <FeatureFlagsContext.Provider
      value={{
        transcriptionEnabled,
        aiEnabled,
        setTranscriptionEnabled,
        setAiEnabled,
      }}
    >
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx)
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  return ctx;
}
