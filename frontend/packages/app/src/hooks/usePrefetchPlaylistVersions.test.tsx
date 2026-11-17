import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefetchPlaylistVersions } from './usePrefetchPlaylistVersions';

const { getVersionsForPlaylist } = vi.hoisted(() => ({
  getVersionsForPlaylist: vi.fn(),
}));

vi.mock('../api', () => ({
  apiHandler: {
    getVersionsForPlaylist,
  },
}));

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('usePrefetchPlaylistVersions', () => {
  beforeEach(() => {
    getVersionsForPlaylist.mockReset();
    getVersionsForPlaylist.mockImplementation(async ({ playlistId }) => [
      { id: `${playlistId}-v1`, type: 'Version', name: 'v1', notes: [] },
    ]);
  });

  it('does nothing when there are no playlists', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => usePrefetchPlaylistVersions([]), {
      wrapper: wrapperFor(queryClient),
    });

    await Promise.resolve();
    expect(getVersionsForPlaylist).not.toHaveBeenCalled();
  });

  it('loads versions for every playlist into the cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => usePrefetchPlaylistVersions(['45', '46']), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['versions', '45'])).toEqual([
        { id: '45-v1', type: 'Version', name: 'v1', notes: [] },
      ]);
    });
    expect(queryClient.getQueryData(['versions', '46'])).toEqual([
      { id: '46-v1', type: 'Version', name: 'v1', notes: [] },
    ]);
    expect(getVersionsForPlaylist).toHaveBeenCalledWith({ playlistId: '45' });
    expect(getVersionsForPlaylist).toHaveBeenCalledWith({ playlistId: '46' });
  });
});
