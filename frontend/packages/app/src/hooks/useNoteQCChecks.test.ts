import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNoteQCChecks } from './useNoteQCChecks';
import type { DraftNote } from '@dna/core';
import { apiHandler } from '../api';

function wrapper(queryClient: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function draft(over: Partial<DraftNote> = {}): DraftNote {
  return {
    _id: 'n1',
    user_email: 'u@test.com',
    playlist_id: 1,
    version_id: 2,
    content: 'x',
    subject: 's',
    to: '',
    cc: '',
    links: [],
    version_status: '',
    published: false,
    edited: false,
    published_note_id: null,
    updated_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    attachment_ids: [],
    ...over,
  };
}

describe('useNoteQCChecks', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(apiHandler, 'runQCChecks').mockResolvedValue([
      {
        check_id: 'c1',
        check_name: 'Test',
        severity: 'warning',
        passed: true,
      },
    ]);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('fetches QC when open with drafts', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result } = renderHook(
      () =>
        useNoteQCChecks({
          open: true,
          playlistId: 10,
          drafts: [draft()],
        }),
      { wrapper: wrapper(qc) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledWith({
      playlistId: 10,
      versionId: 2,
      userEmail: 'u@test.com',
    });
    expect(result.current.results.n1?.length).toBe(1);
  });

  it('does not refetch all drafts when only draft content changes', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const base = draft();
    const { result, rerender } = renderHook(
      ({ drafts }: { drafts: DraftNote[] }) =>
        useNoteQCChecks({
          open: true,
          playlistId: 10,
          drafts,
        }),
      { wrapper: wrapper(qc), initialProps: { drafts: [base] } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ drafts: [draft({ content: 'updated body text' })] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshDraft runs QC for one draft only', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const d1 = draft({ _id: 'a', user_email: 'a@test.com' });
    const d2 = draft({ _id: 'b', user_email: 'b@test.com', version_id: 2 });
    const { result } = renderHook(
      () =>
        useNoteQCChecks({
          open: true,
          playlistId: 10,
          drafts: [d1, d2],
        }),
      { wrapper: wrapper(qc) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.refreshDraft(d1);
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenLastCalledWith({
      playlistId: 10,
      versionId: 2,
      userEmail: 'a@test.com',
    });
  });

  it('refetches bulk QC when dialog closes and reopens', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useNoteQCChecks({
          open,
          playlistId: 10,
          drafts: [draft()],
        }),
      { wrapper: wrapper(qc), initialProps: { open: true } }
    );

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
