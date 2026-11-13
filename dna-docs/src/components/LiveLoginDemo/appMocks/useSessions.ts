import {useState} from 'react';
import {DEMO_PLAYLISTS} from './playlists';

// Stands in for frontend/packages/app/src/hooks/useSessions in docs demos
// (see plugins/dna-app-embed.ts): sample sessions for the sign-in screen's
// session step, without a backend. The real module would pull in the app's
// API client. Project and playlist ids match ./api.ts.

interface DemoSession {
  id: string;
  name: string;
  project_id: string;
  playlist_ids: string[];
}

const SESSIONS: DemoSession[] = [
  {
    id: 'session-dailies',
    name: 'Morning Dailies',
    project_id: '101',
    playlist_ids: DEMO_PLAYLISTS.slice(0, 2).map((playlist) => playlist.id),
  },
  {
    id: 'session-client',
    name: 'Client Review',
    project_id: '101',
    playlist_ids: DEMO_PLAYLISTS.slice(2, 3).map((playlist) => playlist.id),
  },
  {id: 'session-lighting', name: 'Lighting Dailies', project_id: '102', playlist_ids: ['1021']},
  {id: 'session-fx', name: 'FX Dailies', project_id: '102', playlist_ids: ['1022']},
];

/** The playlists linked to a sample session, for the fake API handler. */
export function demoSessionPlaylistIds(sessionId: string): string[] {
  return SESSIONS.find((session) => session.id === sessionId)?.playlist_ids ?? [];
}

/** The project's sample sessions. */
export function useGetSessionsForProject(projectId: string | null) {
  return {
    data: projectId ? SESSIONS.filter((session) => session.project_id === projectId) : undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
  };
}

/**
 * Create New: a session with no playlists yet, so the sign-in screen goes
 * on to ask for one. Not added to the list; the demo starts over anyway.
 */
export function useCreateSession(projectId: string | null) {
  const [isPending, setIsPending] = useState(false);
  return {
    mutateAsync: async (name: string): Promise<DemoSession> => {
      setIsPending(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      setIsPending(false);
      return {id: `session-${Date.now()}`, name, project_id: projectId ?? '', playlist_ids: []};
    },
    isPending,
    isError: false,
    error: null as Error | null,
  };
}
