import {
  SCRATCH_VERSION_ID,
  type DraftNote,
  type StoredSegment,
  type Version,
} from '../interfaces';

/** One version of the review, shared by every exporter. */
export interface ReviewRow {
  versionId: string;
  version: string;
  shot: string;
  project: string;
  /** Status code the review settled on. */
  status: string;
  /** Whether `status` is a pending change from a draft, not the tracked one. */
  statusChanged: boolean;
  /** Every author's note for the version, joined. */
  note: string;
  transcript: string;
  /** Name of the version's published transcript row; '' when none. */
  linkedTranscript: string;
  thumbnailUrl?: string;
}

/** One draft note, shaped like a note in the tracking system. */
export interface ReviewNote {
  versionId: string;
  /** Tracking-system note id once published; '' before. */
  noteId: string;
  subject: string;
  /** Names of the linked entities: the note's links, shot, version, playlist. */
  links: string[];
  /** Display name, or the email when the name isn't known. */
  author: string;
  to: string;
  cc: string;
  body: string;
  /** ISO timestamp the draft was created. */
  createdAt: string;
}

/** Everything an exporter gets: the rows plus review-wide details. */
export interface ReviewExportData {
  rows: ReviewRow[];
  /** Notes with a subject or body, in version order. */
  notes: ReviewNote[];
  /** Human-readable name of what was reviewed, e.g. the playlist name. */
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

/**
 * @param transcriptNames Version ID → name of its published transcript row
 *  (see `transcriptNamesByVersion`).
 */
export function buildReviewRows(
  versions: Version[],
  draftNotes: DraftNote[],
  segmentsByVersion: Map<string, StoredSegment[]>,
  userEmail: string,
  transcriptNames: Map<string, string> = new Map()
): ReviewRow[] {
  return versions.map((version) => {
    const drafts = draftNotes.filter((d) => d.version_id === version.id);
    const pending = pendingStatus(version, drafts, userEmail);
    return {
      versionId: version.id,
      version: version.name ?? version.id,
      shot: version.entity?.name ?? '',
      project: version.project?.name ?? '',
      status: pending ?? version.status ?? '',
      statusChanged: pending !== undefined,
      note: noteText(drafts, userEmail),
      transcript: transcriptText(segmentsByVersion.get(version.id) ?? []),
      linkedTranscript: transcriptNames.get(version.id) ?? '',
      thumbnailUrl: version.thumbnail,
    };
  });
}

/**
 * Version ID → transcript row name. A version re-recorded in another meeting
 * has several rows; the most recently published one wins.
 */
export function transcriptNamesByVersion(
  transcripts: { version_id: string; name: string; updated_at: string }[]
): Map<string, string> {
  const latest = [...transcripts].sort((a, b) =>
    a.updated_at.localeCompare(b.updated_at)
  );
  return new Map(latest.map((t) => [t.version_id, t.name]));
}

function noteLinks(
  draft: DraftNote,
  version: Version,
  playlistName: string
): string[] {
  const names = draft.links.map((l) => l.entity_name ?? '');
  if (version.id !== SCRATCH_VERSION_ID) {
    names.push(version.entity?.name ?? '', version.name ?? '');
  }
  names.push(playlistName);
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * One entry per draft that has a subject or body (what publishing would send),
 * in version order, the current user's first within a version.
 *
 * @param authorNames Email → display name; unknown authors show their email.
 */
export function buildReviewNotes(
  versions: Version[],
  draftNotes: DraftNote[],
  {
    userEmail,
    playlistName,
    authorNames = new Map(),
  }: {
    userEmail: string;
    playlistName: string;
    authorNames?: Map<string, string>;
  }
): ReviewNote[] {
  return versions.flatMap((version) =>
    orderDrafts(
      draftNotes.filter(
        (d) =>
          d.version_id === version.id &&
          (d.content?.trim() || d.subject?.trim())
      ),
      userEmail
    ).map((draft) => ({
      versionId: version.id,
      noteId: draft.published_note_id ?? '',
      subject: draft.subject?.trim() ?? '',
      links: noteLinks(draft, version, playlistName),
      author: authorNames.get(draft.user_email) ?? draft.user_email,
      to: draft.to ?? '',
      cc: draft.cc ?? '',
      body: draft.content?.trim() ?? '',
      createdAt: draft.created_at,
    }))
  );
}

export function summarizeReview(rows: ReviewRow[]) {
  return {
    versions: rows.length,
    notes: rows.filter((r) => r.note).length,
    statusChanges: rows.filter((r) => r.statusChanged).length,
  };
}
