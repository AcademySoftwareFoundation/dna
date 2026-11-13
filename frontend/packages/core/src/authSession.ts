export const AUTH_TOKEN_COOKIE = 'dna-auth-token';
export const AUTH_REFRESH_COOKIE = 'dna-auth-refresh';
export const AUTH_USER_COOKIE = 'dna-auth-user';
export const AUTH_TOKEN_STORAGE_KEY = 'dna-auth-token';
export const AUTH_USER_STORAGE_KEY = 'dna-auth-user';
export const AUTH_REFRESH_STORAGE_KEY = 'dna-auth-refresh';

export interface AuthSessionUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  login?: string;
}

export interface StoredAuthSession {
  token: string;
  user: AuthSessionUser;
  refreshToken?: string | null;
}

function cookieAttributes(): string {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  return `Path=/; SameSite=Lax${secure}`;
}

export function setCookie(name: string, value: string, maxAgeSeconds?: number): void {
  if (typeof document === 'undefined') return;
  const maxAge =
    typeof maxAgeSeconds === 'number' ? `; Max-Age=${Math.max(0, maxAgeSeconds)}` : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${maxAge}; ${cookieAttributes()}`;
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; ${cookieAttributes()}`;
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota / private-mode failures; cookie remains canonical.
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function readAuthSession(): StoredAuthSession | null {
  const token =
    getCookie(AUTH_TOKEN_COOKIE) || storageGet(AUTH_TOKEN_STORAGE_KEY);
  const userRaw =
    getCookie(AUTH_USER_COOKIE) || storageGet(AUTH_USER_STORAGE_KEY);
  if (!token || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as AuthSessionUser;
    if (!user?.email) return null;
    const refreshToken =
      getCookie(AUTH_REFRESH_COOKIE) || storageGet(AUTH_REFRESH_STORAGE_KEY);
    return {
      token,
      user,
      refreshToken: refreshToken || null,
    };
  } catch {
    return null;
  }
}

export function writeAuthSession(
  session: StoredAuthSession,
  expiresIn?: number | null
): void {
  const maxAge =
    typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : undefined;
  setCookie(AUTH_TOKEN_COOKIE, session.token, maxAge);
  setCookie(AUTH_USER_COOKIE, JSON.stringify(session.user), maxAge);
  storageSet(AUTH_TOKEN_STORAGE_KEY, session.token);
  storageSet(AUTH_USER_STORAGE_KEY, JSON.stringify(session.user));

  if (session.refreshToken) {
    setCookie(AUTH_REFRESH_COOKIE, session.refreshToken);
    storageSet(AUTH_REFRESH_STORAGE_KEY, session.refreshToken);
  } else {
    deleteCookie(AUTH_REFRESH_COOKIE);
    storageRemove(AUTH_REFRESH_STORAGE_KEY);
  }
}

export function clearAuthSession(): void {
  deleteCookie(AUTH_TOKEN_COOKIE);
  deleteCookie(AUTH_REFRESH_COOKIE);
  deleteCookie(AUTH_USER_COOKIE);
  storageRemove(AUTH_TOKEN_STORAGE_KEY);
  storageRemove(AUTH_USER_STORAGE_KEY);
  storageRemove(AUTH_REFRESH_STORAGE_KEY);
}
