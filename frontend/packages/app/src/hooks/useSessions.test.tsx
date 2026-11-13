import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Session } from '@dna/core';
import {
  useAddPlaylistToSession,
  useGetSessionsForProject,
  useRemovePlaylistFromSession,
} from './useSessions';

const { getSessionsForProject, getSession, updateSessionPlaylists } = vi.hoisted(
  () => ({
    getSessionsForProject: vi.fn(),
    getSession: vi.fn(),
    updateSessionPlaylists: vi.fn(),
  })
);

vi.mock('../api', () => ({
  apiHandler: {
    getSessionsForProject,
    getSession,
    updateSessionPlaylists,
  },
}));

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function session(partial: Partial<Session> & Pick<Session, 'id'>): Session {
  return {
    project_id: '124',
    playlist_ids: [],
    ...partial,
  };
}

describe('useSessions', () => {
  beforeEach(() => {
    getSessionsForProject.mockReset();
    getSession.mockReset();
    updateSessionPlaylists.mockReset();
  });

  it('loads sessions for the project', async () => {
    getSessionsForProject.mockResolvedValue([
      session({ id: 'sess-1', name: 'Morning dailies' }),
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useGetSessionsForProject('124'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSessionsForProject).toHaveBeenCalledWith({ projectId: '124' });
    expect(result.current.data?.[0].name).toBe('Morning dailies');
  });

  it('links a playlist by updating session playlist_ids', async () => {
    getSession.mockResolvedValue(session({ id: 'sess-2', playlist_ids: ['44'] }));
    updateSessionPlaylists.mockResolvedValue(
      session({ id: 'sess-2', playlist_ids: ['44', '45'] })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useAddPlaylistToSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-2', playlistId: '45' });

    expect(getSession).toHaveBeenCalledWith({ sessionId: 'sess-2' });
    expect(updateSessionPlaylists).toHaveBeenCalledWith({
      sessionId: 'sess-2',
      playlistIds: ['44', '45'],
    });
    expect(queryClient.getQueryData(['sessionPlaylists', 'sess-2'])).toEqual({
      session_id: 'sess-2',
      playlist_ids: ['44', '45'],
    });
    expect(queryClient.getQueryData(['session', 'sess-2'])).toEqual(
      session({ id: 'sess-2', playlist_ids: ['44', '45'] })
    );
  });

  it('does not write when the playlist is already in the session', async () => {
    getSession.mockResolvedValue(
      session({ id: 'sess-1', playlist_ids: ['45'] })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useAddPlaylistToSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-1', playlistId: '45' });

    expect(updateSessionPlaylists).not.toHaveBeenCalled();
  });

  it('unlinks a playlist from the session', async () => {
    getSession.mockResolvedValue(
      session({ id: 'sess-1', playlist_ids: ['45', '46'] })
    );
    updateSessionPlaylists.mockResolvedValue(
      session({ id: 'sess-1', playlist_ids: ['46'] })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData(['sessionPlaylists', 'sess-1'], {
      session_id: 'sess-1',
      playlist_ids: ['45', '46'],
    });

    const { result } = renderHook(() => useRemovePlaylistFromSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-1', playlistId: '45' });

    expect(updateSessionPlaylists).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      playlistIds: ['46'],
    });
    expect(queryClient.getQueryData(['sessionPlaylists', 'sess-1'])).toEqual({
      session_id: 'sess-1',
      playlist_ids: ['46'],
    });
  });

  it('does not write when the playlist is not in the session', async () => {
    getSession.mockResolvedValue(
      session({ id: 'sess-1', playlist_ids: ['46'] })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useRemovePlaylistFromSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-1', playlistId: '45' });

    expect(updateSessionPlaylists).not.toHaveBeenCalled();
  });
});
