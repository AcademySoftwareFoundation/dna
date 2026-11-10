import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { DESKTOP_BRIDGE_READY_EVENT, type DesktopAuthHost } from '@dna/core';
import { render, screen } from '../test/render';
import { DesktopSignIn } from './DesktopSignIn';

const host = window as unknown as DesktopAuthHost;

async function signIn(email: string) {
  await userEvent.type(screen.getByPlaceholderText('you@example.com'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('DesktopSignIn', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete host.dnaDesktopBridge;
  });

  it('shows the sign-in form when signed out', () => {
    render(<DesktopSignIn />);
    expect(screen.getByText('Welcome to DNA')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('hands the session to the desktop bridge after sign-in', async () => {
    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };

    render(<DesktopSignIn />);
    await signIn('artist@studio.com');

    expect(signInComplete).toHaveBeenCalledTimes(1);
    expect(JSON.parse(signInComplete.mock.calls[0][0])).toEqual({
      version: 1,
      token: 'artist@studio.com',
      user: {
        id: 'artist@studio.com',
        email: 'artist@studio.com',
        name: 'artist',
      },
      authProvider: 'none',
      apiBaseUrl: new URL(
        import.meta.env.VITE_API_BASE_URL || '/',
        window.location.origin
      )
        .toString()
        .replace(/\/+$/, ''),
    });
    expect(
      screen.getByText('You can return to your desktop app.')
    ).toBeInTheDocument();
  });

  it('waits for a bridge that becomes ready after sign-in', async () => {
    render(<DesktopSignIn />);
    await signIn('artist@studio.com');
    expect(screen.getByText(/No desktop app is connected/)).toBeInTheDocument();

    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };
    act(() => {
      window.dispatchEvent(new Event(DESKTOP_BRIDGE_READY_EVENT));
    });

    expect(signInComplete).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('You can return to your desktop app.')
    ).toBeInTheDocument();
  });

  it('delivers only once when the ready event repeats', async () => {
    const signInComplete = vi.fn();
    host.dnaDesktopBridge = { signInComplete };

    render(<DesktopSignIn />);
    await signIn('artist@studio.com');
    act(() => {
      window.dispatchEvent(new Event(DESKTOP_BRIDGE_READY_EVENT));
    });

    expect(signInComplete).toHaveBeenCalledTimes(1);
  });

  it('explains the page when no desktop app is connected', async () => {
    render(<DesktopSignIn />);
    await signIn('artist@studio.com');

    expect(screen.getByText('artist@studio.com')).toBeInTheDocument();
    expect(screen.getByText(/No desktop app is connected/)).toBeInTheDocument();
  });
});
