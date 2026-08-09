import type { ReportData } from '@care/shared';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { reportFileName, reportHours, statusLabel } from '../lib/reports';

/**
 * The commissioner report PDF (Phase 8): a purpose-built, print-ready one-pager for a single
 * week plan — NOT a screenshot of the app (CLAUDE.md). It renders the backend-assembled
 * `ReportData` with @react-pdf/renderer; every figure is displayed as received, never recomputed.
 * Kept to built-in fonts (no custom font registration) so it renders reliably anywhere.
 *
 * Do not render this through the DOM test renderer — @react-pdf primitives don't run in happy-dom.
 * It is exercised via the download path only; the pure helpers it uses are tested in reports.test.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: '#111827', fontFamily: 'Helvetica' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#6b7280', marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    borderBottom: '1pt solid #e5e7eb',
    paddingBottom: 3,
  },
  infoRow: { flexDirection: 'row', marginBottom: 3 },
  infoLabel: { width: 110, color: '#6b7280' },
  infoValue: { flex: 1 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '25%', marginBottom: 8 },
  metricLabel: { color: '#6b7280', fontSize: 8, marginBottom: 2 },
  metricValue: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #d1d5db',
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 2 },
  colActivity: { flex: 1 },
  colLines: { width: 60, textAlign: 'right' },
  colDelivered: { width: 80, textAlign: 'right' },
  th: { color: '#6b7280', fontSize: 8, textTransform: 'uppercase' },
  notes: { color: '#374151' },
  muted: { color: '#9ca3af' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTop: '1pt solid #e5e7eb',
    paddingTop: 6,
    fontSize: 8,
    color: '#9ca3af',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const { serviceUser, compliance, settings } = data;
  const remaining =
    compliance.remainingMinutes >= 0
      ? reportHours(compliance.remainingMinutes)
      : `over by ${reportHours(-compliance.remainingMinutes)}`;
  const generated = new Date(data.generatedAt);

  return (
    <Document
      title={`Care 1-to-1 Support Report — ${serviceUser.name}`}
      author="Care 1-to-1 Hours Tracker"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Care 1-to-1 Support Report</Text>
        <Text style={styles.subtitle}>Week commencing {data.weekCommencing}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Service user</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{serviceUser.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue}>{serviceUser.address ?? '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Contracted</Text>
            <Text style={styles.infoValue}>{serviceUser.contractedHours} hours/week</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Hours this week</Text>
          <View style={styles.metrics}>
            <Metric label="Delivered" value={reportHours(compliance.deliveredMinutes)} />
            <Metric label="Contracted" value={reportHours(compliance.contractedMinutes)} />
            <Metric label="Remaining" value={remaining} />
            <Metric label="Delivery" value={`${compliance.deliveryPct}%`} />
            <Metric label="Status" value={statusLabel(compliance.status)} />
            <Metric label="Missed" value={String(data.missedCount)} />
            <Metric label="Refused" value={String(data.refusedCount)} />
            <Metric label="To review" value={String(data.reviewHintCount)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Activity breakdown</Text>
          {data.activityBreakdown.length === 0 ? (
            <Text style={styles.muted}>No activities recorded.</Text>
          ) : (
            <View>
              <View style={styles.tableHeader}>
                <Text style={[styles.colActivity, styles.th]}>Activity</Text>
                <Text style={[styles.colLines, styles.th]}>Lines</Text>
                <Text style={[styles.colDelivered, styles.th]}>Delivered</Text>
              </View>
              {data.activityBreakdown.map((item) => (
                <View style={styles.tableRow} key={item.activityTypeId ?? 'unassigned'}>
                  <Text style={styles.colActivity}>{item.activityName}</Text>
                  <Text style={styles.colLines}>{item.entryCount}</Text>
                  <Text style={styles.colDelivered}>{reportHours(item.deliveredMinutes)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Weekly notes</Text>
          <Text style={data.notes ? styles.notes : styles.muted}>
            {data.notes ?? 'No notes recorded.'}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Bands: On track ≥{settings.greenMin}% · Under target ≥{settings.amberMin}% · Over
            hours &gt;{settings.redOverPct}%
          </Text>
          <Text>Generated {generated.toISOString().slice(0, 16).replace('T', ' ')} UTC</Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Render `data` to a PDF and trigger a browser download. Lives with the document (not in lib) so
 * `@react-pdf/renderer` stays out of the lib module graph — pages import this lazily on click, so
 * the heavy renderer is code-split and never loaded until a manager actually exports.
 */
export async function downloadReportPdf(data: ReportData): Promise<void> {
  const blob = await pdf(<ReportDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(data);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
