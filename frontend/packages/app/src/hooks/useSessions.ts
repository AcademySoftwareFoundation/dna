import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addSessionId,
  removeSessionId,
  type PlaylistMetadata,
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

export function useSessionPlaylists(sessionId: string | null) {
  return useQuery<SessionPlaylists, Error>({
    queryKey: ['sessionPlaylists', sessionId],
    queryFn: () => apiHandler.getSessionPlaylists({ sessionId: sessionId! }),
    enabled: !!sessionId,
  });
}

export function useAddPlaylistToSession() {
  const queryClient = useQueryClient();

  return useMutation<
    PlaylistMetadata,
    Error,
    { sessionId: string; playlistId: string }
  >({
    mutationFn: async ({ sessionId, playlistId }) => {
      const existing = await apiHandler.getPlaylistMetadata({ playlistId });
      const sessionIds = addSessionId(existing?.session_ids, sessionId);
      if (existing?.session_ids.includes(sessionId)) {
        return existing;
      }
      return apiHandler.upsertPlaylistMetadata({
        playlistId,
        data: { session_ids: sessionIds },
      });
    },
    onSuccess: (saved, { sessionId, playlistId }) => {
      queryClient.setQueryData(['playlistMetadata', playlistId], saved);
      queryClient.setQueryData<SessionPlaylists>(
        ['sessionPlaylists', sessionId],
        (current) => {
          const playlistIds = current?.playlist_ids ?? [];
          if (playlistIds.includes(playlistId)) {
            return (
              current ?? { session_id: sessionId, playlist_ids: playlistIds }
            );
          }
          return {
            session_id: sessionId,
            playlist_ids: [...playlistIds, playlistId],
          };
        }
      );
      void queryClient.invalidateQueries({
        queryKey: ['sessionPlaylists', sessionId],
      });
    },
  });
}

export function useRemovePlaylistFromSession() {
  const queryClient = useQueryClient();

  return useMutation<
    PlaylistMetadata | null,
    Error,
    { sessionId: string; playlistId: string }
  >({
    mutationFn: async ({ sessionId, playlistId }) => {
      const existing = await apiHandler.getPlaylistMetadata({ playlistId });
      if (!existing?.session_ids.includes(sessionId)) {
        return existing;
      }
      return apiHandler.upsertPlaylistMetadata({
        playlistId,
        data: {
          session_ids: removeSessionId(existing.session_ids, sessionId),
        },
      });
    },
    onSuccess: (saved, { sessionId, playlistId }) => {
      if (saved) {
        queryClient.setQueryData(['playlistMetadata', playlistId], saved);
      }
      queryClient.setQueryData<SessionPlaylists>(
        ['sessionPlaylists', sessionId],
        (current) => ({
          session_id: sessionId,
          playlist_ids: (current?.playlist_ids ?? []).filter(
            (id) => id !== playlistId
          ),
        })
      );
      void queryClient.invalidateQueries({
        queryKey: ['sessionPlaylists', sessionId],
      });
    },
  });
}
