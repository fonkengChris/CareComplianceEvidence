import { useState } from 'react';
import { fetchWeekPlanReport } from '../lib/reports';

/**
 * "Export PDF" action for a week plan (Phase 8). On click it fetches the backend-assembled
 * report data, then lazily imports the PDF renderer (`@react-pdf/renderer` is heavy, so it is
 * code-split and only loaded when a manager actually exports) and triggers the download. Used on
 * both the planner detail view and each planned row of the manager summary.
 */
export default function ExportReportButton({
  weekPlanId,
  className,
  label = 'Export PDF',
}: {
  weekPlanId: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchWeekPlanReport(weekPlanId);
      const { downloadReportPdf } = await import('./ReportDocument');
      await downloadReportPdf(data);
    } catch (err) {
      setError((err as Error).message);
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
