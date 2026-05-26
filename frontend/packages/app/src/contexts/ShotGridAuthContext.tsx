import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { apiHandler } from '../api';

const TOKEN_KEY = 'dna-sg-token';
const USER_KEY = 'dna-sg-user';

// JWT auto-refresh 25 minutes before expiry (token lifetime is 480 min = 8 h)
const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

export interface ShotGridUser {
  id: number | string;
  email: string;
  name: string;
  shotgrid_user_id?: number;
}

interface ShotGridAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: ShotGridUser | null;
  token: string | null;
  authProvider: 'shotgrid';
  /** ShotGrid PAT (username + password) login */
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const ShotGridAuthContext = createContext<ShotGridAuthContextValue | null>(null);

interface ShotGridAuthProviderProps {
  children: ReactNode;
}

export function ShotGridAuthProvider({ children }: ShotGridAuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<ShotGridUser | null>(() => {
    const stored = sessionStorage.getItem(USER_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { return null; }
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY)
  );

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // ── Helpers ──────────────────────────────────────────────────────────── //

  const persist = useCallback((jwt: string, authUser: ShotGridUser) => {
    sessionStorage.setItem(TOKEN_KEY, jwt);
    sessionStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setToken(jwt);
    setUser(authUser);
    apiHandler.setUser({ id: String(authUser.id), email: authUser.email, name: authUser.name, token: jwt });
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    apiHandler.setUser(null);
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // ── Validate stored token on mount ───────────────────────────────────── //
  //
  // Single effect handles all three cases:
  //   200 OK  → token valid; refresh user data from response and restore apiHandler
  //   401/403 → token rejected; call clear() so login page is shown
  //   network error / 5xx → keep stored credentials; app will surface 401s
  //                          naturally if the session really is dead

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedToken = sessionStorage.getItem(TOKEN_KEY);
      const storedUserRaw = sessionStorage.getItem(USER_KEY);
      const storedUser: ShotGridUser | null = storedUserRaw
        ? (() => { try { return JSON.parse(storedUserRaw); } catch { return null; } })()
        : null;

      if (storedToken) {
        try {
          const meRes = await fetch(`${apiBase}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });

          if (cancelled) return;

          if (meRes.status === 401 || meRes.status === 403) {
            // Definitive rejection — wipe the stale session.
            clear();
          } else if (meRes.ok) {
            // Token is valid. Parse the response to get fresh user data.
            // This also covers the case where USER_KEY was missing (e.g. cleared
            // by another tab) but the token is still alive.
            const meData = await meRes.json().catch(() => null);
            const freshUser: ShotGridUser = {
              id: meData?.shotgrid_user_id ?? storedUser?.id ?? 0,
              email: meData?.email ?? storedUser?.email ?? '',
              name: meData?.name ?? storedUser?.name ?? '',
              shotgrid_user_id: meData?.shotgrid_user_id ?? storedUser?.shotgrid_user_id,
            };
            if (!cancelled) {
              // Update sessionStorage and state with the freshest user data,
              // then wire up apiHandler so all API calls are authenticated.
              persist(storedToken, freshUser);
            }
          } else {
            // Non-401/403 server error (e.g. 500, 503) — keep credentials;
            // do not log the user out for a transient backend issue.
            if (storedUser) {
              apiHandler.setUser({ id: String(storedUser.id), email: storedUser.email, name: storedUser.name, token: storedToken });
            }
          }
        } catch {
          // Network error — backend unreachable. Keep stored credentials so the
          // user isn't forced to log in again just because the backend is starting.
          if (!cancelled && storedUser) {
            apiHandler.setUser({ id: String(storedUser.id), email: storedUser.email, name: storedUser.name, token: storedToken });
          }
        }
      }

      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PAT sign-in ──────────────────────────────────────────────────────── //

  const signIn = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Login failed');
      }
      const data = await res.json();
      persist(data.access_token, {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        shotgrid_user_id: data.user.shotgrid_user_id,
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, persist]);

  // ── Token refresh ────────────────────────────────────────────────────── //

  const refreshToken = useCallback(async () => {
    const currentToken = sessionStorage.getItem(TOKEN_KEY);
    if (!currentToken) return;
    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!res.ok) { clear(); return; }
      const data = await res.json();
      const currentUser = sessionStorage.getItem(USER_KEY);
      const parsedUser: ShotGridUser | null = currentUser
        ? (() => { try { return JSON.parse(currentUser); } catch { return null; } })()
        : null;
      if (parsedUser) {
        persist(data.access_token, { ...parsedUser, ...data.user });
      } else {
        // No stored user — can't restore; force re-login.
        clear();
      }
    } catch (err) {
      console.error('[ShotGridAuth] Token refresh failed:', err);
      clear();
    }
  }, [apiBase, persist, clear]);

  // Auto-refresh every 25 minutes
  useEffect(() => {
    if (!token) return;
    refreshTimerRef.current = setInterval(refreshToken, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [token, refreshToken]);

  // ── Sign-out ─────────────────────────────────────────────────────────── //

  const signOut = useCallback(async () => {
    const currentToken = sessionStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      try {
        await fetch(`${apiBase}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch { /* best-effort — clear locally regardless */ }
    }
    clear();
  }, [apiBase, clear]);

  const value: ShotGridAuthContextValue = {
    isAuthenticated: !!token && !!user,
    isLoading,
    user,
    token,
    authProvider: 'shotgrid',
    signIn,
    signOut,
    refreshToken,
  };

  return (
    <ShotGridAuthContext.Provider value={value}>
      {children}
    </ShotGridAuthContext.Provider>
  );
}

export function useShotGridAuth(): ShotGridAuthContextValue {
  const ctx = useContext(ShotGridAuthContext);
  if (!ctx) throw new Error('useShotGridAuth must be used within ShotGridAuthProvider');
  return ctx;
}
