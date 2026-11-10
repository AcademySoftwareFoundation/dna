import {useDemoState} from './demoState';

// Stands in for frontend/packages/app/src/contexts in docs demos (see
// plugins/dna-app-embed.ts). Only the hooks the demoed components use.

/** Sign-in that accepts any password, like the backend's `mock` auth provider. */
export function useAuth() {
  const {email, setEmail} = useDemoState();
  return {
    isAuthenticated: email !== null,
    isLoading: false,
    user: email ? {sub: email, email, name: email} : null,
    token: null,
    signInError: null,
    signIn: async (username: string, _password: string) =>
      setEmail(username.includes('@') ? username : `${username}@localhost`),
    signOut: () => setEmail(null),
  };
}

/** Follows the docs' light/dark toggle; the accent matches the docs' indigo. */
export function useThemeMode() {
  const {mode} = useDemoState();
  return {
    mode,
    setMode: () => {},
    accent: 'blue' as const,
    setAccent: () => {},
  };
}
