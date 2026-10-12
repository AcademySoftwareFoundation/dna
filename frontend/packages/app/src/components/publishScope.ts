import type { DraftNote, Version } from '@dna/core';

/**
 * Narrow the Publish dialog's input to a single version. The dialog builds its
 * cards (notes, status-only changes, transcript rows) from the notes and
 * versions it is given, so filtering both limits everything to that version.
 */
export function scopePublishToVersion(
  notes: DraftNote[],
  versions: Version[],
  versionId: string | null | undefined
): { notes: DraftNote[]; versions: Version[] } {
  if (!versionId) return { notes: [], versions: [] };
  return {
    notes: notes.filter((n) => n.version_id === versionId),
    versions: versions.filter((v) => v.id === versionId),
  };
}
