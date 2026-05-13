import { describe, it, expect } from 'vitest';
import type { NoteQCResult } from '@dna/core';
import type { LocalDraftNote } from '../hooks/useDraftNote';
import {
  buildLocalPatch,
  findOverlappingQCFields,
  fixAllDisabledReason,
  getAffectedQCFields,
  mergeQCResultPatches,
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
    const f = getAffectedQCFields(r);
    expect([...f].sort()).toEqual(['content', 'subject'].sort());
  });

  it('findOverlappingQCFields returns fields touched by multiple checks', () => {
    const a = result({ check_id: 'a', note_suggestion: 'one' });
    const b = result({ check_id: 'b', note_suggestion: 'two' });
    expect(findOverlappingQCFields([a, b])).toEqual(['content']);
  });

  it('findOverlappingQCFields empty when disjoint', () => {
    const a = result({ check_id: 'a', note_suggestion: 'one' });
    const b = result({
      check_id: 'b',
      attribute_suggestion: { subject: 's' },
    });
    expect(findOverlappingQCFields([a, b])).toEqual([]);
  });

  it('fixAllDisabledReason when fewer than two results', () => {
    expect(fixAllDisabledReason([result({ check_id: 'a', note_suggestion: 'x' })])).toBeNull();
  });

  it('fixAllDisabledReason when a check has no suggestions', () => {
    const a = result({ check_id: 'a', note_suggestion: 'x' });
    const b = result({ check_id: 'b' });
    expect(fixAllDisabledReason([a, b])).toMatch(/no suggested field changes/i);
  });

  it('fixAllDisabledReason when fields overlap', () => {
    const a = result({ check_id: 'a', note_suggestion: 'x' });
    const b = result({ check_id: 'b', note_suggestion: 'y' });
    expect(fixAllDisabledReason([a, b])).toMatch(/same field/i);
    expect(fixAllDisabledReason([a, b])).toMatch(/note body/i);
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
});
