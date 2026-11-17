export interface RecentSessionEntry {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
}

/** Alias for playlist-mode recent entries (same shape). */
export type RecentPlaylistEntry = RecentSessionEntry;

export const RECENT_SESSIONS_KEY = 'dna-recent-sessions';
export const RECENT_PLAYLISTS_KEY = 'dna-recent-playlists';
export const RECENT_SESSIONS_MAX = 5;

function readRecentEntries(storageKey: string): RecentSessionEntry[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentSessionEntry =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as RecentSessionEntry).id === 'string' &&
          typeof (item as RecentSessionEntry).projectId === 'string'
      )
      .map((item) => ({
        id: item.id,
        name: typeof item.name === 'string' && item.name ? item.name : item.id,
        projectId: item.projectId,
        projectName:
          typeof item.projectName === 'string' ? item.projectName : undefined,
      }))
      .slice(0, RECENT_SESSIONS_MAX);
  } catch {
    return [];
  }
}

function rememberRecentEntry(
  storageKey: string,
  entry: RecentSessionEntry
): RecentSessionEntry[] {
  const name = entry.name.trim() || entry.id;
  const next = [
    { ...entry, name },
    ...readRecentEntries(storageKey).filter((item) => item.id !== entry.id),
  ].slice(0, RECENT_SESSIONS_MAX);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures.
  }
  return next;
}

export function readRecentSessions(): RecentSessionEntry[] {
  return readRecentEntries(RECENT_SESSIONS_KEY);
}

export function rememberRecentSession(
  entry: RecentSessionEntry
): RecentSessionEntry[] {
  return rememberRecentEntry(RECENT_SESSIONS_KEY, entry);
}

export function readRecentPlaylists(): RecentPlaylistEntry[] {
  return readRecentEntries(RECENT_PLAYLISTS_KEY);
}

export function rememberRecentPlaylist(
  entry: RecentPlaylistEntry
): RecentPlaylistEntry[] {
  return rememberRecentEntry(RECENT_PLAYLISTS_KEY, entry);
}
