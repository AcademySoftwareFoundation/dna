import type { ExportFileType, Exporter } from './exporter';
import type { ReviewExportData, ReviewRow } from './reviewData';

/** Review values a CSV column can hold. */
const CSV_FIELDS = {
  version: (row) => row.version,
  version_id: (row) => row.versionId,
  shot: (row) => row.shot,
  status: (row) => row.status,
  status_name: (row, data) => data.statusNames.get(row.status) ?? row.status,
  status_changed: (row) => (row.statusChanged ? 'yes' : 'no'),
  note: (row) => row.note,
  transcript: (row) => row.transcript,
  title: (_row, data) => data.title,
  date: (_row, data) => data.exportedAt.toISOString().slice(0, 10),
} satisfies Record<string, (row: ReviewRow, data: ReviewExportData) => string>;

export type CsvField = keyof typeof CSV_FIELDS;

export const CSV_FIELD_NAMES = Object.keys(CSV_FIELDS) as CsvField[];

export interface CsvColumn {
  header: string;
  field: CsvField;
}

export const DEFAULT_CSV_COLUMNS: CsvColumn[] = [
  { header: 'version', field: 'version' },
  { header: 'shot', field: 'shot' },
  { header: 'status', field: 'status' },
  { header: 'note', field: 'note' },
  { header: 'transcript', field: 'transcript' },
];

function isCsvField(name: string): name is CsvField {
  return Object.prototype.hasOwnProperty.call(CSV_FIELDS, name);
}

/**
 * Parse a column spec such as `Version Name:version,Status:status_name,Body:note`
 * into columns, in order. Each entry is `Header:field` (or just `field`, which
 * is also used as the header). Unknown fields are skipped and returned so the
 * caller can warn; a spec with no valid columns falls back to the defaults.
 */
export function parseCsvColumns(spec: string | undefined): {
  columns: CsvColumn[];
  unknown: string[];
} {
  const columns: CsvColumn[] = [];
  const unknown: string[] = [];
  for (const entry of (spec ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.lastIndexOf(':');
    const field = (colon === -1 ? trimmed : trimmed.slice(colon + 1)).trim();
    const header = colon === -1 ? field : trimmed.slice(0, colon).trim();
    if (isCsvField(field)) {
      columns.push({ header: header || field, field });
    } else {
      unknown.push(field);
    }
  }
  return {
    columns: columns.length ? columns : DEFAULT_CSV_COLUMNS,
    unknown,
  };
}

function csvCell(value: string): string {
  // Stop spreadsheets running a cell as a formula. A lone "- " is left alone
  // so bulleted notes stay readable.
  const safe = /^([=+@\t\r]|-(?! ))/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Byte order mark so Excel reads the file as UTF-8.
export const UTF8_BOM = String.fromCharCode(0xfeff);

/** RFC 4180 CSV, BOM-prefixed, one row per version. */
export function toCsv(
  data: ReviewExportData,
  columns: CsvColumn[] = DEFAULT_CSV_COLUMNS
): string {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(','),
    ...data.rows.map((row) =>
      columns.map((c) => csvCell(CSV_FIELDS[c.field](row, data))).join(',')
    ),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

export const CSV_FILE_TYPE: ExportFileType = {
  label: 'CSV',
  description: 'CSV file',
  mimeType: 'text/csv',
  extension: '.csv',
};

export function createCsvExporter(
  columns: CsvColumn[] = DEFAULT_CSV_COLUMNS
): Exporter {
  return {
    fileType: CSV_FILE_TYPE,
    export: (data, destination) =>
      destination(
        new Blob([toCsv(data, columns)], { type: 'text/csv;charset=utf-8' })
      ),
  };
}
