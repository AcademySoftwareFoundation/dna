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
  }, []);

  // ── Validate stored token + set loading false on mount ───────────────── //

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Validate stored token on mount.
      // Clears the token on ANY failure — network error OR non-2xx response.
      // This ensures a backend restart (which wipes MongoDB sessions) forces
      // the user back to the login page instead of letting them reach the
      // app with a dead session that returns 401 on every API call.
      const storedToken = sessionStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        // Only clear the token on a definitive rejection (401 / 403).
        // Network errors (backend still starting, transient connectivity) are
        // not treated as token invalidation — the user would lose their session
        // every time the page is opened during a backend restart.
        try {
          const meRes = await fetch(`${apiBase}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          const shouldClear = meRes.status === 401 || meRes.status === 403;
          if (shouldClear && !cancelled) {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
            setToken(null);
            setUser(null);
            apiHandler.setUser(null);
          }
        } catch {
          // Network error — keep the stored token; the user will get a 401
          // on their first real API call if the session truly expired.
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
      const parsedUser: ShotGridUser | null = currentUser ? JSON.parse(currentUser) : null;
      if (parsedUser) {
        persist(data.access_token, { ...parsedUser, ...data.user });
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
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [token, refreshToken]);

  // Restore apiHandler on mount if token already in sessionStorage
  useEffect(() => {
    if (token && user) {
      apiHandler.setUser({ id: String(user.id), email: user.email, name: user.name, token });
    }
  // Run only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sign-out ─────────────────────────────────────────────────────────── //

  const signOut = useCallback(async () => {
    const currentToken = sessionStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      try {
        await fetch(`${apiBase}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch { /* best-effort */ }
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
