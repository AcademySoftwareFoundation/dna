export const REVIEW_CSV_COLUMNS = [
  'version',
  'shot',
  'status',
  'note',
  'transcript',
] as const;

export type ReviewCsvRow = Record<(typeof REVIEW_CSV_COLUMNS)[number], string>;

function csvCell(value: string): string {
  // Stop spreadsheets running a cell as a formula. A lone "- " is left alone
  // so bulleted notes stay readable.
  const safe = /^([=+@\t\r]|-(?! ))/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Byte order mark so Excel reads the file as UTF-8.
export const UTF8_BOM = String.fromCharCode(0xfeff);

/** RFC 4180 CSV, BOM-prefixed. Extra fields on the rows are ignored. */
export function toCsv(rows: ReviewCsvRow[]): string {
  const lines = [
    REVIEW_CSV_COLUMNS.join(','),
    ...rows.map((row) =>
      REVIEW_CSV_COLUMNS.map((c) => csvCell(row[c])).join(',')
    ),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
