import { describe, it, expect } from 'vitest';
import {
  UTF8_BOM,
  createCsvExporter,
  parseCsvColumns,
  toCsv,
} from './csvExporter';
import type { ReviewExportData, ReviewNote, ReviewRow } from './reviewData';

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  versionId: '1',
  version: 'v',
  shot: '',
  project: '',
  status: '',
  statusChanged: false,
  note: '',
  transcript: '',
  linkedTranscript: '',
  ...over,
});

const note = (over: Partial<ReviewNote> = {}): ReviewNote => ({
  versionId: '1',
  noteId: '',
  subject: '',
  links: [],
  author: '',
  to: '',
  cc: '',
  body: '',
  createdAt: '2026-10-08T14:45:00',
  ...over,
});

const data = (
  rows: ReviewRow[],
  over: Partial<ReviewExportData> = {}
): ReviewExportData => ({
  rows,
  notes: [],
  title: 'Playlist 42',
  exportedAt: new Date('2026-10-12T15:00:00Z'),
  statusNames: new Map(),
  ...over,
});

const lines = (csv: string) => csv.slice(UTF8_BOM.length).split('\r\n');

describe('toCsv', () => {
  it("writes ShotGrid's Note columns", () => {
    const csv = toCsv(
      data(
        [
          row({
            versionId: '7056',
            project: 'DEMO_DUNE',
            linkedTranscript: 'transcript-7056-2026-08-12',
          }),
        ],
        {
          notes: [
            note({
              versionId: '7056',
              noteId: '7732',
              subject: 'Testing',
              links: ['TST_010_0040', 'TST_010_0040_comp_v005'],
              author: 'Cameron Target',
              to: 'Cameron Target',
              cc: 'James Spadafora',
              body: 'Testing publish selected.',
            }),
          ],
        }
      )
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines(csv)).toEqual([
      'Id,Subject,Links,Author,To,Cc,Body,Date Created,Linked Transcript,Attachments,Project',
      '7732,Testing,"TST_010_0040, TST_010_0040_comp_v005",Cameron Target,' +
        'Cameron Target,James Spadafora,Testing publish selected.,' +
        '2026-10-08 14:45,transcript-7056-2026-08-12,,DEMO_DUNE',
      '',
    ]);
  });

  it('writes one line per note and skips versions without notes', () => {
    const csv = toCsv(
      data([row({ versionId: '1' }), row({ versionId: '2' })], {
        notes: [
          note({ versionId: '1', body: 'a' }),
          note({ versionId: '1', body: 'b' }),
        ],
      }),
      [{ header: 'Body', field: 'body' }]
    );
    expect(lines(csv)).toEqual(['Body', 'a', 'b', '']);
  });

  it('leaves Id and Linked Transcript blank before publishing', () => {
    const csv = toCsv(data([row()], { notes: [note({ body: 'x' })] }), [
      { header: 'Id', field: 'note_id' },
      { header: 'Linked Transcript', field: 'linked_transcript' },
    ]);
    expect(lines(csv)[1]).toBe(',');
  });

  it('writes the configured columns in order with their headers', () => {
    const csv = toCsv(
      data(
        [row({ version: 'shot010_v1', status: 'apr', statusChanged: true })],
        {
          notes: [note({ body: 'x' })],
          statusNames: new Map([['apr', 'Approved']]),
        }
      ),
      [
        { header: 'Status', field: 'status_name' },
        { header: 'Version Name', field: 'version' },
        { header: 'Changed', field: 'status_changed' },
        { header: 'Playlist', field: 'title' },
        { header: 'Date', field: 'date' },
      ]
    );
    expect(lines(csv).slice(0, 2)).toEqual([
      'Status,Version Name,Changed,Playlist,Date',
      'Approved,shot010_v1,yes,Playlist 42,2026-10-12',
    ]);
  });

  it('falls back to the status code when there is no display name', () => {
    const csv = toCsv(
      data([row({ status: 'rev' })], { notes: [note({ body: 'x' })] }),
      [{ header: 'Status', field: 'status_name' }]
    );
    expect(lines(csv)[1]).toBe('rev');
  });
});

describe('csv cells', () => {
  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv(
      data([row()], { notes: [note({ body: 'He said "more", then\nleft' })] }),
      [{ header: 'Body', field: 'body' }]
    );
    expect(csv).toContain('"He said ""more"", then\nleft"');
  });

  it('neutralises formula-like cells but leaves bullets alone', () => {
    const csv = toCsv(
      data([row({ version: '=HYPERLINK("x")', shot: '-2+3' })], {
        notes: [note({ body: '- fix edge' })],
      }),
      [
        { header: 'Version', field: 'version' },
        { header: 'Shot', field: 'shot' },
        { header: 'Body', field: 'body' },
      ]
    );
    expect(lines(csv)[1]).toBe(`"'=HYPERLINK(""x"")",'-2+3,- fix edge`);
  });
});

describe('parseCsvColumns', () => {
  it('parses Header:field entries in order', () => {
    expect(
      parseCsvColumns('Version Name:version, Status:status_name,Body:body')
    ).toEqual({
      columns: [
        { header: 'Version Name', field: 'version' },
        { header: 'Status', field: 'status_name' },
        { header: 'Body', field: 'body' },
      ],
      unknown: [],
    });
  });

  it('uses the field name as the header when none is given', () => {
    expect(parseCsvColumns('shot,body').columns).toEqual([
      { header: 'shot', field: 'shot' },
      { header: 'body', field: 'body' },
    ]);
  });

  it('skips and reports unknown fields', () => {
    expect(parseCsvColumns('Shot:shot,Owner:owner')).toEqual({
      columns: [{ header: 'Shot', field: 'shot' }],
      unknown: ['owner'],
    });
  });

  it('returns no columns (use the defaults) when nothing valid is set', () => {
    expect(parseCsvColumns(undefined).columns).toEqual([]);
    expect(parseCsvColumns('  ').columns).toEqual([]);
    expect(parseCsvColumns('Owner:owner').columns).toEqual([]);
  });
});

describe('createCsvExporter', () => {
  it('hands a CSV blob to the destination', async () => {
    let written: Blob | undefined;
    await createCsvExporter([{ header: 'Shot', field: 'shot' }]).export(
      data([row({ shot: 'shot010' })], { notes: [note({ body: 'x' })] }),
      async (blob) => {
        written = blob;
      }
    );
    expect(written?.type).toBe('text/csv;charset=utf-8');
    // Compare bytes: Blob.text() drops the BOM when decoding.
    const bytes = new Uint8Array(await written!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('Shot\r\nshot010\r\n');
  });
});
