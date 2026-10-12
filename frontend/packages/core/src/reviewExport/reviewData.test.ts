import { describe, it, expect } from 'vitest';
import type { DraftNote, StoredSegment, Version } from '../interfaces';
import { SCRATCH_VERSION_ID } from '../interfaces';
import {
  buildReviewNotes,
  buildReviewRows,
  summarizeReview,
  transcriptNamesByVersion,
  type ReviewRow,
} from './reviewData';

const ME = 'me@x.com';

const version = (id: string, over: Partial<Version> = {}): Version =>
  ({
    id,
    type: 'Version',
    name: `shot010_v${id}`,
    status: 'rev',
    entity: { id: `s${id}`, type: 'Shot', name: `shot0${id}0`, tasks: [] },
    project: { type: 'Project', id: 'p1', name: 'DEMO_DUNE' },
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
    subject: '',
    to: '',
    cc: '',
    links: [],
    version_status: '',
    created_at: '2026-10-11T09:00:00Z',
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
        project: 'DEMO_DUNE',
        status: 'rev',
        statusChanged: false,
        note: 'Push the grade warmer.',
        transcript: 'Ann: Next shot\nBo: Looks good',
        linkedTranscript: '',
        thumbnailUrl: 'https://media.test/1.jpg',
      },
    ]);
  });

  it('keeps versions with no notes, transcript or thumbnail', () => {
    const rows = buildReviewRows(
      [
        version('1', {
          entity: undefined,
          project: undefined,
          thumbnail: undefined,
        }),
      ],
      [],
      new Map(),
      ME
    );
    expect(rows).toEqual<ReviewRow[]>([
      {
        versionId: '1',
        version: 'shot010_v1',
        shot: '',
        project: '',
        status: 'rev',
        statusChanged: false,
        note: '',
        transcript: '',
        linkedTranscript: '',
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

describe('buildReviewRows transcript names', () => {
  it('links the published transcript, and leaves it blank when none', () => {
    const rows = buildReviewRows(
      [version('1'), version('2')],
      [],
      new Map(),
      ME,
      new Map([['1', 'transcript-1-2026-08-12']])
    );
    expect(rows.map((r) => r.linkedTranscript)).toEqual([
      'transcript-1-2026-08-12',
      '',
    ]);
  });
});

describe('transcriptNamesByVersion', () => {
  it('keeps the most recently published row per version', () => {
    const names = transcriptNamesByVersion([
      { version_id: '1', name: 'new', updated_at: '2026-08-13T10:00:00Z' },
      { version_id: '1', name: 'old', updated_at: '2026-08-12T10:00:00Z' },
      { version_id: '2', name: 'other', updated_at: '2026-08-12T10:00:00Z' },
    ]);
    expect(names).toEqual(
      new Map([
        ['1', 'new'],
        ['2', 'other'],
      ])
    );
  });
});

describe('buildReviewNotes', () => {
  const context = { userEmail: ME, playlistName: 'TST_REVIEW_002' };

  it('shapes each draft like a tracking-system note', () => {
    const [note] = buildReviewNotes(
      [version('1')],
      [
        draft('1', {
          content: '  Testing publish selected.  ',
          subject: 'Testing',
          to: 'Cameron Target',
          cc: 'James Spadafora',
          published_note_id: '7732',
          links: [
            { entity_type: 'Shot', entity_id: 's9', entity_name: 'shot090' },
          ],
        }),
      ],
      { ...context, authorNames: new Map([[ME, 'Cameron Target']]) }
    );
    expect(note).toEqual({
      versionId: '1',
      noteId: '7732',
      subject: 'Testing',
      links: ['shot010', 'shot010_v1', 'shot090', 'TST_REVIEW_002'],
      author: 'Cameron Target',
      to: 'Cameron Target',
      cc: 'James Spadafora',
      body: 'Testing publish selected.',
      createdAt: '2026-10-11T09:00:00Z',
    });
  });

  it('skips drafts with no subject or body and leaves Id blank before publishing', () => {
    const notes = buildReviewNotes(
      [version('1')],
      [
        draft('1', { content: '   ' }),
        draft('1', { user_email: 'zed@x.com', subject: 'Only a subject' }),
      ],
      context
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      noteId: '',
      subject: 'Only a subject',
      author: 'zed@x.com',
    });
  });

  it('orders by version, then mine first, then by author', () => {
    const notes = buildReviewNotes(
      [version('2'), version('1')],
      [
        draft('1', { content: 'v1 mine' }),
        draft('2', { user_email: 'zed@x.com', content: 'v2 zed' }),
        draft('2', { content: 'v2 mine' }),
        draft('2', { user_email: 'amy@x.com', content: 'v2 amy' }),
      ],
      context
    );
    expect(notes.map((n) => n.body)).toEqual([
      'v2 mine',
      'v2 amy',
      'v2 zed',
      'v1 mine',
    ]);
  });

  it('links only the playlist (and note links) for scratch notes', () => {
    const [note] = buildReviewNotes(
      [version(SCRATCH_VERSION_ID, { name: 'Scratch', entity: undefined })],
      [draft(SCRATCH_VERSION_ID, { content: 'General note' })],
      context
    );
    expect(note.links).toEqual(['TST_REVIEW_002']);
  });
});
