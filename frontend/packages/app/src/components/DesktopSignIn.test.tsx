import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import {
  DESKTOP_BRIDGE_READY_EVENT,
  type DesktopAuthHost,
  type Playlist,
  type Project,
} from '@dna/core';
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
      userEmail: string
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectionComplete(project, playlist, 'artist@studio.com')
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
  });

  afterEach(() => {
    delete host.dnaDesktopBridge;
  });

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
    });
    expect(
      screen.getByText('You can return to your desktop app.')
    ).toBeInTheDocument();
  });

  it('waits for a bridge that becomes ready after selection', async () => {
    seedAuth();
    render(<DesktopSignIn />);
    await finishSelection();
    expect(screen.getByText(/No desktop app is connected/)).toBeInTheDocument();

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

    expect(screen.getByText('artist@studio.com')).toBeInTheDocument();
    expect(screen.getByText(/No desktop app is connected/)).toBeInTheDocument();
  });
});
