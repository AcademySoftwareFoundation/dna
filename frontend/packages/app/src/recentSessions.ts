export interface RecentSessionEntry {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
}

export const RECENT_SESSIONS_KEY = 'dna-recent-sessions';
export const RECENT_SESSIONS_MAX = 5;

export function readRecentSessions(): RecentSessionEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_KEY);
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

export function rememberRecentSession(entry: RecentSessionEntry): RecentSessionEntry[] {
  const name = entry.name.trim() || entry.id;
  const next = [
    { ...entry, name },
    ...readRecentSessions().filter((item) => item.id !== entry.id),
  ].slice(0, RECENT_SESSIONS_MAX);
  try {
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures.
  }
  return next;
}
