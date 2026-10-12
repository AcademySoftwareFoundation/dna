import type { DraftNote, StoredSegment, Version } from '../interfaces';

/** One version of the review, shared by every exporter. */
export interface ReviewRow {
  versionId: string;
  version: string;
  shot: string;
  /** Status code the review settled on. */
  status: string;
  /** Whether `status` is a pending change from a draft, not the tracked one. */
  statusChanged: boolean;
  note: string;
  transcript: string;
  thumbnailUrl?: string;
}

/** Everything an exporter gets: the rows plus review-wide details. */
export interface ReviewExportData {
  rows: ReviewRow[];
  /** Human-readable name of what was reviewed, e.g. "Playlist 42". */
  title: string;
  exportedAt: Date;
  /** Status code → display name; unknown codes are shown as-is. */
  statusNames: Map<string, string>;
}

/** The current user's drafts first, then the rest by author. */
function orderDrafts(drafts: DraftNote[], userEmail: string): DraftNote[] {
  return [...drafts].sort((a, b) => {
    const aMine = a.user_email === userEmail;
    const bMine = b.user_email === userEmail;
    if (aMine !== bMine) return aMine ? -1 : 1;
    return a.user_email.localeCompare(b.user_email);
  });
}

/**
 * A pending draft status (current user's first, then the most recent) that
 * differs from the tracked one. Mirrors the Publish dialog.
 */
function pendingStatus(
  version: Version,
  drafts: DraftNote[],
  userEmail: string
): string | undefined {
  return [...drafts]
    .sort((a, b) => {
      const aMine = a.user_email === userEmail;
      const bMine = b.user_email === userEmail;
      if (aMine !== bMine) return aMine ? -1 : 1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    })
    .find((d) => d.version_status && d.version_status !== version.status)
    ?.version_status;
}

function noteText(drafts: DraftNote[], userEmail: string): string {
  const withContent = orderDrafts(drafts, userEmail).filter((d) =>
    d.content?.trim()
  );
  if (withContent.length === 1) return withContent[0].content.trim();
  return withContent
    .map((d) => `${d.user_email}: ${d.content.trim()}`)
    .join('\n\n');
}

/** One `Speaker: text` line per segment, as the transcript publisher formats it. */
function transcriptText(segments: StoredSegment[]): string {
  return [...segments]
    .sort((a, b) => a.absolute_start_time.localeCompare(b.absolute_start_time))
    .map((s) => `${s.speaker || 'Unknown'}: ${s.text}`)
    .join('\n');
}

export function buildReviewRows(
  versions: Version[],
  draftNotes: DraftNote[],
  segmentsByVersion: Map<string, StoredSegment[]>,
  userEmail: string
): ReviewRow[] {
  return versions.map((version) => {
    const drafts = draftNotes.filter((d) => d.version_id === version.id);
    const pending = pendingStatus(version, drafts, userEmail);
    return {
      versionId: version.id,
      version: version.name ?? version.id,
      shot: version.entity?.name ?? '',
      status: pending ?? version.status ?? '',
      statusChanged: pending !== undefined,
      note: noteText(drafts, userEmail),
      transcript: transcriptText(segmentsByVersion.get(version.id) ?? []),
      thumbnailUrl: version.thumbnail,
    };
  });
}

export function summarizeReview(rows: ReviewRow[]) {
  return {
    versions: rows.length,
    notes: rows.filter((r) => r.note).length,
    statusChanges: rows.filter((r) => r.statusChanged).length,
  };
}
