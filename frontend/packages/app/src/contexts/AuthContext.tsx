import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { apiHandler } from '../api';

const STORAGE_KEY = 'dna-auth-token';
const USER_STORAGE_KEY = 'dna-auth-user';

export type AuthProviderType = 'none' | 'google';

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
  const provider = import.meta.env.VITE_AUTH_PROVIDER || 'google';
  if (provider === 'none' || provider === 'google') {
    return provider;
  }
  return 'google';
}

interface NoopAuthProviderInnerProps {
  children: ReactNode;
}

function NoopAuthProviderInner({ children }: NoopAuthProviderInnerProps) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (token && user) {
      apiHandler.setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        token: token,
      });
    } else {
      apiHandler.setUser(null);
    }
  }, [token, user]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
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

    const noopToken = 'noop-token';

    localStorage.setItem(STORAGE_KEY, noopToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authUser));

    setToken(noopToken);
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

interface GoogleAuthProviderInnerProps {
  children: ReactNode;
}

function GoogleAuthProviderInner({ children }: GoogleAuthProviderInnerProps) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (token && user) {
      apiHandler.setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        token: token,
      });
    } else {
      apiHandler.setUser(null);
    }
  }, [token, user]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
    apiHandler.setUser(null);
  }, []);

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
        };

        const accessToken = tokenResponse.access_token;

        localStorage.setItem(STORAGE_KEY, accessToken);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authUser));

        setToken(accessToken);
        setUser(authUser);
      } catch (error) {
        console.error('Failed to get user info:', error);
        handleSignOut();
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
    signInWithEmail: () =>
      console.warn('Use signIn for Google auth provider'),
    signOut: handleSignOut,
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
