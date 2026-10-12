import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CSV_COLUMNS,
  UTF8_BOM,
  createCsvExporter,
  parseCsvColumns,
  toCsv,
} from './csvExporter';
import type { ReviewExportData, ReviewRow } from './reviewData';

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  versionId: '1',
  version: 'v',
  shot: '',
  status: '',
  statusChanged: false,
  note: '',
  transcript: '',
  ...over,
});

const data = (
  rows: ReviewRow[],
  over: Partial<ReviewExportData> = {}
): ReviewExportData => ({
  rows,
  title: 'Playlist 42',
  exportedAt: new Date('2026-10-12T15:00:00Z'),
  statusNames: new Map(),
  ...over,
});

describe('toCsv', () => {
  it('writes a BOM, header and CRLF-separated rows', () => {
    const csv = toCsv(data([row({ version: 'a', shot: 'b' })]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      `${UTF8_BOM}version,shot,status,note,transcript\r\na,b,,,\r\n`
    );
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv(data([row({ note: 'He said "more", then\nleft' })]));
    expect(csv).toContain('"He said ""more"", then\nleft"');
  });

  it('neutralises formula-like cells but leaves bullets alone', () => {
    const csv = toCsv(
      data([
        row({ version: '=HYPERLINK("x")', shot: '-2+3', note: '- fix edge' }),
      ])
    );
    const [, line] = csv.split('\r\n');
    expect(line).toBe(`"'=HYPERLINK(""x"")",'-2+3,,- fix edge,`);
  });

  it('writes the configured columns in order with their headers', () => {
    const csv = toCsv(
      data(
        [row({ version: 'shot010_v1', status: 'apr', statusChanged: true })],
        { statusNames: new Map([['apr', 'Approved']]) }
      ),
      [
        { header: 'Status', field: 'status_name' },
        { header: 'Version Name', field: 'version' },
        { header: 'Changed', field: 'status_changed' },
        { header: 'Playlist', field: 'title' },
        { header: 'Date', field: 'date' },
      ]
    );
    expect(csv.split('\r\n').slice(0, 2)).toEqual([
      `${UTF8_BOM}Status,Version Name,Changed,Playlist,Date`,
      'Approved,shot010_v1,yes,Playlist 42,2026-10-12',
    ]);
  });

  it('falls back to the status code when there is no display name', () => {
    const csv = toCsv(data([row({ status: 'rev' })]), [
      { header: 'Status', field: 'status_name' },
    ]);
    expect(csv.split('\r\n')[1]).toBe('rev');
  });
});

describe('parseCsvColumns', () => {
  it('parses Header:field entries in order', () => {
    expect(
      parseCsvColumns('Version Name:version, Status:status_name,Body:note')
    ).toEqual({
      columns: [
        { header: 'Version Name', field: 'version' },
        { header: 'Status', field: 'status_name' },
        { header: 'Body', field: 'note' },
      ],
      unknown: [],
    });
  });

  it('uses the field name as the header when none is given', () => {
    expect(parseCsvColumns('shot,note').columns).toEqual([
      { header: 'shot', field: 'shot' },
      { header: 'note', field: 'note' },
    ]);
  });

  it('skips and reports unknown fields', () => {
    expect(parseCsvColumns('Shot:shot,Owner:owner')).toEqual({
      columns: [{ header: 'Shot', field: 'shot' }],
      unknown: ['owner'],
    });
  });

  it('falls back to the defaults when nothing valid is configured', () => {
    expect(parseCsvColumns(undefined).columns).toBe(DEFAULT_CSV_COLUMNS);
    expect(parseCsvColumns('  ').columns).toBe(DEFAULT_CSV_COLUMNS);
    expect(parseCsvColumns('Owner:owner').columns).toBe(DEFAULT_CSV_COLUMNS);
  });
});

describe('createCsvExporter', () => {
  it('hands a CSV blob to the destination', async () => {
    let written: Blob | undefined;
    await createCsvExporter([{ header: 'Shot', field: 'shot' }]).export(
      data([row({ shot: 'shot010' })]),
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
