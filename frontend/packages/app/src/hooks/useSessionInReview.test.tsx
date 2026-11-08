import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NomenclatureProvider } from '../nomenclature';
import type { ReactNode } from 'react';
import type { PlaylistMetadata } from '@dna/core';
import { useSessionSetInReview } from './useSessionInReview';

const { getPlaylistMetadata, upsertPlaylistMetadata, showToast } = vi.hoisted(
  () => ({
    getPlaylistMetadata: vi.fn(),
    upsertPlaylistMetadata: vi.fn(),
    showToast: vi.fn(),
  })
);

vi.mock('../api', () => ({
  apiHandler: { getPlaylistMetadata, upsertPlaylistMetadata },
}));

vi.mock('./useDNAEvents', () => ({
  useEventSubscription: vi.fn(),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast, dismissToast: vi.fn() }),
}));

function metadata(
  playlistId: string,
  inReview: string | null,
  pinned = false
): PlaylistMetadata {
  return {
    _id: playlistId,
    playlist_id: playlistId,
    in_review: inReview,
    in_review_pinned: pinned,
    meeting_id: null,
    platform: null,
    transcription_paused: false,
    has_scratch: false,
    session_ids: ['sess-1'],
  };
}

function renderSessionReview(queryClient: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NomenclatureProvider>{children}</NomenclatureProvider>
      </QueryClientProvider>
    );
  }
  return renderHook(() => useSessionSetInReview('46', ['45', '46']), {
    wrapper: Wrapper,
  });
}

describe('useSessionSetInReview', () => {
  beforeEach(() => {
    getPlaylistMetadata.mockReset();
    upsertPlaylistMetadata.mockReset();
    showToast.mockReset();
  });

  it('clears the previous holder before setting in review', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['playlistMetadata', '45'], metadata('45', '100'));
    queryClient.setQueryData(['playlistMetadata', '46'], metadata('46', null));
    upsertPlaylistMetadata.mockImplementation(
      async ({
        playlistId,
        data,
      }: {
        playlistId: string;
        data: { clear_in_review?: boolean; in_review?: string | null };
      }) =>
      metadata(
        playlistId,
        data.clear_in_review ? null : (data.in_review ?? null),
        false
      )
    );

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReview('900');

    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(1, {
      playlistId: '45',
      data: { clear_in_review: true },
    });
    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(2, {
      playlistId: '46',
      data: { in_review: '900' },
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('stops and toasts when the holder is pinned', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(
      ['playlistMetadata', '45'],
      metadata('45', '100', true)
    );
    queryClient.setQueryData(['playlistMetadata', '46'], metadata('46', null));
    const conflict = Object.assign(new Error('pinned'), {
      response: { status: 409 },
    });
    upsertPlaylistMetadata.mockRejectedValue(conflict);

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReview('900');

    expect(upsertPlaylistMetadata).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'In review is pinned' })
    );
  });

  it('clears unpinned playlists and does not set in review when another is pinned', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(
      ['playlistMetadata', '45'],
      metadata('45', '100', true)
    );
    queryClient.setQueryData(['playlistMetadata', '47'], metadata('47', '300'));
    queryClient.setQueryData(['playlistMetadata', '46'], metadata('46', null));
    upsertPlaylistMetadata.mockImplementation(
      async ({ playlistId }: { playlistId: string }) => {
        if (playlistId === '45') {
          throw Object.assign(new Error('pinned'), { response: { status: 409 } });
        }
        return metadata(playlistId, null);
      }
    );

    const { result } = renderHook(
      () => useSessionSetInReview('46', ['45', '47', '46']),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            <NomenclatureProvider>{children}</NomenclatureProvider>
          </QueryClientProvider>
        ),
      }
    );
    await result.current.setInReview('900');

    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(1, {
      playlistId: '47',
      data: { clear_in_review: true },
    });
    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(2, {
      playlistId: '45',
      data: { clear_in_review: true },
    });
    expect(upsertPlaylistMetadata).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'In review is pinned' })
    );
  });

  it('clears every other playlist in the session before setting in review', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['playlistMetadata', '45'], metadata('45', '100'));
    queryClient.setQueryData(['playlistMetadata', '47'], metadata('47', '300'));
    queryClient.setQueryData(['playlistMetadata', '46'], metadata('46', null));
    upsertPlaylistMetadata.mockImplementation(
      async ({
        playlistId,
        data,
      }: {
        playlistId: string;
        data: { clear_in_review?: boolean; in_review?: string | null };
      }) =>
        metadata(
          playlistId,
          data.clear_in_review ? null : (data.in_review ?? null),
          false
        )
    );

    const { result } = renderHook(
      () => useSessionSetInReview('46', ['45', '47', '46']),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            <NomenclatureProvider>{children}</NomenclatureProvider>
          </QueryClientProvider>
        ),
      }
    );
    await result.current.setInReview('900');

    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(1, {
      playlistId: '45',
      data: { clear_in_review: true },
    });
    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(2, {
      playlistId: '47',
      data: { clear_in_review: true },
    });
    expect(upsertPlaylistMetadata).toHaveBeenNthCalledWith(3, {
      playlistId: '46',
      data: { in_review: '900' },
    });
  });

  it('only sets in review when no other playlist holds it', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['playlistMetadata', '45'], metadata('45', null));
    queryClient.setQueryData(['playlistMetadata', '46'], metadata('46', null));
    upsertPlaylistMetadata.mockResolvedValue(metadata('46', '900'));

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReview('900');

    expect(upsertPlaylistMetadata).toHaveBeenCalledTimes(1);
    expect(upsertPlaylistMetadata).toHaveBeenCalledWith({
      playlistId: '46',
      data: { in_review: '900' },
    });
  });
});
