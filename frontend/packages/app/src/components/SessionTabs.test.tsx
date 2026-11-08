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

vi.mock('../hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks')>();
  return {
    ...actual,
    useSessionPlaylists: () => sessionPlaylists,
    useSessionPlaylistMetadata: () => [
      {
        data: {
          playlist_id: '45',
          in_review: '100',
          in_review_pinned: true,
        },
      },
      {
        data: {
          playlist_id: '46',
          in_review: null,
          in_review_pinned: false,
        },
      },
    ],
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
  });

  it('does not show a single playlist while the session list is still loading', () => {
    sessionPlaylists.data = undefined;
    sessionPlaylists.isPending = true;
    sessionPlaylists.isError = false;
    try {
      render(
        <SessionTabs
          sessionId="sess-1"
          projectId="124"
          activePlaylist={activePlaylist}
          onPlaylistChange={vi.fn()}
        />
      );

      expect(screen.queryByRole('tab', { name: /Morning/ })).not.toBeInTheDocument();
    } finally {
      sessionPlaylists.data = {
        session_id: 'sess-1',
        playlist_ids: ['45', '46'],
      };
      sessionPlaylists.isPending = false;
    }
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

    expect(screen.getByRole('tab', { name: /Morning/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Afternoon/ })).toBeInTheDocument();
    expect(screen.getByLabelText('In review')).toBeInTheDocument();
    const pin = screen.getByLabelText('Pinned');
    expect(screen.getByRole('tab', { name: /Morning/ })).toContainElement(pin);
    expect(screen.getByRole('tab', { name: 'Afternoon' })).not.toContainElement(
      pin
    );
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

    await user.click(
      screen.getByRole('button', { name: 'Remove Afternoon from session' })
    );

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

    await user.click(
      screen.getByRole('button', { name: 'Remove Morning from session' })
    );

    expect(onPlaylistChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: '46', code: 'Afternoon' })
    );
  });

  it('hides the last playlist after it is removed', async () => {
    sessionPlaylists.data = {
      session_id: 'sess-1',
      playlist_ids: ['45'],
    };
    const user = userEvent.setup();
    try {
      render(
        <SessionTabs
          sessionId="sess-1"
          projectId="124"
          activePlaylist={activePlaylist}
          onPlaylistChange={vi.fn()}
        />
      );

      await user.click(
        screen.getByRole('button', { name: 'Remove Morning from session' })
      );

      expect(screen.queryByRole('tab', { name: /Morning/ })).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '+ Add playlist' })
      ).toBeInTheDocument();
    } finally {
      sessionPlaylists.data = {
        session_id: 'sess-1',
        playlist_ids: ['45', '46'],
      };
    }
  });
});
