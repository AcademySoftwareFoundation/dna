import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addPlaylistId,
  removePlaylistId,
  type Session,
  type SessionPlaylists,
} from '@dna/core';
import { apiHandler } from '../api';

export function useGetSessionsForProject(projectId: string | null) {
  return useQuery<Session[], Error>({
    queryKey: ['sessions', projectId],
    queryFn: () => apiHandler.getSessionsForProject({ projectId: projectId! }),
    enabled: !!projectId,
  });
}

export function useCreateSession(projectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<Session, Error, string>({
    mutationFn: (name: string) =>
      apiHandler.createSession({ projectId: projectId!, name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions', projectId] });
    },
  });
}

export function useSession(sessionId: string | null) {
  return useQuery<Session, Error>({
    queryKey: ['session', sessionId],
    queryFn: () => apiHandler.getSession({ sessionId: sessionId! }),
    enabled: !!sessionId,
  });
}

export function useEnsureSessionForPlaylist() {
  const queryClient = useQueryClient();

  return useMutation<
    Session,
    Error,
    { projectId: string; playlistId: string }
  >({
    mutationFn: ({ projectId, playlistId }) =>
      apiHandler.ensureSessionForPlaylist({ projectId, playlistId }),
    onSuccess: (session) => {
      queryClient.setQueryData(['session', session.id], session);
      void queryClient.invalidateQueries({
        queryKey: ['sessions', session.project_id],
      });
    },
  });
}

export function useSessionPlaylists(sessionId: string | null) {
  return useQuery<SessionPlaylists, Error>({
    queryKey: ['sessionPlaylists', sessionId],
    queryFn: () => apiHandler.getSessionPlaylists({ sessionId: sessionId! }),
    enabled: !!sessionId,
  });
}

function cacheSession(queryClient: ReturnType<typeof useQueryClient>, session: Session) {
  queryClient.setQueryData(['session', session.id], session);
  queryClient.setQueryData<SessionPlaylists>(
    ['sessionPlaylists', session.id],
    {
      session_id: session.id,
      playlist_ids: session.playlist_ids ?? [],
    }
  );
}

export function useAddPlaylistToSession() {
  const queryClient = useQueryClient();

  return useMutation<
    Session,
    Error,
    { sessionId: string; playlistId: string }
  >({
    mutationFn: async ({ sessionId, playlistId }) => {
      const existing = await apiHandler.getSession({ sessionId });
      const playlistIds = addPlaylistId(existing.playlist_ids, playlistId);
      if (existing.playlist_ids?.includes(playlistId)) {
        return existing;
      }
      return apiHandler.updateSessionPlaylists({
        sessionId,
        playlistIds,
      });
    },
    onSuccess: (session) => {
      cacheSession(queryClient, session);
      void queryClient.invalidateQueries({
        queryKey: ['sessions', session.project_id],
      });
    },
  });
}

export function useRemovePlaylistFromSession() {
  const queryClient = useQueryClient();

  return useMutation<
    Session,
    Error,
    { sessionId: string; playlistId: string }
  >({
    mutationFn: async ({ sessionId, playlistId }) => {
      const existing = await apiHandler.getSession({ sessionId });
      if (!existing.playlist_ids?.includes(playlistId)) {
        return existing;
      }
      return apiHandler.updateSessionPlaylists({
        sessionId,
        playlistIds: removePlaylistId(existing.playlist_ids, playlistId),
      });
    },
    onSuccess: (session) => {
      cacheSession(queryClient, session);
      void queryClient.invalidateQueries({
        queryKey: ['sessions', session.project_id],
      });
    },
  });
}
