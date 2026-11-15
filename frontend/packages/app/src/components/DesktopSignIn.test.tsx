import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import {
  DESKTOP_BRIDGE_READY_EVENT,
  type DesktopAuthHost,
  type Playlist,
  type Project,
  type Session,
} from '@dna/core';
import { apiHandler } from '../api';
import { render, screen, waitFor } from '../test/render';
import { DesktopSignIn } from './DesktopSignIn';

const host = window as unknown as DesktopAuthHost;

const project: Project = { id: '1', type: 'Project', name: 'Demo Show' };
const playlist: Playlist = {
  id: '45',
  type: 'Playlist',
  code: 'Monday Dailies',
  versions: [],
};

const implicitSession: Session = {
  id: 'sess-implicit',
  name: 'Playlist 45',
  project_id: '1',
  playlist_ids: ['45'],
};

const pickedSession: Session = {
  id: 'sess-picked',
  name: 'Monday review',
  project_id: '1',
  playlist_ids: ['44'],
};

// Session the mocked selector hands back (session mode), or undefined.
let selectorSession: Session | undefined;

const authUser = {
  id: 'artist@studio.com',
  email: 'artist@studio.com',
  name: 'artist',
};

vi.mock('./ProjectSelector', () => ({
  ProjectSelector: ({
    onSelectionComplete,
  }: {
    onSelectionComplete: (
      project: Project,
      playlist: Playlist,
      userEmail: string,
      session?: Session
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectionComplete(
          project,
          playlist,
          'artist@studio.com',
          selectorSession
        )
      }
    >
      Finish selection
    </button>
  ),
}));

function seedAuth() {
  localStorage.setItem('dna-auth-token', 'artist@studio.com');
  localStorage.setItem('dna-auth-user', JSON.stringify(authUser));
}

async function finishSelection() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Finish selection' })
  );
}

describe('DesktopSignIn', () => {
  beforeEach(() => {
    localStorage.clear();
    selectorSession = undefined;
    vi.spyOn(apiHandler, 'ensureSessionForPlaylist').mockResolvedValue(
      implicitSession
    );
  });

  afterEach(() => {
    delete host.dnaDesktopBridge;
    vi.restoreAllMocks();
  });

  async function deliveredPayload() {
    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };
    render(<DesktopSignIn />);
    await finishSelection();
    await waitFor(() => expect(signInComplete).toHaveBeenCalledTimes(1));
    return JSON.parse(signInComplete.mock.calls[0][0]);
  }

  it('shows the project selector before a playlist is chosen', () => {
    seedAuth();
    render(<DesktopSignIn />);
    expect(
      screen.getByRole('button', { name: 'Finish selection' })
    ).toBeInTheDocument();
  });

  it('hands the session to the desktop bridge after show and playlist selection', async () => {
    seedAuth();
    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };

    render(<DesktopSignIn />);
    await finishSelection();

    await waitFor(() => expect(signInComplete).toHaveBeenCalledTimes(1));
    expect(JSON.parse(signInComplete.mock.calls[0][0])).toEqual({
      version: 2,
      token: 'artist@studio.com',
      user: authUser,
      authProvider: 'none',
      apiBaseUrl: new URL(
        import.meta.env.VITE_API_BASE_URL || '/',
        window.location.origin
      )
        .toString()
        .replace(/\/+$/, ''),
      project: { id: '1', name: 'Demo Show' },
      playlist: { id: '45', name: 'Monday Dailies' },
      session: { id: 'sess-implicit', name: 'Playlist 45' },
    });
    expect(
      screen.getByText('You can return to your desktop app.')
    ).toBeInTheDocument();
  });

  it("sends the playlist's implicit session in playlist mode", async () => {
    seedAuth();
    const payload = await deliveredPayload();
    expect(apiHandler.ensureSessionForPlaylist).toHaveBeenCalledWith({
      projectId: '1',
      playlistId: '45',
    });
    expect(payload.session).toEqual({ id: 'sess-implicit', name: 'Playlist 45' });
  });

  it('sends the picked session and adds the playlist to it in session mode', async () => {
    seedAuth();
    selectorSession = pickedSession;
    vi.spyOn(apiHandler, 'getSession').mockResolvedValue(pickedSession);
    const update = vi
      .spyOn(apiHandler, 'updateSessionPlaylists')
      .mockResolvedValue({ ...pickedSession, playlist_ids: ['44', '45'] });

    const payload = await deliveredPayload();
    expect(apiHandler.ensureSessionForPlaylist).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      sessionId: 'sess-picked',
      playlistIds: ['44', '45'],
    });
    expect(payload.session).toEqual({ id: 'sess-picked', name: 'Monday review' });
  });

  it('delivers without a session when it cannot be resolved', async () => {
    seedAuth();
    vi.mocked(apiHandler.ensureSessionForPlaylist).mockRejectedValue(
      new Error('down')
    );
    const payload = await deliveredPayload();
    expect(payload).not.toHaveProperty('session');
    expect(payload.playlist).toEqual({ id: '45', name: 'Monday Dailies' });
  });

  it('waits for a bridge that becomes ready after selection', async () => {
    seedAuth();
    render(<DesktopSignIn />);
    await finishSelection();
    expect(
      await screen.findByText(/No desktop app is connected/)
    ).toBeInTheDocument();

    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };
    act(() => {
      window.dispatchEvent(new Event(DESKTOP_BRIDGE_READY_EVENT));
    });

    await waitFor(() => expect(signInComplete).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText('You can return to your desktop app.')
    ).toBeInTheDocument();
  });

  it('delivers only once when the ready event repeats', async () => {
    seedAuth();
    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };

    render(<DesktopSignIn />);
    await finishSelection();
    await waitFor(() => expect(signInComplete).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event(DESKTOP_BRIDGE_READY_EVENT));
    });

    expect(signInComplete).toHaveBeenCalledTimes(1);
  });

  it('explains the page when no desktop app is connected', async () => {
    seedAuth();
    render(<DesktopSignIn />);
    await finishSelection();

    expect(await screen.findByText('artist@studio.com')).toBeInTheDocument();
    expect(screen.getByText(/No desktop app is connected/)).toBeInTheDocument();
  });
});
