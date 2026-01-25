import { ApiHandler, Playlist, Project, User, Version } from '@dna/core';
import { useQuery } from '@tanstack/react-query';

const apiHandler = new ApiHandler({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

function useGetProjectsForUser(userEmail: string | null) {
  return useQuery<Project[], Error>({
    queryKey: ['projects', userEmail],
    queryFn: () => apiHandler.getProjectsForUser({ userEmail: userEmail! }),
    enabled: !!userEmail,
  });
}

function useGetPlaylistsForProject(projectId: number | null) {
  return useQuery<Playlist[], Error>({
    queryKey: ['playlists', projectId],
    queryFn: () => apiHandler.getPlaylistsForProject({ projectId: projectId! }),
    enabled: !!projectId,
  });
}

function useGetVersionsForPlaylist(playlistId: number | null) {
  return useQuery<Version[], Error>({
    queryKey: ['versions', playlistId],
    queryFn: () =>
      apiHandler.getVersionsForPlaylist({ playlistId: playlistId! }),
    enabled: !!playlistId,
  });
}

function useGetUserByEmail(userEmail: string | null) {
  return useQuery<User, Error>({
    queryKey: ['user', userEmail],
    queryFn: () => apiHandler.getUserByEmail({ userEmail: userEmail! }),
    enabled: !!userEmail,
  });
}

export {
  useGetProjectsForUser,
  useGetPlaylistsForProject,
  useGetVersionsForPlaylist,
  useGetUserByEmail,
  apiHandler,
};
