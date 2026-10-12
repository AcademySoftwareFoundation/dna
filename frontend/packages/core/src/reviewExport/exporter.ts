import type { ReviewExportData } from './reviewData';

/** File type an exporter produces, for save dialogs and file names. */
export interface ExportFileType {
  /** Short name for menus and messages, e.g. "CSV". */
  label: string;
  description: string;
  mimeType: string;
  extension: string;
}

/** Where an export's bytes go: a file the user picked, a download, … */
export type ExportDestination = (data: Blob) => Promise<void>;

/**
 * A review export format. Each format turns the shared review data into a
 * file and hands it to the destination; gathering notes, statuses and
 * transcripts is done once for all of them (see `buildReviewRows`).
 */
export interface Exporter {
  fileType: ExportFileType;
  export: (
    data: ReviewExportData,
    destination: ExportDestination
  ) => Promise<void>;
}
