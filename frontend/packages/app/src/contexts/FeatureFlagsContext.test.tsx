import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import {
  FeatureFlagsProvider,
  useFeatureFlags,
} from './FeatureFlagsContext';

function Wrapper({ children }: { children: ReactNode }) {
  return <FeatureFlagsProvider>{children}</FeatureFlagsProvider>;
}

describe('sessions feature flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to off and remembers the user toggle', () => {
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: Wrapper });

    expect(result.current.sessionsEnabled).toBe(false);
    expect(result.current.sessionsLocked).toBe(false);

    act(() => {
      result.current.setSessionsEnabled(true);
    });

    expect(result.current.sessionsEnabled).toBe(true);
    expect(localStorage.getItem('dna-sessions-enabled')).toBe('true');
  });
});
