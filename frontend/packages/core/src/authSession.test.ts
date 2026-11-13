/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
} from './authSession';

describe('authSession', () => {
  afterEach(() => {
    clearAuthSession();
  });

  it('writes and reads the session from cookie and localStorage', () => {
    writeAuthSession(
      {
        token: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'a@b.com', email: 'a@b.com', name: 'A', login: 'a' },
      },
      600
    );

    const session = readAuthSession();
    expect(session).toEqual({
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'a@b.com', email: 'a@b.com', name: 'A', login: 'a' },
    });
    expect(localStorage.getItem('dna-auth-token')).toBe('access-token');
  });

  it('clears cookies and storage', () => {
    writeAuthSession({
      token: 'access-token',
      user: { id: 'a@b.com', email: 'a@b.com' },
    });
    clearAuthSession();
    expect(readAuthSession()).toBeNull();
    expect(localStorage.getItem('dna-auth-token')).toBeNull();
  });
});
