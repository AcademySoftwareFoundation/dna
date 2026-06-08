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
const IN_REVIEW_KEY = 'dna-in-review-enabled';

interface FeatureFlagsContextValue {
  transcriptionEnabled: boolean;
  aiEnabled: boolean;
  inReviewEnabled: boolean;
  setTranscriptionEnabled: (enabled: boolean) => void;
  setAiEnabled: (enabled: boolean) => void;
  setInReviewEnabled: (enabled: boolean) => void;
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

  const [inReviewEnabled, setInReviewState] = useState(() => {
    const stored = localStorage.getItem(IN_REVIEW_KEY);
    return stored === null ? true : stored === 'true';
  });

  const setTranscriptionEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(TRANSCRIPTION_KEY, String(enabled));
    setTranscriptionState(enabled);
  }, []);

  const setAiEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(AI_KEY, String(enabled));
    setAiState(enabled);
  }, []);

  const setInReviewEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(IN_REVIEW_KEY, String(enabled));
    setInReviewState(enabled);
  }, []);

  return (
    <FeatureFlagsContext.Provider
      value={{
        transcriptionEnabled,
        aiEnabled,
        inReviewEnabled,
        setTranscriptionEnabled,
        setAiEnabled,
        setInReviewEnabled,
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
