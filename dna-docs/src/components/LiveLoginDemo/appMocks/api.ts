import {DEMO_ENTITIES, demoVersion, searchDemoEntities} from './entities';
import {DEMO_PLAYLISTS, SESSION_TABS_PLAYLISTS, SESSION_TABS_PROJECT_ID} from './playlists';
import {setDemoTranscriptionPaused} from './transcription';
import {demoSessionPlaylistIds} from './useSessions';

// Stands in for frontend/packages/app/src/api in docs demos (see
// plugins/dna-app-embed.ts). Returns sample data in the shape of the app's
// React Query hooks and API handler, without a backend.

export const PROJECTS = [
  {type: 'Project' as const, id: '101', name: 'Hyperspace'},
  {type: 'Project' as const, id: '102', name: 'Demo Dune'},
];

const PLAYLISTS: Record<string, {id: string; code: string}[]> = {
  '101': DEMO_PLAYLISTS.map(({id, code}) => ({id, code})),
  '102': [
    {id: '1021', code: 'Lighting Dailies 10-27'},
    {id: '1022', code: 'FX Dailies 10-26'},
  ],
  // The session tabs demo's own project: short names, so several tabs fit
  // the header. Not in PROJECTS, so the login demo never lists it.
  [SESSION_TABS_PROJECT_ID]: SESSION_TABS_PLAYLISTS.map(({id, code}) => ({id, code})),
};

function result<T>(data: T | undefined) {
  return {data, isLoading: false, isError: false, error: null};
}

export function useGetProjectsForUser(userEmail: string | null) {
  return result(userEmail ? PROJECTS : undefined);
}

/**
 * The notes editor's calls: entity search, and attachments that "upload"
 * instantly; the menus demo's add-version and create-playlist; and the
 * transcription menu's user settings (the default language) and its
 * pause/resume, which flips the transcription demo's pretend session; and
 * the sign-in screen's lookup of a session's playlists.
 */
export const apiHandler = {
  searchEntities: async ({
    query,
    entityTypes,
    limit = 10,
  }: {
    query: string;
    entityTypes: string[];
    projectId?: string;
    limit?: number;
  }) => searchDemoEntities(query, entityTypes, limit),
  uploadAttachment: async (_file: File) => ({id: `demo-${Date.now()}`}),
  deleteAttachment: async (_id: string) => {},
  getAttachmentBlobUrl: async (_id: string) => '',
  addVersionToPlaylist: async ({versionId}: {playlistId: string; versionId: string}) => {
    const entity = DEMO_ENTITIES.find((e) => e.type === 'Version' && e.id === versionId);
    if (!entity) throw new Error('Version not found');
    return demoVersion(entity.name);
  },
  createPlaylist: async ({projectId, name}: {projectId: string; name: string}) => ({
    type: 'Playlist' as const,
    id: `${projectId}-${Date.now()}`,
    code: name,
    versions: [],
  }),
  getUserSettings: async (_: {userEmail: string}) => ({transcription_language: 'en'}),
  getSessionPlaylists: async ({sessionId}: {sessionId: string}) => ({
    session_id: sessionId,
    playlist_ids: demoSessionPlaylistIds(sessionId),
  }),
  updateSessionTranscription: async ({
    sessionId,
    data,
  }: {
    sessionId: string;
    data: {transcription_paused: boolean};
  }) => {
    setDemoTranscriptionPaused(data.transcription_paused);
    return {id: sessionId, transcription_paused: data.transcription_paused};
  },
};

export function useGetPlaylistsForProject(projectId: string | null) {
  const playlists = projectId ? (PLAYLISTS[projectId] ?? []) : undefined;
  return result(
    playlists?.map((playlist) => ({
      type: 'Playlist' as const,
      id: playlist.id,
      code: playlist.code,
      versions: [],
    })),
  );
}
