import { describe, it, expect } from 'vitest';
import { UTF8_BOM, toCsv, type ReviewCsvRow } from './reviewCsv';
import type { ReviewRow } from './reviewExport';

const row = (over: Partial<ReviewCsvRow> = {}): ReviewCsvRow => ({
  version: 'v',
  shot: '',
  status: '',
  note: '',
  transcript: '',
  ...over,
});

describe('toCsv', () => {
  it('writes a BOM, header and CRLF-separated rows', () => {
    const csv = toCsv([row({ version: 'a', shot: 'b' })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      `${UTF8_BOM}version,shot,status,note,transcript\r\na,b,,,\r\n`
    );
  });

  it('ignores the export fields that are not CSV columns', () => {
    const reviewRow: ReviewRow = {
      ...row({ version: 'a' }),
      versionId: '1',
      statusChanged: true,
      thumbnailUrl: 'https://media.test/1.jpg',
    };
    expect(toCsv([reviewRow]).split('\r\n')[1]).toBe('a,,,,');
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
