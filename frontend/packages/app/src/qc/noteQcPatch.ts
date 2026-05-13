import type { NoteQCResult } from '@dna/core';
import type { LocalDraftNote } from '../hooks/useDraftNote';

export type QCField = 'content' | 'subject' | 'versionStatus' | 'to' | 'cc' | 'links';

const FIELD_LABELS: Record<QCField, string> = {
  content: 'note body',
  subject: 'subject',
  versionStatus: 'version status',
  to: 'To',
  cc: 'Cc',
  links: 'links',
};

export function qcFieldLabel(f: QCField): string {
  return FIELD_LABELS[f];
}

export function getAffectedQCFields(qc: NoteQCResult): Set<QCField> {
  const s = new Set<QCField>();
  if (qc.note_suggestion !== undefined && qc.note_suggestion !== null) {
    s.add('content');
  }
  const a = qc.attribute_suggestion;
  if (!a) {
    return s;
  }
  if (a.subject !== undefined) s.add('subject');
  if (a.version_status !== undefined) s.add('versionStatus');
  if (a.to !== undefined) s.add('to');
  if (a.cc !== undefined) s.add('cc');
  if (a.links !== undefined && a.links.length > 0) s.add('links');
  return s;
}

export function findOverlappingQCFields(results: NoteQCResult[]): QCField[] {
  const seen = new Map<QCField, string>();
  const conflicts = new Set<QCField>();
  for (const r of results) {
    for (const f of getAffectedQCFields(r)) {
      if (seen.has(f)) {
        conflicts.add(f);
      } else {
        seen.set(f, r.check_id);
      }
    }
  }
  return [...conflicts];
}

export function buildLocalPatch(draft: LocalDraftNote, qc: NoteQCResult): Partial<LocalDraftNote> {
  const patch: Partial<LocalDraftNote> = { edited: true };
  if (qc.note_suggestion !== undefined && qc.note_suggestion !== null) {
    patch.content = qc.note_suggestion;
  }
  const a = qc.attribute_suggestion;
  if (!a) {
    return patch;
  }
  if (a.subject !== undefined) patch.subject = a.subject;
  if (a.version_status !== undefined) patch.versionStatus = a.version_status;
  if (a.to !== undefined) {
    try {
      const parsed = JSON.parse(a.to);
      patch.to = Array.isArray(parsed) ? parsed : draft.to;
    } catch {
      patch.to = draft.to;
    }
  }
  if (a.cc !== undefined) {
    try {
      const parsed = JSON.parse(a.cc);
      patch.cc = Array.isArray(parsed) ? parsed : draft.cc;
    } catch {
      patch.cc = draft.cc;
    }
  }
  if (a.links !== undefined && a.links.length > 0) {
    patch.links = a.links.map((l) => ({
      type: l.entity_type,
      id: l.entity_id,
      name: l.entity_name ?? '',
    }));
  }
  return patch;
}

export function mergeQCResultPatches(draft: LocalDraftNote, results: NoteQCResult[]): Partial<LocalDraftNote> {
  const ordered = [...results].sort((a, b) => a.check_id.localeCompare(b.check_id));
  let virtual: LocalDraftNote = { ...draft };
  let merged: Partial<LocalDraftNote> = { edited: true };
  for (const r of ordered) {
    const p = buildLocalPatch(virtual, r);
    merged = { ...merged, ...p };
    virtual = { ...virtual, ...p };
  }
  return merged;
}

export function fixAllDisabledReason(results: NoteQCResult[]): string | null {
  if (results.length < 2) {
    return null;
  }
  const withoutSuggestions = results.filter((r) => getAffectedQCFields(r).size === 0);
  if (withoutSuggestions.length > 0) {
    return 'One or more checks have no suggested field changes to merge. Use Fix on each check that offers a suggestion.';
  }
  const overlap = findOverlappingQCFields(results);
  if (overlap.length > 0) {
    const parts = overlap.map(qcFieldLabel).join(', ');
    return `Multiple checks suggest changes to the same field (${parts}). Apply fixes one at a time so nothing is overwritten.`;
  }
  return null;
}
