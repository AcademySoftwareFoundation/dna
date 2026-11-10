import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuthSession,
  SessionStorage,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  decodeTokenExpiry,
  isExpired,
  sessionFromLoginResponse,
} from './session';

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken(payload: object): string {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.signature`;
}

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const user = { sub: 'jdoe', email: 'jdoe@example.com', name: 'Jane Doe' };
const exp = 1_900_000_000;
const token = makeToken({ sub: 'jdoe', email: 'jdoe@example.com', exp });

describe('decodeTokenExpiry', () => {
  it('returns exp in milliseconds', () => {
    expect(decodeTokenExpiry(token)).toBe(exp * 1000);
  });

  it('returns null when exp is missing', () => {
    expect(decodeTokenExpiry(makeToken({ sub: 'jdoe' }))).toBeNull();
  });

  it('returns null for a malformed token', () => {
    expect(decodeTokenExpiry('not-a-jwt')).toBeNull();
  });
});

describe('isExpired', () => {
  const session: AuthSession = { token, expiresAt: 1000, user };

  it('is false before expiry', () => {
    expect(isExpired(session, 999)).toBe(false);
  });

  it('is true at and after expiry', () => {
    expect(isExpired(session, 1000)).toBe(true);
    expect(isExpired(session, 1001)).toBe(true);
  });
});

describe('sessionFromLoginResponse', () => {
  it('builds a session using the token expiry', () => {
    const session = sessionFromLoginResponse({
      access_token: token,
      token_type: 'bearer',
      expires_at: '2000-01-01T00:00:00Z',
      user,
    });

    expect(session).toEqual({ token, expiresAt: exp * 1000, user });
  });

  it('falls back to expires_at when the token has no exp', () => {
    const session = sessionFromLoginResponse({
      access_token: 'opaque',
      token_type: 'bearer',
      expires_at: '2030-01-01T00:00:00Z',
      user,
    });

    expect(session.expiresAt).toBe(Date.parse('2030-01-01T00:00:00Z'));
  });
});

describe('SessionStorage', () => {
  let storage: MemoryStorage;
  let sessions: SessionStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    sessions = new SessionStorage(storage);
  });

  it('round-trips a saved session', () => {
    sessions.save({ token, expiresAt: exp * 1000, user });

    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe(token);
    expect(sessions.load()).toEqual({ token, expiresAt: exp * 1000, user });
  });

  it('returns null when nothing is stored', () => {
    expect(sessions.load()).toBeNull();
  });

  it('returns null when the stored token is unreadable', () => {
    storage.setItem(TOKEN_STORAGE_KEY, 'not-a-jwt');
    storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));

    expect(sessions.load()).toBeNull();
  });

  it('returns null when the stored user is invalid', () => {
    storage.setItem(TOKEN_STORAGE_KEY, token);
    storage.setItem(USER_STORAGE_KEY, '{bad json');
    expect(sessions.load()).toBeNull();

    storage.setItem(USER_STORAGE_KEY, JSON.stringify({ sub: 'jdoe' }));
    expect(sessions.load()).toBeNull();
  });

  it('clears both keys', () => {
    sessions.save({ token, expiresAt: exp * 1000, user });
    sessions.clear();

    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(USER_STORAGE_KEY)).toBeNull();
  });
});
