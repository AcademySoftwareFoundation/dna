import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useAddPlaylistToSession,
  useGetSessionsForProject,
  useRemovePlaylistFromSession,
} from './useSessions';

const { getSessionsForProject, getPlaylistMetadata, upsertPlaylistMetadata } =
  vi.hoisted(() => ({
    getSessionsForProject: vi.fn(),
    getPlaylistMetadata: vi.fn(),
    upsertPlaylistMetadata: vi.fn(),
  }));

vi.mock('../api', () => ({
  apiHandler: {
    getSessionsForProject,
    getPlaylistMetadata,
    upsertPlaylistMetadata,
  },
}));

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useSessions', () => {
  beforeEach(() => {
    getSessionsForProject.mockReset();
    getPlaylistMetadata.mockReset();
    upsertPlaylistMetadata.mockReset();
  });

  it('loads sessions for the project', async () => {
    getSessionsForProject.mockResolvedValue([
      { id: 'sess-1', name: 'Morning dailies', project_id: '124' },
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

  it('links a playlist by merging session ids', async () => {
    getPlaylistMetadata.mockResolvedValue({
      _id: 'a',
      playlist_id: '45',
      in_review: null,
      in_review_pinned: false,
      meeting_id: null,
      platform: null,
      transcription_paused: false,
      has_scratch: false,
      session_ids: ['sess-1'],
    });
    upsertPlaylistMetadata.mockImplementation(
      async ({ data }: { data: { session_ids?: string[] } }) => ({
      _id: 'a',
      playlist_id: '45',
      in_review: null,
      in_review_pinned: false,
      meeting_id: null,
      platform: null,
      transcription_paused: false,
      has_scratch: false,
      session_ids: data.session_ids,
    }));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useAddPlaylistToSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-2', playlistId: '45' });

    expect(upsertPlaylistMetadata).toHaveBeenCalledWith({
      playlistId: '45',
      data: { session_ids: ['sess-1', 'sess-2'] },
    });
    expect(queryClient.getQueryData(['sessionPlaylists', 'sess-2'])).toEqual({
      session_id: 'sess-2',
      playlist_ids: ['45'],
    });
  });

  it('does not write when the playlist is already in the session', async () => {
    getPlaylistMetadata.mockResolvedValue({
      _id: 'a',
      playlist_id: '45',
      in_review: null,
      in_review_pinned: false,
      meeting_id: null,
      platform: null,
      transcription_paused: false,
      has_scratch: false,
      session_ids: ['sess-1'],
    });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useAddPlaylistToSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-1', playlistId: '45' });

    expect(upsertPlaylistMetadata).not.toHaveBeenCalled();
  });

  it('unlinks a playlist by removing the session id', async () => {
    getPlaylistMetadata.mockResolvedValue({
      _id: 'a',
      playlist_id: '45',
      in_review: null,
      in_review_pinned: false,
      meeting_id: null,
      platform: null,
      transcription_paused: false,
      has_scratch: false,
      session_ids: ['sess-1', 'sess-2'],
    });
    upsertPlaylistMetadata.mockImplementation(
      async ({ data }: { data: { session_ids?: string[] } }) => ({
        _id: 'a',
        playlist_id: '45',
        in_review: null,
        in_review_pinned: false,
        meeting_id: null,
        platform: null,
        transcription_paused: false,
        has_scratch: false,
        session_ids: data.session_ids,
      })
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

    expect(upsertPlaylistMetadata).toHaveBeenCalledWith({
      playlistId: '45',
      data: { session_ids: ['sess-2'] },
    });
    expect(queryClient.getQueryData(['sessionPlaylists', 'sess-1'])).toEqual({
      session_id: 'sess-1',
      playlist_ids: ['46'],
    });
  });

  it('does not write when the playlist is not in the session', async () => {
    getPlaylistMetadata.mockResolvedValue({
      _id: 'a',
      playlist_id: '45',
      in_review: null,
      in_review_pinned: false,
      meeting_id: null,
      platform: null,
      transcription_paused: false,
      has_scratch: false,
      session_ids: ['sess-2'],
    });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useRemovePlaylistFromSession(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ sessionId: 'sess-1', playlistId: '45' });

    expect(upsertPlaylistMetadata).not.toHaveBeenCalled();
  });
});
