import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useAddVersionToPlaylist } from './useAddVersionToPlaylist';
import { apiHandler } from '../api';

vi.mock('../api', () => ({
  apiHandler: {
    addVersionToPlaylist: vi.fn(),
  },
}));

const mockedApiHandler = vi.mocked(apiHandler);

describe('useAddVersionToPlaylist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls apiHandler.addVersionToPlaylist and invalidates versions query on success', async () => {
    const mockVersions = [
      { id: 1, type: 'Version', name: 'v001' },
      { id: 2, type: 'Version', name: 'v002' },
    ];
    mockedApiHandler.addVersionToPlaylist.mockResolvedValue(mockVersions);

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useAddVersionToPlaylist(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({ playlistId: 42, versionId: 2 });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedApiHandler.addVersionToPlaylist).toHaveBeenCalledWith({
      playlistId: 42,
      versionId: 2,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['versions', 42],
    });
  });
});
