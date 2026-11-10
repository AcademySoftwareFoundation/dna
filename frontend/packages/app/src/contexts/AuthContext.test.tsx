import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '@dna/core';
import { AuthProvider, useAuth } from './AuthContext';
import { apiHandler } from '../api';

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken(expSeconds: number): string {
  return `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'jdoe', exp: expSeconds })}.sig`;
}

const user = { sub: 'jdoe', email: 'jdoe@example.com', name: 'Jane Doe' };
const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

function storeSession(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    apiHandler.setUser(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts signed out with no stored session', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('hydrates a stored, unexpired session', () => {
    const token = makeToken(futureExp());
    storeSession(token);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(user);
    expect(result.current.token).toBe(token);
    expect(apiHandler.getUser()).toEqual({
      id: 'jdoe',
      email: 'jdoe@example.com',
      name: 'Jane Doe',
      token,
    });
  });

  it('discards an expired stored session', () => {
    storeSession(makeToken(Math.floor(Date.now() / 1000) - 10));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(apiHandler.getUser()).toBeNull();
  });

  it('signs in and persists the session', async () => {
    const token = makeToken(futureExp());
    const login = vi.spyOn(apiHandler, 'login').mockResolvedValue({
      access_token: token,
      token_type: 'bearer',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.signIn('jdoe', 'secret'));

    expect(login).toHaveBeenCalledWith('jdoe', 'secret');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.signInError).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(token);
    expect(apiHandler.getUser()?.token).toBe(token);
  });

  it('shows the backend reason when credentials are rejected', async () => {
    vi.spyOn(apiHandler, 'login').mockRejectedValue({
      response: {
        status: 401,
        data: { detail: 'Invalid username or password' },
      },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.signIn('jdoe', 'wrong'));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.signInError).toBe('Invalid username or password');
  });

  it('shows a generic error for other failures', async () => {
    vi.spyOn(apiHandler, 'login').mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.signIn('jdoe', 'secret'));

    expect(result.current.signInError).toBe(
      'Sign in failed. Please try again.'
    );
  });

  it('signs out on a 401 from the API', async () => {
    const onUnauthorized = vi.spyOn(apiHandler, 'onUnauthorized');
    storeSession(makeToken(futureExp()));
    const { result } = renderHook(() => useAuth(), { wrapper });
    const handler = onUnauthorized.mock.calls.find(([h]) => h)?.[0];

    act(() => handler?.());

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(apiHandler.getUser()).toBeNull();
  });

  it('signs out when the token expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    storeSession(makeToken(Math.floor(Date.now() / 1000) + 60));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
  });

  it('signOut clears the session', () => {
    storeSession(makeToken(futureExp()));
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => result.current.signOut());

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });
});
