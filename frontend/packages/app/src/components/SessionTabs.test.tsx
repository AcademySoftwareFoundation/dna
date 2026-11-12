import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { Playlist } from '@dna/core';
import { render, screen } from '../test/render';
import { SessionTabs } from './SessionTabs';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    useGetPlaylistsForProject: () => ({
      data: [
        { id: '45', type: 'Playlist', code: 'Morning', versions: [] },
        { id: '46', type: 'Playlist', code: 'Afternoon', versions: [] },
      ],
    }),
  };
});

const removePlaylist = vi.hoisted(() =>
  vi.fn(
    (
      _vars: { sessionId: string; playlistId: string },
      options?: { onSuccess?: () => void }
    ) => {
      options?.onSuccess?.();
    }
  )
);

const sessionPlaylists = vi.hoisted(() => ({
  data: {
    session_id: 'sess-1',
    playlist_ids: ['45', '46'] as string[],
  } as { session_id: string; playlist_ids: string[] } | undefined,
  isPending: false,
  isError: false,
}));

const dnaSession = vi.hoisted(() => ({
  data: {
    id: 'sess-1',
    project_id: '124',
    playlist_ids: ['45', '46'],
    in_review_playlist_id: '45' as string | null,
    in_review_version_id: '100' as string | null,
    in_review_pinned: true,
  },
}));

vi.mock('../hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks')>();
  return {
    ...actual,
    useSessionPlaylists: () => sessionPlaylists,
    useSession: () => dnaSession,
    useAddPlaylistToSession: () => ({ mutate: vi.fn() }),
    useRemovePlaylistFromSession: () => ({ mutate: removePlaylist }),
  };
});

const activePlaylist = {
  id: '45',
  type: 'Playlist',
  code: 'Morning',
  versions: [],
} as Playlist;

describe('SessionTabs', () => {
  beforeEach(() => {
    removePlaylist.mockClear();
    sessionPlaylists.data = {
      session_id: 'sess-1',
      playlist_ids: ['45', '46'],
    };
    sessionPlaylists.isPending = false;
    sessionPlaylists.isError = false;
    dnaSession.data = {
      id: 'sess-1',
      project_id: '124',
      playlist_ids: ['45', '46'],
      in_review_playlist_id: '45',
      in_review_version_id: '100',
      in_review_pinned: true,
    };
  });

  it('does not show a single playlist while the session list is still loading', () => {
    sessionPlaylists.data = undefined;
    sessionPlaylists.isPending = true;

    render(
      <SessionTabs
        sessionId="sess-1"
        projectId="124"
        activePlaylist={activePlaylist}
        onPlaylistChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('tab', { name: /Morning/ })).not.toBeInTheDocument();
  });

  it('shows a tab per playlist, an in-review marker, and add playlist', () => {
    const onPlaylistChange = vi.fn();
    render(
      <SessionTabs
        sessionId="sess-1"
        projectId="124"
        activePlaylist={activePlaylist}
        onPlaylistChange={onPlaylistChange}
      />
    );

    const morning = screen.getByRole('tab', { name: /Morning/ });
    expect(morning).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Afternoon/ })).toBeInTheDocument();
    expect(morning.querySelector('svg')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Afternoon' }).querySelector('svg')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '+ Add playlist' })
    ).toBeInTheDocument();
  });

  it('selects another playlist when its tab is clicked', async () => {
    const user = userEvent.setup();
    const onPlaylistChange = vi.fn();
    render(
      <SessionTabs
        sessionId="sess-1"
        projectId="124"
        activePlaylist={activePlaylist}
        onPlaylistChange={onPlaylistChange}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Afternoon' }));

    expect(onPlaylistChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: '46', code: 'Afternoon' })
    );
  });

  it('removes a playlist from the session without selecting it', async () => {
    const user = userEvent.setup();
    const onPlaylistChange = vi.fn();
    render(
      <SessionTabs
        sessionId="sess-1"
        projectId="124"
        activePlaylist={activePlaylist}
        onPlaylistChange={onPlaylistChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove Afternoon' }));

    expect(removePlaylist).toHaveBeenCalledWith(
      { sessionId: 'sess-1', playlistId: '46' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(onPlaylistChange).not.toHaveBeenCalled();
  });

  it('opens another playlist when the active one is removed', async () => {
    const user = userEvent.setup();
    const onPlaylistChange = vi.fn();
    render(
      <SessionTabs
        sessionId="sess-1"
        projectId="124"
        activePlaylist={activePlaylist}
        onPlaylistChange={onPlaylistChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove Morning' }));

    expect(onPlaylistChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: '46', code: 'Afternoon' })
    );
  });

  it('does not show remove on the last remaining playlist', () => {
    sessionPlaylists.data = {
      session_id: 'sess-1',
      playlist_ids: ['45'],
    };

    render(
      <SessionTabs
        sessionId="sess-1"
        projectId="124"
        activePlaylist={activePlaylist}
        onPlaylistChange={vi.fn()}
      />
    );

    expect(screen.getByRole('tab', { name: /Morning/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove Morning' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '+ Add playlist' })
    ).toBeInTheDocument();
  });
});
