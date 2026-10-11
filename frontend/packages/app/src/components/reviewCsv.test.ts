import { describe, it, expect } from 'vitest';
import type { DraftNote, StoredSegment, Version } from '@dna/core';
import {
  UTF8_BOM,
  buildReviewRows,
  toCsv,
  type ReviewCsvRow,
} from './reviewCsv';

const ME = 'me@x.com';

const version = (id: string, over: Partial<Version> = {}): Version =>
  ({
    id,
    type: 'Version',
    name: `shot010_v${id}`,
    status: 'rev',
    entity: { id: `s${id}`, type: 'Shot', name: `shot0${id}0`, tasks: [] },
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

const row = (over: Partial<ReviewCsvRow> = {}): ReviewCsvRow => ({
  version: 'v',
  shot: '',
  status: '',
  note: '',
  transcript: '',
  ...over,
});

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

    expect(rows).toEqual([
      {
        version: 'shot010_v1',
        shot: 'shot010',
        status: 'rev',
        note: 'Push the grade warmer.',
        transcript: 'Ann: Next shot\nBo: Looks good',
      },
    ]);
  });

  it('keeps versions with no notes or transcript', () => {
    const rows = buildReviewRows(
      [version('1', { entity: undefined })],
      [],
      new Map(),
      ME
    );
    expect(rows).toEqual([
      {
        version: 'shot010_v1',
        shot: '',
        status: 'rev',
        note: '',
        transcript: '',
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
  });

  it('joins several authors into one note cell, mine first', () => {
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

describe('toCsv', () => {
  it('writes a BOM, header and CRLF-separated rows', () => {
    const csv = toCsv([row({ version: 'a', shot: 'b' })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      `${UTF8_BOM}version,shot,status,note,transcript\r\na,b,,,\r\n`
    );
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv([row({ note: 'He said "more", then\nleft' })]);
    expect(csv).toContain('"He said ""more"", then\nleft"');
  });

  it('neutralises formula-like cells but leaves bullets alone', () => {
    const csv = toCsv([
      row({ version: '=HYPERLINK("x")', shot: '-2+3', note: '- fix edge' }),
    ]);
    const [, line] = csv.split('\r\n');
    expect(line).toBe(`"'=HYPERLINK(""x"")",'-2+3,,- fix edge,`);
  });
});
