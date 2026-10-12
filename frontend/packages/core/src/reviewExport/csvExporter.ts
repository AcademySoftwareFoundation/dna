import type { ExportFileType, Exporter } from './exporter';
import type { ReviewExportData, ReviewNote, ReviewRow } from './reviewData';

/** What one CSV line describes: a note, with the version it's on. */
interface CsvRecord {
  row: ReviewRow;
  note: ReviewNote;
}

/** Local `YYYY-MM-DD HH:MM`, which spreadsheet and tracker imports parse. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Review values a CSV column can hold. */
const CSV_FIELDS = {
  // Note
  note_id: ({ note }) => note.noteId,
  subject: ({ note }) => note.subject,
  links: ({ note }) => note.links.join(', '),
  author: ({ note }) => note.author,
  to: ({ note }) => note.to,
  cc: ({ note }) => note.cc,
  body: ({ note }) => note.body,
  date_created: ({ note }) => formatDateTime(note.createdAt),
  // Version
  version: ({ row }) => row.version,
  version_id: ({ row }) => row.versionId,
  shot: ({ row }) => row.shot,
  project: ({ row }) => row.project,
  status: ({ row }) => row.status,
  status_name: ({ row }, data) =>
    data.statusNames.get(row.status) ?? row.status,
  status_changed: ({ row }) => (row.statusChanged ? 'yes' : 'no'),
  transcript: ({ row }) => row.transcript,
  linked_transcript: ({ row }) => row.linkedTranscript,
  // Review
  title: (_record, data) => data.title,
  date: (_record, data) => data.exportedAt.toISOString().slice(0, 10),
  // An empty column, for matching an import layout.
  blank: () => '',
} satisfies Record<
  string,
  (record: CsvRecord, data: ReviewExportData) => string
>;

export type CsvField = keyof typeof CSV_FIELDS;

export const CSV_FIELD_NAMES = Object.keys(CSV_FIELDS) as CsvField[];

export interface CsvColumn {
  header: string;
  field: CsvField;
}

/**
 * ShotGrid's Note export layout, so the file imports without remapping.
 * Attachments stay empty: a CSV can't carry files.
 */
export const DEFAULT_CSV_COLUMNS: CsvColumn[] = [
  { header: 'Id', field: 'note_id' },
  { header: 'Subject', field: 'subject' },
  { header: 'Links', field: 'links' },
  { header: 'Author', field: 'author' },
  { header: 'To', field: 'to' },
  { header: 'Cc', field: 'cc' },
  { header: 'Body', field: 'body' },
  { header: 'Date Created', field: 'date_created' },
  { header: 'Linked Transcript', field: 'linked_transcript' },
  { header: 'Attachments', field: 'blank' },
  { header: 'Project', field: 'project' },
];

function isCsvField(name: string): name is CsvField {
  return Object.prototype.hasOwnProperty.call(CSV_FIELDS, name);
}

/**
 * Parse a column spec such as `Version Name:version,Status:status_name,Body:body`
 * into columns, in order. Each entry is `Header:field` (or just `field`, which
 * is also used as the header). Unknown fields are skipped and returned so the
 * caller can warn. Empty `columns` means "use the defaults".
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
  return { columns, unknown };
}

function csvCell(value: string): string {
  // Stop spreadsheets running a cell as a formula. A lone "- " is left alone
  // so bulleted notes stay readable.
  const safe = /^([=+@\t\r]|-(?! ))/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Byte order mark so Excel reads the file as UTF-8.
export const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * RFC 4180 CSV, BOM-prefixed, one row per note. Empty `columns` uses
 * `DEFAULT_CSV_COLUMNS`.
 */
export function toCsv(
  data: ReviewExportData,
  columns: CsvColumn[] = []
): string {
  const cols = columns.length ? columns : DEFAULT_CSV_COLUMNS;
  const rowsById = new Map(data.rows.map((row) => [row.versionId, row]));
  const records = data.notes.flatMap((note) => {
    const row = rowsById.get(note.versionId);
    return row ? [{ row, note }] : [];
  });
  const lines = [
    cols.map((c) => csvCell(c.header)).join(','),
    ...records.map((record) =>
      cols.map((c) => csvCell(CSV_FIELDS[c.field](record, data))).join(',')
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

export function createCsvExporter(columns: CsvColumn[] = []): Exporter {
  return {
    fileType: CSV_FILE_TYPE,
    export: (data, destination) =>
      destination(
        new Blob([toCsv(data, columns)], { type: 'text/csv;charset=utf-8' })
      ),
  };
}
