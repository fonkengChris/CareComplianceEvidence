import type { PeriodReport } from '@care/shared';
import { useState } from 'react';
import { toErrorMessage } from '../lib/errors';

/**
 * "Export PDF" action for a per-service-user period report. The report DATA is already loaded on
 * the page (the period summary returns each row self-contained), so on click this only lazily
 * imports the heavy PDF renderer (`@react-pdf/renderer`, code-split) and triggers the download —
 * no extra fetch. Used on each row of the reports page.
 */
export default function ExportPeriodReportButton({
  report,
  className,
  label = 'Export PDF',
}: {
  report: PeriodReport;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const { downloadPeriodReportPdf } = await import('./ReportDocument');
      await downloadPeriodReportPdf(report);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={onExport} disabled={busy} className={className}>
        {busy ? 'Exporting…' : label}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-600">
          {error}
        </span>
      )}
    </>
  );
}
