import { jwtDecode } from 'jwt-decode';

export interface AuthUser {
  sub: string;
  email: string;
  name?: string | null;
}

export interface AuthSession {
  token: string;
  /** Expiry as epoch milliseconds. */
  expiresAt: number;
  user: AuthUser;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  user: AuthUser;
}

export const TOKEN_STORAGE_KEY = 'dna-auth-token';
export const USER_STORAGE_KEY = 'dna-auth-user';

/** Returns the token's `exp` claim as epoch milliseconds, or null if absent or unreadable. */
export function decodeTokenExpiry(token: string): number | null {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isExpired(
  session: AuthSession,
  now: number = Date.now()
): boolean {
  return now >= session.expiresAt;
}

export function sessionFromLoginResponse(response: LoginResponse): AuthSession {
  return {
    token: response.access_token,
    expiresAt:
      decodeTokenExpiry(response.access_token) ??
      new Date(response.expires_at).getTime(),
    user: response.user,
  };
}

/** Persists the session in localStorage; the expiry is always re-read from the token. */
export class SessionStorage {
  constructor(private readonly storage: Storage = localStorage) {}

  load(): AuthSession | null {
    const token = this.storage.getItem(TOKEN_STORAGE_KEY);
    const rawUser = this.storage.getItem(USER_STORAGE_KEY);
    if (!token || !rawUser) return null;

    const expiresAt = decodeTokenExpiry(token);
    if (expiresAt === null) return null;

    try {
      const user = JSON.parse(rawUser) as AuthUser;
      if (!user?.sub || !user?.email) return null;
      return { token, expiresAt, user };
    } catch {
      return null;
    }
  }

  save(session: AuthSession): void {
    this.storage.setItem(TOKEN_STORAGE_KEY, session.token);
    this.storage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
  }

  clear(): void {
    this.storage.removeItem(TOKEN_STORAGE_KEY);
    this.storage.removeItem(USER_STORAGE_KEY);
  }
}
