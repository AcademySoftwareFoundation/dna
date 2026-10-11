import type { DraftNote, StoredSegment, Version } from '@dna/core';

export const REVIEW_CSV_COLUMNS = [
  'version',
  'shot',
  'status',
  'note',
  'transcript',
] as const;

export type ReviewCsvRow = Record<(typeof REVIEW_CSV_COLUMNS)[number], string>;

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
 * Status the review settled on: a pending draft status (current user's first,
 * then the most recent) when it differs from the tracked one, else the
 * tracked status. Mirrors the Publish dialog.
 */
function reviewStatus(
  version: Version,
  drafts: DraftNote[],
  userEmail: string
) {
  const pending = [...drafts]
    .sort((a, b) => {
      const aMine = a.user_email === userEmail;
      const bMine = b.user_email === userEmail;
      if (aMine !== bMine) return aMine ? -1 : 1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    })
    .find((d) => d.version_status && d.version_status !== version.status);
  return pending?.version_status ?? version.status ?? '';
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
): ReviewCsvRow[] {
  return versions.map((version) => {
    const drafts = draftNotes.filter((d) => d.version_id === version.id);
    return {
      version: version.name ?? version.id,
      shot: version.entity?.name ?? '',
      status: reviewStatus(version, drafts, userEmail),
      note: noteText(drafts, userEmail),
      transcript: transcriptText(segmentsByVersion.get(version.id) ?? []),
    };
  });
}

function csvCell(value: string): string {
  // Stop spreadsheets running a cell as a formula. A lone "- " is left alone
  // so bulleted notes stay readable.
  const safe = /^([=+@\t\r]|-(?! ))/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Byte order mark so Excel reads the file as UTF-8.
export const UTF8_BOM = String.fromCharCode(0xfeff);

/** RFC 4180 CSV, BOM-prefixed. */
export function toCsv(rows: ReviewCsvRow[]): string {
  const lines = [
    REVIEW_CSV_COLUMNS.join(','),
    ...rows.map((row) =>
      REVIEW_CSV_COLUMNS.map((c) => csvCell(row[c])).join(',')
    ),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

/**
 * Ask where to save, returning a writer, or null if the user cancelled.
 * Must run straight from the click: browsers only show the save dialog with a
 * fresh user gesture, so call this before any slow work. Browsers without the
 * File System Access API (Firefox, Safari) fall back to a normal download.
 */
export async function chooseCsvDestination(
  suggestedName: string
): Promise<((csv: string) => Promise<void>) | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  const toBlob = (csv: string) =>
    new Blob([csv], { type: 'text/csv;charset=utf-8' });

  if (!picker) {
    return async (csv) => {
      const url = URL.createObjectURL(toBlob(csv));
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedName;
      link.click();
      URL.revokeObjectURL(url);
    };
  }

  try {
    const handle = await picker({
      suggestedName,
      types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
    });
    return async (csv) => {
      const writable = await handle.createWritable();
      await writable.write(toBlob(csv));
      await writable.close();
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}
