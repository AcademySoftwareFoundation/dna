import type {
  DraftNoteLink,
  NoteQCAttributeSuggestion,
  NoteQCResult,
  SearchResult,
} from '@dna/core';
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

const EMBEDDED_NOTE_KEYS = new Set([
  'content',
  'subject',
  'to',
  'cc',
  'links',
  'version_status',
]);

export function qcFieldLabel(f: QCField): string {
  return FIELD_LABELS[f];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function looksLikeEmbeddedNotePayload(parsed: unknown): parsed is Record<string, unknown> {
  if (!isPlainObject(parsed)) return false;
  return [...EMBEDDED_NOTE_KEYS].some((k) => k in parsed);
}

function coerceRecipientJsonString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    let s = value.trim();
    if (!s) return '[]';
    try {
      const once = JSON.parse(s);
      if (typeof once === 'string') {
        try {
          const twice = JSON.parse(once.trim());
          if (Array.isArray(twice)) return JSON.stringify(twice);
        } catch {
          return JSON.stringify([once]);
        }
      }
      if (Array.isArray(once)) return JSON.stringify(once);
    } catch {
      return '[]';
    }
  }
  return null;
}

function normalizeLinksFromPayload(raw: unknown): DraftNoteLink[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const links: DraftNoteLink[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    if ('entity_type' in item || 'entity_id' in item) {
      links.push({
        entity_type: String(item.entity_type ?? ''),
        entity_id: Number(item.entity_id),
        entity_name: item.entity_name != null ? String(item.entity_name) : undefined,
      });
      continue;
    }
    if ('type' in item && 'id' in item) {
      links.push({
        entity_type: String(item.type ?? ''),
        entity_id: Number(item.id),
        entity_name: item.name != null ? String(item.name) : undefined,
      });
    }
  }
  return links.length > 0 ? links : null;
}

function attributeSuggestionFromEmbeddedPayload(
  payload: Record<string, unknown>
): NoteQCAttributeSuggestion | null {
  const out: NoteQCAttributeSuggestion = {};
  if ('subject' in payload && payload.subject != null) {
    out.subject = String(payload.subject);
  }
  if ('version_status' in payload && payload.version_status != null) {
    out.version_status = String(payload.version_status);
  }
  const toStr = coerceRecipientJsonString(payload.to);
  if (toStr != null) out.to = toStr;
  const ccStr = coerceRecipientJsonString(payload.cc);
  if (ccStr != null) out.cc = ccStr;
  const links = normalizeLinksFromPayload(payload.links);
  if (links) out.links = links;
  return Object.keys(out).length > 0 ? out : null;
}

function mergeAttributes(
  fromPayload: NoteQCAttributeSuggestion | null,
  explicit: NoteQCAttributeSuggestion | null | undefined
): NoteQCAttributeSuggestion | undefined {
  const out: NoteQCAttributeSuggestion = { ...(fromPayload ?? {}) };
  if (explicit) {
    const keys: (keyof NoteQCAttributeSuggestion)[] = [
      'subject',
      'version_status',
      'to',
      'cc',
      'links',
    ];
    for (const key of keys) {
      const v = explicit[key];
      if (v !== undefined && v !== null) {
        out[key] = v;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeQCResult(qc: NoteQCResult): NoteQCResult {
  const raw = qc.note_suggestion;
  if (raw == null || typeof raw !== 'string') {
    return qc;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    return qc;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return qc;
  }
  if (!looksLikeEmbeddedNotePayload(parsed)) {
    return qc;
  }
  const fromPayload = attributeSuggestionFromEmbeddedPayload(parsed);
  const mergedAttr = mergeAttributes(fromPayload, qc.attribute_suggestion);
  const next: NoteQCResult = {
    ...qc,
    attribute_suggestion: mergedAttr,
  };
  if (typeof parsed.content === 'string') {
    next.note_suggestion = parsed.content;
  } else {
    delete next.note_suggestion;
  }
  return next;
}

function parseRecipients(json: string, fallback: SearchResult[]): SearchResult[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : fallback;
  } catch {
    return fallback;
  }
}

function linksToSearchResults(links: DraftNoteLink[]): SearchResult[] {
  return links.map((l) => ({
    type: l.entity_type,
    id: l.entity_id,
    name: l.entity_name ?? '',
  }));
}

export function applyNormalizedQCToDraft(draft: LocalDraftNote, qc: NoteQCResult): LocalDraftNote {
  const n = normalizeQCResult(qc);
  let next: LocalDraftNote = { ...draft };
  if (n.note_suggestion != null) {
    next = { ...next, content: n.note_suggestion };
  }
  const a = n.attribute_suggestion;
  if (!a) {
    return next;
  }
  if (a.subject != null) next = { ...next, subject: a.subject };
  if (a.version_status != null) next = { ...next, versionStatus: a.version_status };
  if (a.to != null) {
    next = { ...next, to: parseRecipients(a.to, draft.to) };
  }
  if (a.cc != null) {
    next = { ...next, cc: parseRecipients(a.cc, draft.cc) };
  }
  if (a.links != null && a.links.length > 0) {
    next = { ...next, links: linksToSearchResults(a.links) };
  }
  return next;
}

function recipientsEqual(a: SearchResult[], b: SearchResult[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.type === b[i].type && x.id === b[i].id && x.name === b[i].name);
}

function draftEqualsSuggested(draft: LocalDraftNote, suggested: LocalDraftNote): Partial<LocalDraftNote> {
  const patch: Partial<LocalDraftNote> = {};
  if (suggested.content !== draft.content) patch.content = suggested.content;
  if (suggested.subject !== draft.subject) patch.subject = suggested.subject;
  if (suggested.versionStatus !== draft.versionStatus) patch.versionStatus = suggested.versionStatus;
  if (!recipientsEqual(suggested.to, draft.to)) patch.to = suggested.to;
  if (!recipientsEqual(suggested.cc, draft.cc)) patch.cc = suggested.cc;
  if (!recipientsEqual(suggested.links, draft.links)) patch.links = suggested.links;
  return patch;
}

export function getAffectedQCFields(draft: LocalDraftNote, qc: NoteQCResult): Set<QCField> {
  const p = buildLocalPatch(draft, qc);
  const s = new Set<QCField>();
  if (p.content !== undefined) s.add('content');
  if (p.subject !== undefined) s.add('subject');
  if (p.versionStatus !== undefined) s.add('versionStatus');
  if (p.to !== undefined) s.add('to');
  if (p.cc !== undefined) s.add('cc');
  if (p.links !== undefined) s.add('links');
  return s;
}

export function findOverlappingQCFields(draft: LocalDraftNote, results: NoteQCResult[]): QCField[] {
  const seen = new Map<QCField, string>();
  const conflicts = new Set<QCField>();
  for (const r of results) {
    for (const f of getAffectedQCFields(draft, r)) {
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
  const suggested = applyNormalizedQCToDraft(draft, qc);
  const diff = draftEqualsSuggested(draft, suggested);
  if (Object.keys(diff).length === 0) {
    return {};
  }
  return { edited: true, ...diff };
}

export function mergeQCResultPatches(draft: LocalDraftNote, results: NoteQCResult[]): Partial<LocalDraftNote> {
  const ordered = [...results].sort((a, b) => a.check_id.localeCompare(b.check_id));
  let virtual: LocalDraftNote = { ...draft };
  let merged: Partial<LocalDraftNote> = {};
  for (const r of ordered) {
    const p = buildLocalPatch(virtual, r);
    merged = { ...merged, ...p };
    virtual = { ...virtual, ...p };
  }
  if (Object.keys(merged).filter((k) => k !== 'edited').length > 0) {
    return { edited: true, ...merged };
  }
  return merged;
}

export function fixAllDisabledReason(draft: LocalDraftNote, results: NoteQCResult[]): string | null {
  if (results.length < 2) {
    return null;
  }
  const withoutSuggestions = results.filter((r) => getAffectedQCFields(draft, r).size === 0);
  if (withoutSuggestions.length > 0) {
    return 'One or more checks have no suggested field changes to merge. Use Fix on each check that offers a suggestion.';
  }
  const overlap = findOverlappingQCFields(draft, results);
  if (overlap.length > 0) {
    const parts = overlap.map(qcFieldLabel).join(', ');
    return `Multiple checks suggest changes to the same field (${parts}). Apply fixes one at a time so nothing is overwritten.`;
  }
  return null;
}

export interface QCPreviewRow {
  field: QCField;
  label: string;
  current: string;
  suggested: string;
}

function formatRecipientList(list: SearchResult[]): string {
  if (list.length === 0) return '(none)';
  return list.map((x) => x.name || `${x.type} ${x.id}`).join(', ');
}

export function getQCPreviewRows(draft: LocalDraftNote, qc: NoteQCResult): QCPreviewRow[] {
  const suggested = applyNormalizedQCToDraft(draft, qc);
  const rows: QCPreviewRow[] = [];
  if (suggested.content !== draft.content) {
    rows.push({
      field: 'content',
      label: qcFieldLabel('content'),
      current: (draft.content ?? '') || '(empty)',
      suggested: (suggested.content ?? '') || '(empty)',
    });
  }
  if (suggested.subject !== draft.subject) {
    rows.push({
      field: 'subject',
      label: qcFieldLabel('subject'),
      current: (draft.subject ?? '') || '(empty)',
      suggested: (suggested.subject ?? '') || '(empty)',
    });
  }
  if (suggested.versionStatus !== draft.versionStatus) {
    rows.push({
      field: 'versionStatus',
      label: qcFieldLabel('versionStatus'),
      current: (draft.versionStatus ?? '') || '(empty)',
      suggested: (suggested.versionStatus ?? '') || '(empty)',
    });
  }
  if (!recipientsEqual(suggested.to, draft.to)) {
    rows.push({
      field: 'to',
      label: qcFieldLabel('to'),
      current: formatRecipientList(draft.to),
      suggested: formatRecipientList(suggested.to),
    });
  }
  if (!recipientsEqual(suggested.cc, draft.cc)) {
    rows.push({
      field: 'cc',
      label: qcFieldLabel('cc'),
      current: formatRecipientList(draft.cc),
      suggested: formatRecipientList(suggested.cc),
    });
  }
  if (!recipientsEqual(suggested.links, draft.links)) {
    rows.push({
      field: 'links',
      label: qcFieldLabel('links'),
      current: formatRecipientList(draft.links),
      suggested: formatRecipientList(suggested.links),
    });
  }
  return rows;
}
