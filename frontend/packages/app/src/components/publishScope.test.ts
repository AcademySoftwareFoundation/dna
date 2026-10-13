import { describe, it, expect } from 'vitest';
import type { DraftNote, Version } from '@dna/core';
import { scopePublishToVersion } from './publishScope';

const version = (id: string): Version =>
  ({ id, type: 'Version', name: `v${id}`, notes: [] }) as unknown as Version;

const note = (versionId: string, user = 'a@x.com'): DraftNote =>
  ({
    _id: `${versionId}-${user}`,
    version_id: versionId,
    user_email: user,
  }) as DraftNote;

describe('scopePublishToVersion', () => {
  const notes = [note('1'), note('1', 'b@x.com'), note('2')];
  const versions = [version('1'), version('2'), version('3')];

  it('keeps only the selected version and its notes from every author', () => {
    const scoped = scopePublishToVersion(notes, versions, '1');
    expect(scoped.versions.map((v) => v.id)).toEqual(['1']);
    expect(scoped.notes.map((n) => n._id)).toEqual(['1-a@x.com', '1-b@x.com']);
  });

  it('keeps a selected version with no notes, so status-only changes still show', () => {
    const scoped = scopePublishToVersion(notes, versions, '3');
    expect(scoped.versions.map((v) => v.id)).toEqual(['3']);
    expect(scoped.notes).toEqual([]);
  });

  it('returns nothing when no version is selected', () => {
    expect(scopePublishToVersion(notes, versions, null)).toEqual({
      notes: [],
      versions: [],
    });
  });
});
