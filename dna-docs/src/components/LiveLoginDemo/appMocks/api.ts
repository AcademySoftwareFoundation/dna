import {searchDemoEntities} from './entities';

// Stands in for frontend/packages/app/src/api in docs demos (see
// plugins/dna-app-embed.ts). Returns sample data in the shape of the app's
// React Query hooks and API handler, without a backend.

const PROJECTS = [
  {type: 'Project' as const, id: '101', name: 'Griffin'},
  {type: 'Project' as const, id: '102', name: 'Hidden Satellite'},
];

const PLAYLISTS: Record<string, {code: string}[]> = {
  '101': [
    {code: 'Anim Dailies 10-27'},
    {code: 'Comp Dailies 10-27'},
    {code: 'Client Review 10-24'},
  ],
  '102': [{code: 'Lighting Dailies 10-27'}, {code: 'FX Dailies 10-26'}],
};

function result<T>(data: T | undefined) {
  return {data, isLoading: false, isError: false, error: null};
}

export function useGetProjectsForUser(userEmail: string | null) {
  return result(userEmail ? PROJECTS : undefined);
}

/** The notes editor's calls: entity search, and attachments that "upload" instantly. */
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
};

export function useGetPlaylistsForProject(projectId: string | null) {
  const playlists = projectId ? (PLAYLISTS[projectId] ?? []) : undefined;
  return result(
    playlists?.map((playlist, i) => ({
      type: 'Playlist' as const,
      id: `${projectId}${i + 1}`,
      code: playlist.code,
      versions: [],
    })),
  );
}
