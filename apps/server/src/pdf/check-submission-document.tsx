import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type CheckAnswers,
  type CheckDefinition,
  blockLabel,
  formatCheckAnswer,
  isFlagged,
} from '@care/shared';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

/**
 * The signed house-check PDF: a print-ready copy of one completed check, laid out like the
 * paper form it replaces (title, date, then Task / Answer / Signature rows). Rendered once at
 * submission time and stored as the evidence copy — never re-rendered, so it always shows
 * exactly what was signed. Built-in fonts only, so it renders anywhere without registration.
 */

export type CheckPdfData = {
  templateName: string;
  templateVersion: number;
  homeName: string;
  dueDate: string;
  dueByTime: string | null;
  definition: CheckDefinition;
  answers: CheckAnswers;
  issueCount: number;
  late: boolean;
  submittedByName: string;
  submittedAt: Date;
};

// The organisation logo shipped with the server (a copy of the client's public/logo.png).
const LOGO_PATH = path.resolve(import.meta.dir, '../../assets/logo.png');
let logo: Buffer | null | undefined;
function logoBytes(): Buffer | null {
  if (logo === undefined) {
    try {
      logo = readFileSync(LOGO_PATH);
    } catch {
      logo = null;
    }
  }
  return logo;
}

const londonDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** "Tue 24 Nov 2026" from a YYYY-MM-DD date. */
function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: '#111827', fontFamily: 'Helvetica' },
  masthead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  // Source artwork is 357×240; keep that ratio.
  logo: { height: 40, width: 59 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 12 },
  metaItem: { width: '50%', flexDirection: 'row', marginBottom: 3 },
  metaLabel: { width: 70, color: '#6b7280' },
  metaValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  late: { color: '#b45309' },
  issues: { color: '#b91c1c' },
  sectionHeading: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#eef2ee',
    padding: 4,
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #9ca3af',
    paddingVertical: 3,
  },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #e5e7eb', paddingVertical: 3 },
  flaggedRow: { backgroundColor: '#fef2f2' },
  colTask: { flex: 1, paddingRight: 6 },
  colAnswer: { width: 110, paddingRight: 6 },
  colSigned: { width: 110 },
  th: { color: '#6b7280', fontSize: 7.5, textTransform: 'uppercase' },
  guidance: { color: '#6b7280', fontSize: 8, marginTop: 1 },
  note: { color: '#374151', fontSize: 8.5, marginTop: 2 },
  flag: { color: '#b91c1c', fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: '#6b7280',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function CheckSubmissionDocument({ data }: { data: CheckPdfData }) {
  const signedAt = londonDateTime.format(data.submittedAt);
  const image = logoBytes();
  return (
    <Document title={`${data.templateName} — ${data.homeName} — ${data.dueDate}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead}>
          <Text style={styles.title}>{data.templateName}</Text>
          {image ? <Image src={{ data: image, format: 'png' }} style={styles.logo} /> : null}
        </View>
        <View style={styles.meta}>
          <MetaItem label="Home" value={data.homeName} />
          <MetaItem
            label="Date"
            value={`${longDate(data.dueDate)}${data.dueByTime ? ` (due by ${data.dueByTime})` : ''}`}
          />
          <MetaItem label="Signed by" value={data.submittedByName} />
          <MetaItem
            label="Completed"
            value={`${signedAt}${data.late ? ' — late' : ''}`}
            valueStyle={data.late ? styles.late : undefined}
          />
          <MetaItem
            label="Issues"
            value={data.issueCount === 0 ? 'None' : `${data.issueCount} to report to management`}
            valueStyle={data.issueCount > 0 ? styles.issues : undefined}
          />
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.colTask, styles.th]}>Task</Text>
          <Text style={[styles.colAnswer, styles.th]}>Answer</Text>
          <Text style={[styles.colSigned, styles.th]}>Signature</Text>
        </View>

        {data.definition.sections.map((section) =>
          (data.answers[section.id] ?? []).map((block, i) => {
            const heading = blockLabel(section, block, i);
            return (
              <View key={`${section.id}-${i}`}>
                {heading ? (
                  <Text style={styles.sectionHeading} minPresenceAhead={30}>
                    {heading}
                  </Text>
                ) : null}
                {section.questions.map((question) => {
                  const answer = block[question.id];
                  const flagged = isFlagged(question, answer);
                  return (
                    <View
                      key={question.id}
                      style={flagged ? [styles.row, styles.flaggedRow] : styles.row}
                      wrap={false}
                    >
                      <View style={styles.colTask}>
                        <Text>{question.text}</Text>
                        {question.guidance ? (
                          <Text style={styles.guidance}>{question.guidance}</Text>
                        ) : null}
                      </View>
                      <View style={styles.colAnswer}>
                        <Text>{formatCheckAnswer(question, answer)}</Text>
                        {answer?.note ? <Text style={styles.note}>{answer.note}</Text> : null}
                        {flagged ? <Text style={styles.flag}>REPORT TO MANAGEMENT</Text> : null}
                      </View>
                      <Text style={styles.colSigned}>{answer ? data.submittedByName : ''}</Text>
                    </View>
                  );
                })}
              </View>
            );
          }),
        )}

        <View style={styles.footer} fixed>
          <Text>
            Signed electronically by {data.submittedByName} on {signedAt} · form v
            {data.templateVersion}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function MetaItem({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: (typeof styles)[keyof typeof styles];
}) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={valueStyle ? [styles.metaValue, valueStyle] : styles.metaValue}>{value}</Text>
    </View>
  );
}

/** Render a submission to PDF bytes. */
export async function renderCheckPdf(data: CheckPdfData): Promise<Buffer> {
  return renderToBuffer(<CheckSubmissionDocument data={data} />);
}
