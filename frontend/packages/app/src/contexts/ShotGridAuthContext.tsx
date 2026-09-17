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

// Short-lived access token, kept per tab. The long-lived refresh token never
// reaches JavaScript: the backend sets it as an httpOnly cookie.
const TOKEN_KEY = 'dna-sg-token';
const USER_KEY = 'dna-sg-user';
const EXPIRES_AT_KEY = 'dna-sg-token-expires-at';

// Renew this long before the access token expires, so requests in flight never
// carry an expired token.
const REFRESH_LEAD_MS = 60 * 1000;
// Floor on scheduling, so a clock skew or tiny lifetime cannot spin a tight loop.
const MIN_REFRESH_DELAY_MS = 5 * 1000;
// Retry cadence when a refresh fails for a transient reason (network, 5xx).
const TRANSIENT_RETRY_MS = 30 * 1000;
// Minimum gap between refreshes triggered by API 401s, so a burst of failing
// requests, or an endpoint that keeps answering 401, cannot flood /auth/refresh.
const UNAUTHORIZED_REFRESH_COOLDOWN_MS = 30 * 1000;

// Cookie-authenticated auth calls must send this header; a cross-site page
// cannot, which is what protects the refresh cookie from CSRF.
const CSRF_HEADERS = { 'X-DNA-CSRF': '1' };

type RefreshOutcome = 'ok' | 'ended' | 'transient';

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
  /** End this session. Local credentials are always cleared. */
  signOut: () => Promise<void>;
  /** End every session for this user, on all devices. Throws if the server could not. */
  signOutEverywhere: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const ShotGridAuthContext = createContext<ShotGridAuthContextValue | null>(
  null
);

interface ShotGridAuthProviderProps {
  children: ReactNode;
}

function readStoredUser(): ShotGridUser | null {
  const stored = sessionStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function readStoredExpiry(): number | null {
  const stored = Number(sessionStorage.getItem(EXPIRES_AT_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

export function ShotGridAuthProvider({ children }: ShotGridAuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<ShotGridUser | null>(readStoredUser);
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY)
  );
  const [expiresAt, setExpiresAt] = useState<number | null>(readStoredExpiry);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRefreshRef = useRef<Promise<RefreshOutcome> | null>(null);
  const lastUnauthorizedRefreshRef = useRef(0);
  // Same source as the shared API client. When unset, requests are relative to
  // the page origin — never a hardcoded host, which in a production build would
  // silently send logins to the viewer's own machine.
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

  // ── Helpers ──────────────────────────────────────────────────────────── //

  const cancelScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const persist = useCallback(
    (jwt: string, authUser: ShotGridUser, expiresInSeconds: number) => {
      const expiry = Date.now() + expiresInSeconds * 1000;
      sessionStorage.setItem(TOKEN_KEY, jwt);
      sessionStorage.setItem(USER_KEY, JSON.stringify(authUser));
      sessionStorage.setItem(EXPIRES_AT_KEY, String(expiry));
      setToken(jwt);
      setUser(authUser);
      setExpiresAt(expiry);
      apiHandler.setUser({
        id: String(authUser.id),
        email: authUser.email,
        name: authUser.name,
        token: jwt,
      });
    },
    []
  );

  const clear = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRES_AT_KEY);
    setToken(null);
    setUser(null);
    setExpiresAt(null);
    apiHandler.setUser(null);
    cancelScheduledRefresh();
  }, [cancelScheduledRefresh]);

  // ── Token refresh ────────────────────────────────────────────────────── //
  //
  // Only a 401/403 ends the session. A network error or 5xx is transient: the
  // user stays signed in and the refresh is retried, so a brief ShotGrid or
  // backend hiccup never throws someone out mid-review.

  const refreshSession = useCallback((): Promise<RefreshOutcome> => {
    // Timer, visibility change and mount can all ask at once; send one request.
    if (inFlightRefreshRef.current) return inFlightRefreshRef.current;

    const request = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: CSRF_HEADERS,
        });
        if (res.status === 401 || res.status === 403) {
          clear();
          return 'ended';
        }
        if (!res.ok) return 'transient';
        const data = await res.json();
        const previous = readStoredUser();
        persist(
          data.access_token,
          { ...(previous ?? {}), ...data.user },
          data.expires_in
        );
        return 'ok';
      } catch (err) {
        console.warn('[ShotGridAuth] Token refresh failed; will retry:', err);
        return 'transient';
      } finally {
        inFlightRefreshRef.current = null;
      }
    })();

    inFlightRefreshRef.current = request;
    return request;
  }, [apiBase, persist, clear]);

  const refreshToken = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  // ── Restore the session on mount ─────────────────────────────────────── //

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedToken = sessionStorage.getItem(TOKEN_KEY);
      const storedUser = readStoredUser();
      const storedExpiry = readStoredExpiry();

      const tokenStillFresh =
        !!storedToken &&
        !!storedExpiry &&
        Date.now() < storedExpiry - REFRESH_LEAD_MS;

      if (tokenStillFresh && storedToken) {
        try {
          const meRes = await fetch(`${apiBase}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (cancelled) return;

          if (meRes.status === 401 || meRes.status === 403) {
            // The access token was rejected; the refresh cookie may still hold
            // a live session. refreshSession clears everything if it does not.
            await refreshSession();
          } else if (meRes.ok) {
            const meData = await meRes.json().catch(() => null);
            if (!cancelled && storedExpiry) {
              persist(
                storedToken,
                {
                  id: meData?.shotgrid_user_id ?? storedUser?.id ?? 0,
                  email: meData?.email ?? storedUser?.email ?? '',
                  name: meData?.name ?? storedUser?.name ?? '',
                  shotgrid_user_id:
                    meData?.shotgrid_user_id ?? storedUser?.shotgrid_user_id,
                },
                (storedExpiry - Date.now()) / 1000
              );
            }
          } else if (storedUser) {
            // Transient server error — keep the user signed in.
            apiHandler.setUser({
              id: String(storedUser.id),
              email: storedUser.email,
              name: storedUser.name,
              token: storedToken,
            });
          }
        } catch {
          // Backend unreachable (e.g. still starting) — keep stored credentials.
          if (!cancelled && storedUser) {
            apiHandler.setUser({
              id: String(storedUser.id),
              email: storedUser.email,
              name: storedUser.name,
              token: storedToken,
            });
          }
        }
      } else {
        // No usable access token in this tab: expired, about to, or a new tab.
        // The shared refresh cookie restores the session without a password.
        const outcome = await refreshSession();
        if (
          !cancelled &&
          outcome === 'transient' &&
          storedToken &&
          storedUser
        ) {
          apiHandler.setUser({
            id: String(storedUser.id),
            email: storedUser.email,
            name: storedUser.name,
            token: storedToken,
          });
        }
      }

      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: this restores the session exactly once. Re-running
    // it whenever `persist`, `clear` or `refreshSession` change identity would
    // re-hit the auth endpoints and could log the user out mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refresh shortly before the access token expires ──────────────────── //

  useEffect(() => {
    cancelScheduledRefresh();
    if (!token || !expiresAt) return;

    const schedule = (delayMs: number) => {
      refreshTimerRef.current = setTimeout(
        async () => {
          const outcome = await refreshSession();
          // 'ok' updates the token, which re-runs this effect with the new expiry.
          if (outcome === 'transient') schedule(TRANSIENT_RETRY_MS);
        },
        Math.max(delayMs, MIN_REFRESH_DELAY_MS)
      );
    };
    schedule(expiresAt - Date.now() - REFRESH_LEAD_MS);

    return cancelScheduledRefresh;
  }, [token, expiresAt, refreshSession, cancelScheduledRefresh]);

  // Browsers pause timers in background tabs and during sleep. When the user
  // comes back, renew immediately if the token has expired or is about to.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const expiry = readStoredExpiry();
      if (
        sessionStorage.getItem(TOKEN_KEY) &&
        expiry &&
        Date.now() >= expiry - REFRESH_LEAD_MS
      ) {
        void refreshSession();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshSession]);

  // An API call answered 401: the session may have ended on the server (logout
  // everywhere, a deactivated account). A refresh either renews it or ends it,
  // which shows the login page instead of a page full of errors.
  useEffect(() => {
    apiHandler.setUnauthorizedHandler(() => {
      if (!sessionStorage.getItem(TOKEN_KEY)) return;
      const now = Date.now();
      if (
        now - lastUnauthorizedRefreshRef.current <
        UNAUTHORIZED_REFRESH_COOLDOWN_MS
      ) {
        return;
      }
      lastUnauthorizedRefreshRef.current = now;
      void refreshSession();
    });
    return () => apiHandler.setUnauthorizedHandler(null);
  }, [refreshSession]);

  // ── PAT sign-in ──────────────────────────────────────────────────────── //

  const signIn = useCallback(
    async (username: string, password: string) => {
      setIsLoading(true);
      try {
        const res = await fetch(`${apiBase}/auth/login`, {
          method: 'POST',
          // Needed so the browser stores the httpOnly refresh cookie.
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Login failed');
        }
        const data = await res.json();
        persist(
          data.access_token,
          {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            shotgrid_user_id: data.user.shotgrid_user_id,
          },
          data.expires_in
        );
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase, persist]
  );

  // ── Sign-out ─────────────────────────────────────────────────────────── //

  const signOut = useCallback(async () => {
    const currentToken = sessionStorage.getItem(TOKEN_KEY);
    try {
      const res = await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...CSRF_HEADERS,
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
      });
      if (res.status === 503) {
        console.warn(
          '[ShotGridAuth] The server could not end the session; it may still be active.'
        );
      }
    } catch {
      console.warn(
        '[ShotGridAuth] Logout request failed; the session may still be active.'
      );
    }
    // Always discard local credentials, whatever the server said.
    clear();
  }, [apiBase, clear]);

  const signOutEverywhere = useCallback(async () => {
    const currentToken = sessionStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${apiBase}/auth/logout-all`, {
      method: 'POST',
      credentials: 'include',
      headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
    });
    if (res.ok || res.status === 401) {
      clear();
      return;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Could not sign out of all sessions');
  }, [apiBase, clear]);

  const value: ShotGridAuthContextValue = {
    isAuthenticated: !!token && !!user,
    isLoading,
    user,
    token,
    authProvider: 'shotgrid',
    signIn,
    signOut,
    signOutEverywhere,
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
  if (!ctx)
    throw new Error('useShotGridAuth must be used within ShotGridAuthProvider');
  return ctx;
}
