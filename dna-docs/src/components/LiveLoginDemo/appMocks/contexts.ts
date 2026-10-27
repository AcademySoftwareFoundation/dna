import {useDemoState} from './demoState';

// Stands in for frontend/packages/app/src/contexts in docs demos (see
// plugins/dna-app-embed.ts). Only the hooks the demoed components use.

/** Email sign-in that always succeeds, like the app's `none` auth provider. */
export function useAuth() {
  const {email, setEmail} = useDemoState();
  return {
    isAuthenticated: email !== null,
    isLoading: false,
    user: email ? {email, name: email} : null,
    token: null,
    authProvider: 'none' as const,
    signIn: () => {},
    signInWithEmail: (value: string) => setEmail(value),
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
