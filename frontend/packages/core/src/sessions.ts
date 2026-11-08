import type { PlaylistMetadata } from './interfaces';

/** A playlist in a session that currently holds the in-review version. */
export interface InReviewHolder {
  playlist_id: string;
  in_review: string;
  in_review_pinned: boolean;
}

/**
 * Return session ids with `sessionId` included once.
 * The original list is returned unchanged when the id is already present.
 */
export function addSessionId(
  sessionIds: readonly string[] | null | undefined,
  sessionId: string
): string[] {
  const current = sessionIds ?? [];
  if (current.includes(sessionId)) {
    return [...current];
  }
  return [...current, sessionId];
}

/**
 * Return session ids with `sessionId` removed.
 * Missing and already-absent ids both yield the remaining list.
 */
export function removeSessionId(
  sessionIds: readonly string[] | null | undefined,
  sessionId: string
): string[] {
  return (sessionIds ?? []).filter((id) => id !== sessionId);
}

/**
 * Every other playlist in a session that holds an in-review version.
 */
export function findInReviewHolders(
  metadataList: readonly Pick<
    PlaylistMetadata,
    'playlist_id' | 'in_review' | 'in_review_pinned'
  >[],
  excludePlaylistId: string
): InReviewHolder[] {
  const holders: InReviewHolder[] = [];
  for (const metadata of metadataList) {
    if (metadata.playlist_id === excludePlaylistId || !metadata.in_review) {
      continue;
    }
    holders.push({
      playlist_id: metadata.playlist_id,
      in_review: metadata.in_review,
      in_review_pinned: metadata.in_review_pinned,
    });
  }
  return holders;
}

/**
 * Find the other playlist in a session that holds an in-review version.
 * Returns null when no other playlist is in review.
 */
export function findInReviewHolder(
  metadataList: readonly Pick<
    PlaylistMetadata,
    'playlist_id' | 'in_review' | 'in_review_pinned'
  >[],
  excludePlaylistId: string
): InReviewHolder | null {
  return findInReviewHolders(metadataList, excludePlaylistId)[0] ?? null;
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
