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
const RV_SYNC_KEY = 'dna-rv-sync-enabled';

function readEnvOverride(envValue: string | undefined): boolean | null {
  if (envValue === 'true') return true;
  if (envValue === 'false') return false;
  return null;
}

const ENV_TRANSCRIPTION = readEnvOverride(import.meta.env.VITE_FEATURE_TRANSCRIPTION);
const ENV_IN_REVIEW = readEnvOverride(import.meta.env.VITE_FEATURE_IN_REVIEW);
const ENV_AI = readEnvOverride(import.meta.env.VITE_FEATURE_AI);
const ENV_RV_SYNC = readEnvOverride(import.meta.env.VITE_FEATURE_RV_SYNC);

interface FeatureFlagsContextValue {
  transcriptionEnabled: boolean;
  aiEnabled: boolean;
  inReviewEnabled: boolean;
  rvSyncEnabled: boolean;
  transcriptionLocked: boolean;
  aiLocked: boolean;
  inReviewLocked: boolean;
  rvSyncLocked: boolean;
  transcriptionLockReason: string | null;
  inReviewLockReason: string | null;
  setTranscriptionEnabled: (enabled: boolean) => void;
  setAiEnabled: (enabled: boolean) => void;
  setInReviewEnabled: (enabled: boolean) => void;
  setRvSyncEnabled: (enabled: boolean) => void;
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

  const [rvSyncEnabled, setRvSyncState] = useState(() => {
    if (ENV_RV_SYNC !== null) return ENV_RV_SYNC;
    const stored = localStorage.getItem(RV_SYNC_KEY);
    return stored === null ? true : stored === 'true';
  });

  // Russian-doll dependency: AI ⊆ Transcription ⊆ In Review, and
  // RV Sync ⊆ In Review. Enabling a dependent feature (via UI toggle or
  // env override) forces what it requires on.
  const transcriptionEnabled = transcriptionBase || aiEnabled;
  const inReviewEnabled = inReviewBase || transcriptionEnabled || rvSyncEnabled;

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

  const setRvSyncEnabled = useCallback((enabled: boolean) => {
    if (ENV_RV_SYNC !== null) return;
    localStorage.setItem(RV_SYNC_KEY, String(enabled));
    setRvSyncState(enabled);
  }, []);

  return (
    <FeatureFlagsContext.Provider
      value={{
        transcriptionEnabled,
        aiEnabled,
        inReviewEnabled,
        rvSyncEnabled,
        transcriptionLocked: ENV_TRANSCRIPTION !== null || aiEnabled,
        aiLocked: ENV_AI !== null,
        inReviewLocked:
          ENV_IN_REVIEW !== null || transcriptionEnabled || rvSyncEnabled,
        rvSyncLocked: ENV_RV_SYNC !== null,
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
              : rvSyncEnabled
                ? 'rv-sync'
                : null,
        setTranscriptionEnabled,
        setAiEnabled,
        setInReviewEnabled,
        setRvSyncEnabled,
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
