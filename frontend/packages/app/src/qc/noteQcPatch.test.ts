import { describe, it, expect } from 'vitest';
import type { NoteQCResult } from '@dna/core';
import type { LocalDraftNote } from '../hooks/useDraftNote';
import {
  buildLocalPatch,
  findOverlappingQCFields,
  fixAllDisabledReason,
  getAffectedQCFields,
  mergeQCResultPatches,
  normalizeQCResult,
  getQCPreviewRows,
} from './noteQcPatch';

const baseDraft: LocalDraftNote = {
  content: 'hello',
  subject: 'sub',
  to: [],
  cc: [],
  links: [],
  versionStatus: 'wip',
  published: false,
  edited: false,
  publishedNoteId: null,
  attachmentIds: [],
};

function result(over: Partial<NoteQCResult>): NoteQCResult {
  return {
    check_id: 'c',
    check_name: 'C',
    severity: 'warning',
    passed: false,
    ...over,
  };
}

describe('noteQcPatch', () => {
  it('getAffectedQCFields detects content and attributes', () => {
    const r = result({
      check_id: '1',
      note_suggestion: 'new body',
      attribute_suggestion: { subject: 'x' },
    });
    const f = getAffectedQCFields(baseDraft, r);
    expect([...f].sort()).toEqual(['content', 'subject'].sort());
  });

  it('findOverlappingQCFields returns fields touched by multiple checks', () => {
    const a = result({ check_id: 'a', note_suggestion: 'one' });
    const b = result({ check_id: 'b', note_suggestion: 'two' });
    expect(findOverlappingQCFields(baseDraft, [a, b])).toEqual(['content']);
  });

  it('findOverlappingQCFields empty when disjoint', () => {
    const a = result({ check_id: 'a', note_suggestion: 'one' });
    const b = result({
      check_id: 'b',
      attribute_suggestion: { subject: 's' },
    });
    expect(findOverlappingQCFields(baseDraft, [a, b])).toEqual([]);
  });

  it('fixAllDisabledReason when fewer than two results', () => {
    expect(fixAllDisabledReason(baseDraft, [result({ check_id: 'a', note_suggestion: 'x' })])).toBeNull();
  });

  it('fixAllDisabledReason when a check has no suggestions', () => {
    const a = result({ check_id: 'a', note_suggestion: 'x' });
    const b = result({ check_id: 'b' });
    expect(fixAllDisabledReason(baseDraft, [a, b])).toMatch(/no suggested field changes/i);
  });

  it('fixAllDisabledReason when fields overlap', () => {
    const a = result({ check_id: 'a', note_suggestion: 'x' });
    const b = result({ check_id: 'b', note_suggestion: 'y' });
    expect(fixAllDisabledReason(baseDraft, [a, b])).toMatch(/same field/i);
    expect(fixAllDisabledReason(baseDraft, [a, b])).toMatch(/note body/i);
  });

  it('mergeQCResultPatches merges disjoint patches in check_id order', () => {
    const a = result({ check_id: 'b', note_suggestion: 'body' });
    const c = result({
      check_id: 'c',
      attribute_suggestion: { subject: 'newsub' },
    });
    const merged = mergeQCResultPatches(baseDraft, [c, a]);
    expect(merged.content).toBe('body');
    expect(merged.subject).toBe('newsub');
    expect(merged.edited).toBe(true);
  });

  it('buildLocalPatch leaves subject unset when attribute omits it', () => {
    const r = result({ check_id: 'a', note_suggestion: 'only' });
    const p = buildLocalPatch(baseDraft, r);
    expect(p.content).toBe('only');
    expect(p.subject).toBeUndefined();
  });

  it('getAffectedQCFields tolerates null attribute fields from backend', () => {
    const r = result({
      check_id: 'a',
      note_suggestion: 'body',
      attribute_suggestion: {
        subject: null,
        version_status: null,
        to: null,
        cc: null,
        links: null,
      },
    });
    const f = getAffectedQCFields(baseDraft, r);
    expect([...f]).toEqual(['content']);
  });

  it('buildLocalPatch tolerates null attribute fields from backend', () => {
    const r = result({
      check_id: 'a',
      note_suggestion: 'body',
      attribute_suggestion: {
        subject: null,
        version_status: null,
        to: null,
        cc: null,
        links: null,
      },
    });
    const p = buildLocalPatch(baseDraft, r);
    expect(p.content).toBe('body');
    expect(p.subject).toBeUndefined();
    expect(p.versionStatus).toBeUndefined();
    expect(p.to).toBeUndefined();
    expect(p.cc).toBeUndefined();
    expect(p.links).toBeUndefined();
  });

  it('fixAllDisabledReason flags null-only attribute suggestion as having no changes', () => {
    const a = result({ check_id: 'a', note_suggestion: 'x' });
    const b = result({
      check_id: 'b',
      attribute_suggestion: { subject: null, links: null },
    });
    expect(fixAllDisabledReason(baseDraft, [a, b])).toMatch(/no suggested field changes/i);
  });

  it('normalizeQCResult splits embedded JSON note_suggestion', () => {
    const embedded = JSON.stringify({
      content: '@[briana J](user:484) This is looking great!',
      subject: '',
      to: JSON.stringify([{ type: 'User', id: 17, name: 'Artist 3' }]),
      cc: JSON.stringify([{ type: 'User', id: 484, name: 'briana J' }]),
    });
    const r = result({ check_id: 'q', note_suggestion: embedded });
    const n = normalizeQCResult(r);
    expect(n.note_suggestion).toBe('@[briana J](user:484) This is looking great!');
    expect(n.attribute_suggestion?.to).toBe('[{"type":"User","id":17,"name":"Artist 3"}]');
    expect(n.attribute_suggestion?.cc).toBe('[{"type":"User","id":484,"name":"briana J"}]');
  });

  it('buildLocalPatch omits content when unchanged after embedded split', () => {
    const body = 'same body';
    const draft: LocalDraftNote = { ...baseDraft, content: body, to: [], cc: [] };
    const embedded = JSON.stringify({
      content: body,
      to: JSON.stringify([{ type: 'User', id: 17, name: 'Artist 3' }]),
    });
    const p = buildLocalPatch(draft, result({ note_suggestion: embedded }));
    expect(p.content).toBeUndefined();
    expect(p.to).toEqual([{ type: 'User', id: 17, name: 'Artist 3' }]);
    expect(p.edited).toBe(true);
  });

  it('getQCPreviewRows lists only changed fields', () => {
    const draft: LocalDraftNote = {
      ...baseDraft,
      content: 'keep',
      to: [{ type: 'User', id: 1, name: 'A' }],
    };
    const embedded = JSON.stringify({
      content: 'keep',
      to: JSON.stringify([
        { type: 'User', id: 1, name: 'A' },
        { type: 'User', id: 2, name: 'B' },
      ]),
    });
    const rows = getQCPreviewRows(draft, result({ note_suggestion: embedded }));
    expect(rows.map((x) => x.field)).toEqual(['to']);
  });
});
