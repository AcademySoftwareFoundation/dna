import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { apiHandler } from '../api';
import { ShotGridAuthProvider, useShotGridAuth } from './ShotGridAuthContext';

const STORAGE_KEY = 'dna-auth-token';
const USER_STORAGE_KEY = 'dna-auth-user';

export type AuthProviderType = 'none' | 'shotgrid';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  authProvider: AuthProviderType;
  signIn: () => void;
  signInWithEmail: (email: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthProvider(): AuthProviderType {
  const provider = import.meta.env.VITE_AUTH_PROVIDER || 'none';
  if (provider === 'shotgrid') return 'shotgrid';
  return 'none';
}

interface NoopAuthProviderInnerProps {
  children: ReactNode;
}

// AUTH_PROVIDER=none — development/testing only.
// Uses sessionStorage so credentials are scoped to the current tab and cleared
// when the tab closes, matching the behaviour of ShotGridAuthProvider.
function NoopAuthProviderInner({ children }: NoopAuthProviderInnerProps) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = sessionStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { return null; }
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (token !== 'noop-token' || !user?.email) return;
    sessionStorage.setItem(STORAGE_KEY, user.email);
    setToken(user.email);
  }, [token, user?.email]);

  useEffect(() => {
    const authToken =
      token === 'noop-token' && user?.email ? user.email : token;
    if (authToken && user) {
      apiHandler.setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        token: authToken,
      });
    } else {
      apiHandler.setUser(null);
    }
  }, [token, user]);

  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
    apiHandler.setUser(null);
  }, []);

  const handleSignInWithEmail = useCallback((email: string) => {
    const authUser: AuthUser = {
      id: email,
      email: email,
      name: email.split('@')[0],
    };
    sessionStorage.setItem(STORAGE_KEY, email);
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authUser));
    setToken(email);
    setUser(authUser);
  }, []);

  const value: AuthContextValue = {
    isAuthenticated: !!token && !!user,
    isLoading: false,
    user,
    token,
    authProvider: 'none',
    signIn: () => console.warn('Use signInWithEmail for noop auth provider'),
    signInWithEmail: handleSignInWithEmail,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Adapter: bridges ShotGridAuthContext into the shared AuthContext shape so
// all existing components using useAuth() continue to work unchanged.
function ShotGridAuthAdapterInner({ children }: { children: ReactNode }) {
  const sg = useShotGridAuth();

  const value: AuthContextValue = {
    isAuthenticated: sg.isAuthenticated,
    isLoading: sg.isLoading,
    user: sg.user
      ? { id: String(sg.user.id), email: sg.user.email, name: sg.user.name }
      : null,
    token: sg.token,
    authProvider: 'shotgrid',
    signIn: () => console.warn('Use ShotGridLoginPage for ShotGrid auth'),
    signInWithEmail: (email) =>
      console.warn(`signInWithEmail(${email}) is not supported with ShotGrid PAT auth`),
    signOut: sg.signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const authProviderType = getAuthProvider();

  if (authProviderType === 'shotgrid') {
    return (
      <ShotGridAuthProvider>
        <ShotGridAuthAdapterInner>{children}</ShotGridAuthAdapterInner>
      </ShotGridAuthProvider>
    );
  }

  // AUTH_PROVIDER=none — development/testing only
  return <NoopAuthProviderInner>{children}</NoopAuthProviderInner>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
