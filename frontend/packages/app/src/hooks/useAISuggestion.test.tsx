// SPDX-License-Identifier: Apache-2.0
// Copyright Contributors to the Dailies Notes Assistant Project.

// Reproduction test for issue #127.
// Question it asks: with "Regenerate notes on version change" turned on,
// does switching back to a version that ALREADY has an AI note trigger
// another generation? The issue says it should not.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import type { UserSettings } from '@dna/core';

// --- Fakes -------------------------------------------------------------
// The hook talks to two outside things: the API (for the user's settings)
// and the "suggestion manager" (which asks the server to generate a note).
// In a test we replace both with fakes, so no server and no AI are needed,
// and we can count exactly how many times "generate" was asked for.

// vi.hoisted makes this list exist before the fakes below are created.
// The fake manager stores every "tell me when a note is generated" listener
// here, so the test can later pretend a note was generated.
const mocks = vi.hoisted(() => ({
  successListeners: [] as Array<
    (
      playlistId: string,
      versionId: string,
      note: {
        suggestion: string;
        prompt: string;
        context: string;
      }
    ) => void
  >,
}));

vi.mock('../api', () => ({
  apiHandler: {
    getUserSettings: vi.fn(),
  },
  aiSuggestionManager: {
    getGenerationState: vi.fn(() => ({ isLoading: false, error: null })),
    onGenerationStateChange: vi.fn(() => () => {}),
    onGenerationSuccess: vi.fn((listener) => {
      mocks.successListeners.push(listener);
      return () => {
        const i = mocks.successListeners.indexOf(listener);
        if (i >= 0) mocks.successListeners.splice(i, 1);
      };
    }),
    // This is the call we count. It pretends the server answered.
    generateSuggestion: vi.fn(() =>
      Promise.resolve({ suggestion: 'new note', prompt: '', context: '' })
    ),
    scheduleRegeneration: vi.fn(),
  },
}));

// The hook also listens for live transcript events over a WebSocket.
// Not needed here, so replace it with a function that does nothing.
vi.mock('./useDNAEvents', () => ({
  useTranscriptEvents: vi.fn(),
}));

// Imported AFTER the fakes are declared, so the hook picks up the fakes.
import { useAISuggestion } from './useAISuggestion';
import { aiSuggestionManager } from '../api';

// --- Test data ---------------------------------------------------------
const PLAYLIST = 'playlist-1';
const USER = 'me@example.com';

// A settings object with the setting from the issue turned ON.
const settingsWithRegenerateOn: UserSettings = {
  _id: 'settings-1',
  user_email: USER,
  note_prompt: '',
  default_note_prompt: '',
  preferred_model: '',
  regenerate_on_version_change: true,
  regenerate_on_transcript_update: false,
  sync_prodtrack_tab_on_version_change: false,
  prodtrack_page_type: 'version',
  transcription_language: '',
  updated_at: '2025-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
};

// The hook reads settings through TanStack Query, so it needs a QueryClient
// around it. We pre-load the settings into the client, so they are there on
// the very first render and no fetch has to happen.
function createWrapper(overrides: Partial<UserSettings> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(['userSettings', USER], {
    ...settingsWithRegenerateOn,
    ...overrides,
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Pretend the manager finished generating a note for a version.
// This is how the hook learns that a version has a note.
function pretendNoteWasGenerated(versionId: string, text: string) {
  act(() => {
    for (const listener of mocks.successListeners) {
      listener(PLAYLIST, versionId, {
        suggestion: text,
        prompt: 'p',
        context: 'c',
      });
    }
  });
}

// --- The test ----------------------------------------------------------
describe('useAISuggestion: regenerate on version change (issue #127)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.successListeners.length = 0;
  });

  it('does not generate again when switching back to a version that already has a note', () => {
    // 1. Start on version A with the setting ON.
    const { result, rerender } = renderHook(
      ({ versionId }) =>
        useAISuggestion({ playlistId: PLAYLIST, versionId, userEmail: USER }),
      { initialProps: { versionId: 'A' }, wrapper: createWrapper() }
    );

    // Opening the app on A must not generate anything by itself.
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(0);

    // 2. Give A a note, so A "already has an AI note".
    pretendNoteWasGenerated('A', 'Existing note for A');
    expect(result.current.suggestion).toBe('Existing note for A');

    // 3. Switch to B. B has no note, so generating once is correct
    //    (acceptance criterion 2 of the issue).
    rerender({ versionId: 'B' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(1);
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenLastCalledWith(
      PLAYLIST,
      'B',
      USER,
      undefined,
      undefined
    );

    // 4. Switch back to A. A already has a note, so the count should stay
    //    at 1 (acceptance criterion 1 of the issue).
    rerender({ versionId: 'A' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(1);
  });

  it('generates once per new version and never again on the way back', () => {
    // Walk forward A -> B -> C, giving each version a note as it arrives,
    // then walk back C -> B -> A. Only the forward steps should generate.
    const { rerender } = renderHook(
      ({ versionId }) =>
        useAISuggestion({ playlistId: PLAYLIST, versionId, userEmail: USER }),
      { initialProps: { versionId: 'A' }, wrapper: createWrapper() }
    );
    pretendNoteWasGenerated('A', 'Note for A');

    rerender({ versionId: 'B' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(1);
    pretendNoteWasGenerated('B', 'Note for B');

    rerender({ versionId: 'C' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(2);
    pretendNoteWasGenerated('C', 'Note for C');

    rerender({ versionId: 'B' });
    rerender({ versionId: 'A' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(2);
  });

  it('keeps a note that finishes after the user has switched away', () => {
    // The click-away case: A's note is still generating when the user
    // moves to B. It finishes while B is on screen. Coming back to A must
    // show that note and must not generate again.
    const { result, rerender } = renderHook(
      ({ versionId }) =>
        useAISuggestion({ playlistId: PLAYLIST, versionId, userEmail: USER }),
      { initialProps: { versionId: 'A' }, wrapper: createWrapper() }
    );

    rerender({ versionId: 'B' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(1);

    // A's note arrives late, while B is on screen.
    pretendNoteWasGenerated('A', 'Late note for A');
    pretendNoteWasGenerated('B', 'Note for B');

    rerender({ versionId: 'A' });
    expect(result.current.suggestion).toBe('Late note for A');
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(1);
  });

  it('manual Regenerate still generates for a version that has a note', () => {
    const { result } = renderHook(
      ({ versionId }) =>
        useAISuggestion({ playlistId: PLAYLIST, versionId, userEmail: USER }),
      { initialProps: { versionId: 'A' }, wrapper: createWrapper() }
    );
    pretendNoteWasGenerated('A', 'Existing note for A');

    act(() => {
      result.current.regenerate();
    });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(1);
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenLastCalledWith(
      PLAYLIST,
      'A',
      USER,
      expect.any(String),
      { requireFresh: true }
    );
  });

  it('does not generate on version change when the setting is off', () => {
    // Acceptance criterion 3 of the issue: with the setting disabled,
    // switching versions must not generate anything.
    const { rerender } = renderHook(
      ({ versionId }) =>
        useAISuggestion({ playlistId: PLAYLIST, versionId, userEmail: USER }),
      {
        initialProps: { versionId: 'A' },
        wrapper: createWrapper({ regenerate_on_version_change: false }),
      }
    );

    rerender({ versionId: 'B' });
    rerender({ versionId: 'A' });
    expect(aiSuggestionManager.generateSuggestion).toHaveBeenCalledTimes(0);
  });
});
