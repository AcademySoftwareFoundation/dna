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

function readEnvOverride(envValue: string | undefined): boolean | null {
  if (envValue === 'true') return true;
  if (envValue === 'false') return false;
  return null;
}

const ENV_TRANSCRIPTION = readEnvOverride(import.meta.env.VITE_FEATURE_TRANSCRIPTION);
const ENV_IN_REVIEW = readEnvOverride(import.meta.env.VITE_FEATURE_IN_REVIEW);
const ENV_AI = readEnvOverride(import.meta.env.VITE_FEATURE_AI);

interface FeatureFlagsContextValue {
  transcriptionEnabled: boolean;
  aiEnabled: boolean;
  inReviewEnabled: boolean;
  transcriptionLocked: boolean;
  aiLocked: boolean;
  inReviewLocked: boolean;
  transcriptionLockReason: string | null;
  inReviewLockReason: string | null;
  setTranscriptionEnabled: (enabled: boolean) => void;
  setAiEnabled: (enabled: boolean) => void;
  setInReviewEnabled: (enabled: boolean) => void;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [transcriptionBase, setTranscriptionState] = useState(() => {
    if (ENV_TRANSCRIPTION !== null) return ENV_TRANSCRIPTION;
    const stored = localStorage.getItem(TRANSCRIPTION_KEY);
    return stored === null ? true : stored === 'true';
  });

  const [aiEnabled, setAiState] = useState(() => {
    if (ENV_AI !== null) return ENV_AI;
    const stored = localStorage.getItem(AI_KEY);
    return stored === null ? true : stored === 'true';
  });

  const [inReviewBase, setInReviewState] = useState(() => {
    if (ENV_IN_REVIEW !== null) return ENV_IN_REVIEW;
    const stored = localStorage.getItem(IN_REVIEW_KEY);
    return stored === null ? true : stored === 'true';
  });

  // Russian-doll dependency: AI ⊆ Transcription ⊆ In Review.
  // AI requires Transcription, and Transcription requires In Review, so
  // enabling a parent (via UI toggle or env override) forces its children on.
  const transcriptionEnabled = transcriptionBase || aiEnabled;
  const inReviewEnabled = inReviewBase || transcriptionEnabled;

  const setTranscriptionEnabled = useCallback((enabled: boolean) => {
    if (ENV_TRANSCRIPTION !== null) return;
    localStorage.setItem(TRANSCRIPTION_KEY, String(enabled));
    setTranscriptionState(enabled);
  }, []);

  const setAiEnabled = useCallback((enabled: boolean) => {
    if (ENV_AI !== null) return;
    localStorage.setItem(AI_KEY, String(enabled));
    setAiState(enabled);
  }, []);

  const setInReviewEnabled = useCallback((enabled: boolean) => {
    if (ENV_IN_REVIEW !== null) return;
    localStorage.setItem(IN_REVIEW_KEY, String(enabled));
    setInReviewState(enabled);
  }, []);

  return (
    <FeatureFlagsContext.Provider
      value={{
        transcriptionEnabled,
        aiEnabled,
        inReviewEnabled,
        transcriptionLocked: ENV_TRANSCRIPTION !== null || aiEnabled,
        aiLocked: ENV_AI !== null,
        inReviewLocked: ENV_IN_REVIEW !== null || transcriptionEnabled,
        transcriptionLockReason:
          ENV_TRANSCRIPTION !== null
            ? 'pipeline'
            : aiEnabled
              ? 'ai'
              : null,
        inReviewLockReason:
          ENV_IN_REVIEW !== null
            ? 'pipeline'
            : transcriptionEnabled
              ? 'transcription'
              : null,
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
