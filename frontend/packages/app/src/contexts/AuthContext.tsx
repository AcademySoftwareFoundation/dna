import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthSessionUser,
} from '@dna/core';
import { apiHandler } from '../api';

export type AuthProviderType = 'none' | 'google' | 'shotgrid';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  login?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  authProvider: AuthProviderType;
  signIn: () => void;
  signInWithEmail: (email: string) => void;
  signInWithPassword: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthProvider(): AuthProviderType {
  const provider = import.meta.env.VITE_AUTH_PROVIDER || 'google';
  if (provider === 'none' || provider === 'google' || provider === 'shotgrid') {
    return provider;
  }
  console.warn(
    `Unknown VITE_AUTH_PROVIDER "${provider}". Falling back to noop auth.`
  );
  return 'none';
}

function toAuthUser(user: AuthSessionUser): AuthUser {
  return {
    id: user.id || user.email,
    email: user.email,
    name: user.name,
    picture: user.picture,
    login: user.login,
  };
}

function applySessionToApi(token: string | null, user: AuthUser | null): void {
  if (token && user) {
    apiHandler.setUser({
      id: user.id,
      email: user.email,
      name: user.name,
      token,
      login: user.login,
    });
  } else {
    apiHandler.setUser(null);
  }
}

function useStoredSession(): {
  user: AuthUser | null;
  token: string | null;
  setSession: (token: string | null, user: AuthUser | null) => void;
  clearSession: () => void;
} {
  const stored = readAuthSession();
  const [user, setUser] = useState<AuthUser | null>(
    stored ? toAuthUser(stored.user) : null
  );
  const [token, setToken] = useState<string | null>(stored?.token ?? null);

  const setSession = useCallback(
    (nextToken: string | null, nextUser: AuthUser | null) => {
      setToken(nextToken);
      setUser(nextUser);
      applySessionToApi(nextToken, nextUser);
    },
    []
  );

  const clearSession = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setUser(null);
    apiHandler.setUser(null);
    apiHandler.setAuthRefreshHandler(null);
  }, []);

  useEffect(() => {
    applySessionToApi(token, user);
  }, [token, user]);

  return { user, token, setSession, clearSession };
}

interface NoopAuthProviderInnerProps {
  children: ReactNode;
}

function NoopAuthProviderInner({ children }: NoopAuthProviderInnerProps) {
  const { user, token, setSession, clearSession } = useStoredSession();

  useEffect(() => {
    if (token !== 'noop-token' || !user?.email) return;
    writeAuthSession({
      token: user.email,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        login: user.login,
      },
    });
    setSession(user.email, user);
  }, [token, user, setSession]);

  const handleSignInWithEmail = useCallback(
    (email: string) => {
      const authUser: AuthUser = {
        id: email,
        email,
        name: email.split('@')[0],
        login: email.split('@')[0],
      };
      writeAuthSession({
        token: email,
        user: authUser,
      });
      setSession(email, authUser);
    },
    [setSession]
  );

  const value: AuthContextValue = {
    isAuthenticated: !!token && !!user,
    isLoading: false,
    user,
    token,
    authProvider: 'none',
    signIn: () => console.warn('Use signInWithEmail for noop auth provider'),
    signInWithEmail: handleSignInWithEmail,
    signInWithPassword: async () => {
      console.warn('Use signInWithEmail for noop auth provider');
    },
    signOut: clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface GoogleAuthProviderInnerProps {
  children: ReactNode;
}

function GoogleAuthProviderInner({ children }: GoogleAuthProviderInnerProps) {
  const { user, token, setSession, clearSession } = useStoredSession();
  const [isLoading, setIsLoading] = useState(false);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      try {
        const userInfoResponse = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          }
        );
        const userInfo = await userInfoResponse.json();

        const authUser: AuthUser = {
          id: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          login: String(userInfo.email || '').split('@')[0],
        };

        const accessToken = tokenResponse.access_token;
        writeAuthSession({
          token: accessToken,
          user: authUser,
        });
        setSession(accessToken, authUser);
      } catch (error) {
        console.error('Failed to get user info:', error);
        clearSession();
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google login failed:', error);
      setIsLoading(false);
    },
    scope: 'openid email profile',
    flow: 'implicit',
  });

  const handleSignIn = useCallback(() => {
    setIsLoading(true);
    googleLogin();
  }, [googleLogin]);

  const value: AuthContextValue = {
    isAuthenticated: !!token && !!user,
    isLoading,
    user,
    token,
    authProvider: 'google',
    signIn: handleSignIn,
    signInWithEmail: () => console.warn('Use signIn for Google auth provider'),
    signInWithPassword: async () => {
      console.warn('Use signIn for Google auth provider');
    },
    signOut: clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface ShotgridAuthProviderInnerProps {
  children: ReactNode;
}

function ShotgridAuthProviderInner({
  children,
}: ShotgridAuthProviderInnerProps) {
  const { user, token, setSession, clearSession } = useStoredSession();
  const [isLoading, setIsLoading] = useState(false);

  const persistSession = useCallback(
    (session: {
      token: string;
      refresh_token?: string | null;
      expires_in?: number | null;
      principal: {
        email: string;
        login: string;
        name?: string | null;
      };
    }) => {
      const authUser: AuthUser = {
        id: session.principal.email,
        email: session.principal.email,
        name: session.principal.name || undefined,
        login: session.principal.login,
      };
      writeAuthSession(
        {
          token: session.token,
          refreshToken: session.refresh_token,
          user: authUser,
        },
        session.expires_in
      );
      setSession(session.token, authUser);
      return session.token;
    },
    [setSession]
  );

  useEffect(() => {
    apiHandler.setAuthRefreshHandler(async () => {
      const stored = readAuthSession();
      if (!stored?.refreshToken) {
        clearSession();
        return null;
      }
      try {
        const session = await apiHandler.refreshAuth(stored.refreshToken);
        return persistSession(session);
      } catch {
        clearSession();
        return null;
      }
    });
    return () => {
      apiHandler.setAuthRefreshHandler(null);
    };
  }, [clearSession, persistSession]);

  const handleSignInWithPassword = useCallback(
    async (username: string, password: string) => {
      setIsLoading(true);
      try {
        const session = await apiHandler.login(username, password);
        if (session.principal.provider !== 'shotgrid') {
          clearSession();
          throw new Error(
            `Auth provider mismatch: frontend expects shotgrid but backend returned ${session.principal.provider}. Restart the backend after setting AUTH_PROVIDER=shotgrid.`
          );
        }
        persistSession(session);
      } catch (error) {
        clearSession();
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [clearSession, persistSession]
  );

  const value: AuthContextValue = {
    isAuthenticated: !!token && !!user,
    isLoading,
    user,
    token,
    authProvider: 'shotgrid',
    signIn: () =>
      console.warn('Use signInWithPassword for ShotGrid auth provider'),
    signInWithEmail: () =>
      console.warn('Use signInWithPassword for ShotGrid auth provider'),
    signInWithPassword: handleSignInWithPassword,
    signOut: clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface AuthProviderProps {
  children: ReactNode;
  clientId?: string;
}

export function AuthProvider({ children, clientId }: AuthProviderProps) {
  const authProviderType = getAuthProvider();

  if (authProviderType === 'none') {
    return <NoopAuthProviderInner>{children}</NoopAuthProviderInner>;
  }

  if (authProviderType === 'shotgrid') {
    return <ShotgridAuthProviderInner>{children}</ShotgridAuthProviderInner>;
  }

  const googleClientId =
    clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  if (!googleClientId) {
    console.warn(
      'VITE_GOOGLE_CLIENT_ID is not set. Falling back to noop auth.'
    );
    return <NoopAuthProviderInner>{children}</NoopAuthProviderInner>;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <GoogleAuthProviderInner>{children}</GoogleAuthProviderInner>
    </GoogleOAuthProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
