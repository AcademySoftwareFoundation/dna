import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiHandler } from '../api';

/**
 * Fetch versions for every playlist so switching between them reads the cache
 * instead of waiting on the network. Refetches stay in the background.
 */
export function usePrefetchPlaylistVersions(playlistIds: readonly string[]) {
  const queryClient = useQueryClient();
  const key = playlistIds.join('\0');

  useEffect(() => {
    if (!key) return;
    for (const playlistId of key.split('\0')) {
      void queryClient.prefetchQuery({
        queryKey: ['versions', playlistId],
        queryFn: () => apiHandler.getVersionsForPlaylist({ playlistId }),
      });
    }
  }, [queryClient, key]);
}
