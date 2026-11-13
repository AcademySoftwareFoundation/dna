import type { Session } from './interfaces';

/**
 * Return playlist ids with `playlistId` included once.
 * The original list is returned unchanged when the id is already present.
 */
export function addPlaylistId(
  playlistIds: readonly string[] | null | undefined,
  playlistId: string
): string[] {
  const current = playlistIds ?? [];
  if (current.includes(playlistId)) {
    return [...current];
  }
  return [...current, playlistId];
}

/**
 * Return playlist ids with `playlistId` removed.
 */
export function removePlaylistId(
  playlistIds: readonly string[] | null | undefined,
  playlistId: string
): string[] {
  return (playlistIds ?? []).filter((id) => id !== playlistId);
}

/**
 * In-review version id for a playlist given the active DNA session.
 * Null when the session's in-review is on a different playlist.
 */
export function sessionInReviewForPlaylist(
  session: Pick<
    Session,
    'in_review_playlist_id' | 'in_review_version_id' | 'in_review_pinned'
  > | null | undefined,
  playlistId: string | null | undefined
): { versionId: string | null; pinned: boolean } {
  if (!session || !playlistId) {
    return { versionId: null, pinned: false };
  }
  if (session.in_review_playlist_id !== playlistId) {
    return { versionId: null, pinned: false };
  }
  return {
    versionId: session.in_review_version_id ?? null,
    pinned: !!session.in_review_pinned,
  };
}

/**
 * Version to show when a playlist opens.
 * Prefers the in-review version, then the first version in the playlist.
 */
export function preferredPlaylistVersion<T extends { id: string }>(
  versions: readonly T[],
  inReviewVersionId: string | null | undefined
): T | null {
  if (versions.length === 0) return null;
  if (inReviewVersionId) {
    const inReview = versions.find((version) => version.id === inReviewVersionId);
    if (inReview) return inReview;
  }
  return versions[0];
}
