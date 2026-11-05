import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useSetInReview } from './usePlaylistMetadata';

const { upsertPlaylistMetadata } = vi.hoisted(() => ({
  upsertPlaylistMetadata: vi.fn(),
}));

vi.mock('../api', () => ({
  apiHandler: { upsertPlaylistMetadata },
}));

vi.mock('./useDNAEvents', () => ({
  useEventSubscription: vi.fn(),
}));

function renderSetInReview() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return renderHook(() => useSetInReview('10'), { wrapper: Wrapper }).result;
}

describe('useSetInReview', () => {
  beforeEach(() => {
    upsertPlaylistMetadata.mockReset();
    upsertPlaylistMetadata.mockResolvedValue({});
  });

  it('leaves the pin alone when setting in review normally', async () => {
    await renderSetInReview().current.setInReview('200');
    expect(upsertPlaylistMetadata).toHaveBeenCalledWith({
      playlistId: '10',
      data: { in_review: '200' },
    });
  });

  it('clears the pin in the same request when taking over', async () => {
    await renderSetInReview().current.setInReview('200', true);
    expect(upsertPlaylistMetadata).toHaveBeenCalledWith({
      playlistId: '10',
      data: { in_review: '200', in_review_pinned: false },
    });
  });

  it('sends the version id when pinning, and only the flag when unpinning', async () => {
    const result = renderSetInReview();
    await result.current.setInReviewPinned('200', true);
    expect(upsertPlaylistMetadata).toHaveBeenLastCalledWith({
      playlistId: '10',
      data: { in_review: '200', in_review_pinned: true },
    });
    await result.current.setInReviewPinned('200', false);
    expect(upsertPlaylistMetadata).toHaveBeenLastCalledWith({
      playlistId: '10',
      data: { in_review_pinned: false },
    });
  });
});
