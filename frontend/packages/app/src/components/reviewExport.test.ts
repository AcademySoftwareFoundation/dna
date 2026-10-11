import { describe, it, expect } from 'vitest';
import type { DraftNote, StoredSegment, Version } from '@dna/core';
import {
  buildReviewRows,
  summarizeReview,
  type ReviewRow,
} from './reviewExport';

const ME = 'me@x.com';

const version = (id: string, over: Partial<Version> = {}): Version =>
  ({
    id,
    type: 'Version',
    name: `shot010_v${id}`,
    status: 'rev',
    entity: { id: `s${id}`, type: 'Shot', name: `shot0${id}0`, tasks: [] },
    thumbnail: `https://media.test/${id}.jpg`,
    notes: [],
    ...over,
  }) as Version;

const draft = (versionId: string, over: Partial<DraftNote> = {}): DraftNote =>
  ({
    _id: `${versionId}-${over.user_email ?? ME}`,
    version_id: versionId,
    user_email: ME,
    content: '',
    version_status: '',
    updated_at: '2026-10-11T10:00:00Z',
    ...over,
  }) as DraftNote;

const segment = (
  versionId: string,
  start: string,
  speaker: string,
  text: string
): StoredSegment =>
  ({
    version_id: versionId,
    absolute_start_time: start,
    speaker,
    text,
  }) as StoredSegment;

describe('buildReviewRows', () => {
  it('builds one row per version with shot, status, note and transcript', () => {
    const rows = buildReviewRows(
      [version('1')],
      [draft('1', { content: '  Push the grade warmer.  ' })],
      new Map([
        [
          '1',
          [
            segment('1', '2026-10-11T10:00:05Z', 'Bo', 'Looks good'),
            segment('1', '2026-10-11T10:00:01Z', 'Ann', 'Next shot'),
          ],
        ],
      ]),
      ME
    );

    expect(rows).toEqual<ReviewRow[]>([
      {
        versionId: '1',
        version: 'shot010_v1',
        shot: 'shot010',
        status: 'rev',
        statusChanged: false,
        note: 'Push the grade warmer.',
        transcript: 'Ann: Next shot\nBo: Looks good',
        thumbnailUrl: 'https://media.test/1.jpg',
      },
    ]);
  });

  it('keeps versions with no notes, transcript or thumbnail', () => {
    const rows = buildReviewRows(
      [version('1', { entity: undefined, thumbnail: undefined })],
      [],
      new Map(),
      ME
    );
    expect(rows).toEqual<ReviewRow[]>([
      {
        versionId: '1',
        version: 'shot010_v1',
        shot: '',
        status: 'rev',
        statusChanged: false,
        note: '',
        transcript: '',
        thumbnailUrl: undefined,
      },
    ]);
  });

  it('uses a pending draft status over the tracked one, preferring mine', () => {
    const rows = buildReviewRows(
      [version('1')],
      [
        draft('1', { user_email: 'other@x.com', version_status: 'hold' }),
        draft('1', {
          version_status: 'apr',
          updated_at: '2026-10-11T09:00:00Z',
        }),
      ],
      new Map(),
      ME
    );
    expect(rows[0].status).toBe('apr');
    expect(rows[0].statusChanged).toBe(true);
  });

  it('does not count a draft status equal to the tracked one as a change', () => {
    const rows = buildReviewRows(
      [version('1')],
      [draft('1', { version_status: 'rev' })],
      new Map(),
      ME
    );
    expect(rows[0].statusChanged).toBe(false);
  });

  it('joins several authors into one note, mine first', () => {
    const rows = buildReviewRows(
      [version('1')],
      [
        draft('1', { user_email: 'zed@x.com', content: 'Too dark' }),
        draft('1', { content: 'Fix the edge' }),
        draft('1', { user_email: 'amy@x.com', content: '   ' }),
      ],
      new Map(),
      ME
    );
    expect(rows[0].note).toBe('me@x.com: Fix the edge\n\nzed@x.com: Too dark');
  });
});

describe('summarizeReview', () => {
  it('counts versions, notes and status changes', () => {
    const rows = buildReviewRows(
      [version('1'), version('2'), version('3')],
      [
        draft('1', { content: 'Note', version_status: 'apr' }),
        draft('2', { content: 'Another' }),
      ],
      new Map(),
      ME
    );
    expect(summarizeReview(rows)).toEqual({
      versions: 3,
      notes: 2,
      statusChanges: 1,
    });
  });
});
