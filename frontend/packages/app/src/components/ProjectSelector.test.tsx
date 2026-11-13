import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '../test/render';
import { apiHandler } from '../api';
import { NomenclatureProvider } from '../nomenclature';
import { ProjectSelector, STORAGE_KEYS } from './ProjectSelector';

const flags = vi.hoisted(() => ({ sessionsEnabled: true }));
const getSessionPlaylists = vi.hoisted(() => vi.fn());

vi.mock('../contexts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts')>();
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: true,
      isLoading: false,
      user: { email: 'sam@studio.example' },
      signIn: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      authProvider: 'none',
    }),
    useFeatureFlags: () => ({ sessionsEnabled: flags.sessionsEnabled }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    useGetProjectsForUser: () => ({
      data: [{ id: '1', type: 'Project', name: 'Show' }],
      isLoading: false,
      isError: false,
    }),
    useGetPlaylistsForProject: () => ({
      data: [{ id: '45', type: 'Playlist', code: 'Dailies', versions: [] }],
      isLoading: false,
      isError: false,
    }),
  };
});

vi.mock('../hooks/useSessions', () => ({
  useGetSessionsForProject: () => ({
    data: [
      { id: 'sess-1', name: 'Morning dailies', project_id: '1' },
      { id: 'sess-2', name: 'Afternoon review', project_id: '1' },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCreateSession: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

describe('ProjectSelector sessions', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      STORAGE_KEYS.PROJECT,
      JSON.stringify({ id: '1', type: 'Project', name: 'Show' })
    );
    flags.sessionsEnabled = true;
    getSessionPlaylists.mockReset();
    vi.spyOn(apiHandler, 'getSessionPlaylists').mockImplementation(
      getSessionPlaylists
    );
  });

  it('asks for a session before a playlist when sessions are enabled', () => {
    render(<ProjectSelector onSelectionComplete={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Open Existing' })).toHaveAttribute(
      'data-state',
      'active'
    );
    expect(screen.getByRole('tab', { name: 'Create New' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Session name')).not.toBeInTheDocument();
    expect(screen.queryByText('Select a playlist')).not.toBeInTheDocument();
  });

  it('filters sessions from the search field in the menu', async () => {
    const user = userEvent.setup();
    render(<ProjectSelector onSelectionComplete={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'Choose a session...' }));
    await user.type(screen.getByRole('textbox', { name: 'Search sessions' }), 'after');

    expect(screen.getByRole('option', { name: 'Afternoon review' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Morning dailies' })).not.toBeInTheDocument();
  });

  it('shows the session name field on the Create New tab', async () => {
    const user = userEvent.setup();
    render(<ProjectSelector onSelectionComplete={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'Create New' }));

    expect(screen.getByPlaceholderText('Session name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens a linked playlist when the session already has one', async () => {
    getSessionPlaylists.mockResolvedValue({
      session_id: 'sess-1',
      playlist_ids: ['45'],
    });
    const user = userEvent.setup();
    const onSelectionComplete = vi.fn();
    const setQueryData = vi.spyOn(QueryClient.prototype, 'setQueryData');
    render(<ProjectSelector onSelectionComplete={onSelectionComplete} />);

    await user.click(screen.getByRole('combobox', { name: 'Choose a session...' }));
    await user.click(screen.getByRole('option', { name: 'Morning dailies' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(onSelectionComplete).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '45', code: 'Dailies' }),
        'sam@studio.example',
        expect.objectContaining({ id: 'sess-1', name: 'Morning dailies' })
      );
    });
    expect(setQueryData).toHaveBeenCalledWith(['sessionPlaylists', 'sess-1'], {
      session_id: 'sess-1',
      playlist_ids: ['45'],
    });
    expect(screen.queryByText('Select a playlist')).not.toBeInTheDocument();
    setQueryData.mockRestore();
  });

  it('asks for a playlist when the session has none', async () => {
    getSessionPlaylists.mockResolvedValue({
      session_id: 'sess-1',
      playlist_ids: [],
    });
    const user = userEvent.setup();
    const onSelectionComplete = vi.fn();
    render(<ProjectSelector onSelectionComplete={onSelectionComplete} />);

    await user.click(screen.getByRole('combobox', { name: 'Choose a session...' }));
    await user.click(screen.getByRole('option', { name: 'Morning dailies' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Select a playlist')).toBeInTheDocument();
    expect(onSelectionComplete).not.toHaveBeenCalled();
  });

  it('keeps the playlist step when sessions are disabled', () => {
    flags.sessionsEnabled = false;
    render(<ProjectSelector onSelectionComplete={vi.fn()} />);

    expect(screen.getByText('Select a playlist')).toBeInTheDocument();
    expect(screen.queryByText('Select a session')).not.toBeInTheDocument();
  });

  it('uses the studio name for a session', async () => {
    const user = userEvent.setup();
    render(
      <NomenclatureProvider overrides={{ session: { singular: 'Reel' } }}>
        <ProjectSelector onSelectionComplete={vi.fn()} />
      </NomenclatureProvider>
    );

    expect(
      screen.getByRole('combobox', { name: 'Choose a reel...' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Create New' }));

    expect(screen.getByPlaceholderText('Reel name')).toBeInTheDocument();
  });
});
