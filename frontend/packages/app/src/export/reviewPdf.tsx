/**
 * Review PDF rendering. Imported lazily by the PDF exporter so
 * @react-pdf/renderer only loads when someone exports.
 */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import {
  summarizeReview,
  type ReviewExportData,
  type ReviewRow,
} from '@dna/core';

export interface ReviewPdfOptions {
  /** Hex accent color from the user's theme. */
  accent: string;
  /** Version ID → JPEG data URL, from `loadThumbnails`. */
  thumbnails: Map<string, string>;
}

/** Notes longer than this may split across pages instead of moving whole. */
const LONG_NOTE_CHARS = 1500;

const INK = '#1f2328';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';
const PANEL = '#f6f7f9';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: INK,
  },
  accentBar: { height: 4, borderRadius: 2, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 11, color: MUTED, marginTop: 4 },
  summary: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  summaryValue: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  summaryLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase' },
  card: {
    borderWidth: 1,
    borderColor: RULE,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', gap: 12 },
  thumb: { width: 160, height: 90, borderRadius: 4, objectFit: 'cover' },
  thumbPlaceholder: {
    width: 160,
    height: 90,
    borderRadius: 4,
    backgroundColor: PANEL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontSize: 8, color: MUTED },
  meta: { flex: 1, gap: 4 },
  versionName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  shot: { fontSize: 10, color: MUTED },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: { fontSize: 8, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  changed: { fontSize: 8, color: MUTED },
  sectionLabel: {
    fontSize: 7,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 3,
  },
  note: { lineHeight: 1.4 },
  empty: { color: MUTED, fontFamily: 'Helvetica-Oblique' },
  transcript: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.4,
    backgroundColor: PANEL,
    borderRadius: 4,
    padding: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
  },
});

function Summary({ rows, accent }: { rows: ReviewRow[]; accent: string }) {
  const { versions, notes, statusChanges } = summarizeReview(rows);
  const items = [
    [versions, versions === 1 ? 'Version' : 'Versions'],
    [notes, notes === 1 ? 'Note' : 'Notes'],
    [statusChanges, statusChanges === 1 ? 'Status change' : 'Status changes'],
  ] as const;
  return (
    <View style={styles.summary}>
      {items.map(([value, label]) => (
        <View key={label}>
          <Text style={[styles.summaryValue, { color: accent }]}>{value}</Text>
          <Text style={styles.summaryLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function VersionCard({
  row,
  statusNames,
  options,
}: {
  row: ReviewRow;
  statusNames: Map<string, string>;
  options: ReviewPdfOptions;
}) {
  const thumbnail = options.thumbnails.get(row.versionId);
  const statusLabel = statusNames.get(row.status) ?? row.status;
  return (
    <View style={styles.card}>
      {/*
        Keep the header and note on one page so a card never strands its
        label or leaves a near-empty page. Only a very long note may split;
        the transcript below always flows.
      */}
      <View wrap={row.note.length > LONG_NOTE_CHARS}>
        <View style={styles.cardHeader} wrap={false}>
          {thumbnail ? (
            <Image src={thumbnail} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.placeholderText}>No thumbnail</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.versionName}>{row.version}</Text>
            {row.shot ? <Text style={styles.shot}>{row.shot}</Text> : null}
            {statusLabel ? (
              <View style={styles.statusRow}>
                <View
                  style={[styles.pill, { backgroundColor: options.accent }]}
                >
                  <Text style={styles.pillText}>{statusLabel}</Text>
                </View>
                {row.statusChanged ? (
                  <Text style={styles.changed}>Changed in review</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionLabel} minPresenceAhead={24}>
          Note
        </Text>
        {row.note ? (
          // One paragraph per author, rather than a tall blank line.
          row.note.split(/\n{2,}/).map((paragraph, i) => (
            <Text key={i} style={[styles.note, i > 0 ? { marginTop: 6 } : {}]}>
              {paragraph}
            </Text>
          ))
        ) : (
          <Text style={styles.empty}>No note</Text>
        )}
      </View>

      {row.transcript ? (
        <>
          <Text style={styles.sectionLabel} minPresenceAhead={24}>
            Transcript
          </Text>
          <Text style={styles.transcript}>{row.transcript}</Text>
        </>
      ) : null}
    </View>
  );
}

export function ReviewPdfDocument({
  data,
  options,
}: {
  data: ReviewExportData;
  options: ReviewPdfOptions;
}) {
  const date = data.exportedAt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <Document title={`Review: ${data.title}`} creator="DNA">
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.accentBar, { backgroundColor: options.accent }]} />
        <Text style={styles.title}>Review</Text>
        <Text style={styles.subtitle}>
          {data.title} · Exported {date}
        </Text>
        <Summary rows={data.rows} accent={options.accent} />

        {data.rows.map((row) => (
          <VersionCard
            key={row.versionId}
            row={row}
            statusNames={data.statusNames}
            options={options}
          />
        ))}

        <View style={styles.footer} fixed>
          <Text>DNA review · {data.title}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReviewPdf(
  data: ReviewExportData,
  options: ReviewPdfOptions
): Promise<Blob> {
  return pdf(<ReviewPdfDocument data={data} options={options} />).toBlob();
}

/**
 * Fetch each thumbnail and re-encode it as a small JPEG. react-pdf only reads
 * JPEG and PNG, and shrinking keeps the PDF light. Failures leave the version
 * on its placeholder rather than failing the export.
 */
export async function loadThumbnails(
  rows: ReviewRow[],
  maxWidth = 480
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    rows.map(async (row) => {
      if (!row.thumbnailUrl) return null;
      try {
        // Bypass the HTTP cache: the sidebar's <img> already cached these
        // without CORS headers (S3 only sends them when asked), and reusing
        // that copy makes the browser block the read.
        const response = await fetch(row.thumbnailUrl, {
          mode: 'cors',
          cache: 'no-store',
        });
        if (!response.ok) {
          console.warn(
            `[reviewPdf] thumbnail for ${row.version} returned ${response.status}`
          );
          return null;
        }
        const bitmap = await createImageBitmap(await response.blob());
        const scale = Math.min(1, maxWidth / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return [row.versionId, canvas.toDataURL('image/jpeg', 0.85)] as const;
      } catch (err) {
        console.warn(`[reviewPdf] thumbnail for ${row.version} failed`, err);
        return null;
      }
    })
  );
  return new Map(entries.filter((e) => e !== null));
}
