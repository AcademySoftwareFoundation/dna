import {
  CSV_FIELD_NAMES,
  createCsvExporter,
  parseCsvColumns,
  type CsvColumn,
  type ExportFileType,
  type Exporter,
} from '@dna/core';
import type { ResolvedNomenclature } from '../nomenclature';

export const PDF_FILE_TYPE: ExportFileType = {
  label: 'PDF',
  description: 'PDF document',
  mimeType: 'application/pdf',
  extension: '.pdf',
};

/** PDF with thumbnails; @react-pdf/renderer loads only when this runs. */
export function createPdfExporter({
  accent,
  terms,
}: {
  accent: string;
  terms: ResolvedNomenclature;
}): Exporter {
  return {
    fileType: PDF_FILE_TYPE,
    export: async (data, destination) => {
      const { renderReviewPdf, loadThumbnails } = await import('./reviewPdf');
      const blob = await renderReviewPdf(data, {
        accent,
        terms,
        thumbnails: await loadThumbnails(data.rows),
      });
      await destination(blob);
    },
  };
}

/**
 * CSV columns from VITE_REVIEW_CSV_COLUMNS (see .env.example). Unset (empty):
 * ShotGrid's Note columns.
 */
function csvColumnsFromEnv(): CsvColumn[] {
  const { columns, unknown } = parseCsvColumns(
    import.meta.env.VITE_REVIEW_CSV_COLUMNS
  );
  if (unknown.length) {
    console.warn(
      `[export] VITE_REVIEW_CSV_COLUMNS: ignoring unknown field(s) ${unknown.join(', ')}. ` +
        `Known fields: ${CSV_FIELD_NAMES.join(', ')}.`
    );
  }
  return columns;
}

/** Every export format offered under Publish, in menu order. */
export function createReviewExporters({
  accent,
  terms,
}: {
  accent: string;
  terms: ResolvedNomenclature;
}): Exporter[] {
  return [
    createCsvExporter(csvColumnsFromEnv()),
    createPdfExporter({ accent, terms }),
  ];
}
