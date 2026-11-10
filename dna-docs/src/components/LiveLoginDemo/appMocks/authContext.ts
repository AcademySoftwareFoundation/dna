import {DEMO_SUBMITTER} from './entities';

// Stands in for frontend/packages/app/src/contexts/AuthContext in docs demos
// (see plugins/dna-app-embed.ts). Always signed in as the demo user; for
// demos without the login demo's DemoStateProvider (see ./contexts.ts).

const user = {email: DEMO_SUBMITTER.email, name: DEMO_SUBMITTER.name};

export function useAuth() {
  return {
    isAuthenticated: true,
    isLoading: false,
    user,
    token: null,
    authProvider: 'none' as const,
    signIn: () => {},
    signInWithEmail: () => {},
    signOut: () => {},
  };
}
