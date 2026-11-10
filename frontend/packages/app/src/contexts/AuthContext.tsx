import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  SessionStorage,
  isExpired,
  sessionFromLoginResponse,
  type AuthSession,
  type AuthUser,
} from '@dna/core';
import { apiHandler } from '../api';

export type { AuthUser };

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  signInError: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(session: AuthSession | null): void {
  apiHandler.setUser(
    session
      ? {
          id: session.user.sub,
          email: session.user.email,
          name: session.user.name ?? undefined,
          token: session.token,
        }
      : null
  );
}

function loadSession(sessions: SessionStorage): AuthSession | null {
  const session = sessions.load();
  if (session && isExpired(session)) {
    sessions.clear();
    return null;
  }
  applySession(session);
  return session;
}

function signInErrorMessage(error: unknown): string {
  const response = (
    error as { response?: { status?: number; data?: { detail?: unknown } } }
  )?.response;
  if (response?.status === 401) {
    const detail = response.data?.detail;
    return typeof detail === 'string' ? detail : 'Invalid username or password';
  }
  return 'Sign in failed. Please try again.';
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [sessions] = useState(() => new SessionStorage());
  const [session, setSession] = useState(() => loadSession(sessions));
  const [isLoading, setIsLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    sessions.clear();
    applySession(null);
    setSession(null);
  }, [sessions]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      setIsLoading(true);
      setSignInError(null);
      try {
        const next = sessionFromLoginResponse(
          await apiHandler.login(username, password)
        );
        sessions.save(next);
        applySession(next);
        setSession(next);
      } catch (error) {
        setSignInError(signInErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    },
    [sessions]
  );

  useEffect(() => {
    apiHandler.onUnauthorized(signOut);
    return () => apiHandler.onUnauthorized(null);
  }, [signOut]);

  useEffect(() => {
    if (!session) return;
    const remaining = Math.max(session.expiresAt - Date.now(), 0);
    const timer = setTimeout(signOut, Math.min(remaining, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [session, signOut]);

  const value: AuthContextValue = {
    isAuthenticated: !!session,
    isLoading,
    user: session?.user ?? null,
    token: session?.token ?? null,
    signInError,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
