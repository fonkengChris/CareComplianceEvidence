import type { PeriodReport } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import ComplianceBadge from '../components/ComplianceBadge';
import ComplianceThresholdsCard from '../components/ComplianceThresholdsCard';
import ExportPeriodReportButton from '../components/ExportPeriodReportButton';
import RecordingGuidanceCard from '../components/RecordingGuidanceCard';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '@/lib/utils';
import {
  fetchPeriodSummary,
  outcomeLabel,
  rangeLabel,
  reportHours,
  weekdayLabel,
} from '../lib/reports';
import { PERIOD_PRESETS, type PeriodPreset, presetLabel, presetRange } from '../lib/week';

/**
 * Reports & compliance page (Phases 6 + 8). Generates per-service-user reports over any period —
 * a week, a month, up to a year — chosen with quick presets or a custom date range. Each service
 * user is shown as a card with the period's delivered/contracted/remaining hours, a per-week
 * breakdown, and the full staff-recorded notes for the period, from which a manager downloads a
 * one-file commissioner PDF. Every figure is backend-owned (CLAUDE.md); the page only displays
 * what /api/summary/period returns. Managers additionally tune the 🟢/🟡/🔴 thresholds below.
 */

/** Remaining hours as text, flagging an overspend the way the PDF does. */
function remainingLabel(remainingMinutes: number): string {
  return remainingMinutes >= 0
    ? reportHours(remainingMinutes)
    : `-${reportHours(-remainingMinutes)}`;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';

  // Default to the current week; presets and the custom inputs move the range from there.
  const [preset, setPreset] = useState<PeriodPreset | null>('week');
  const [range, setRange] = useState(() => presetRange('week'));

  function applyPreset(next: PeriodPreset) {
    setPreset(next);
    setRange(presetRange(next));
  }
  function setCustom(part: Partial<{ from: string; to: string }>) {
    setPreset(null);
    setRange((r) => ({ ...r, ...part }));
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['period-summary', range.from, range.to],
    queryFn: () => fetchPeriodSummary(range.from, range.to),
  });

  const rows = data?.rows ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports &amp; compliance</h1>
        <p className="text-sm text-muted-foreground">
          Generate a report for any service user over a week, a month, or up to a year — with the
          staff notes recorded against each activity.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Quick periods"
          >
            {PERIOD_PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={preset === p ? 'default' : 'outline'}
                aria-pressed={preset === p}
                onClick={() => applyPreset(p)}
              >
                {presetLabel(p)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                From
              </span>
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => setCustom({ from: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                To
              </span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => setCustom({ to: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </label>
            {data && (
              <p className="text-sm text-muted-foreground">
                {rangeLabel(data.from, data.to)} · {data.weekCount} week
                {data.weekCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load reports for this period.
        </p>
      )}

      {data && rows.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No active service users to report on.
          </CardContent>
        </Card>
      )}

      {rows.map((report) => (
        <ServiceUserReportCard key={report.serviceUser.id} report={report} />
      ))}

      {isManager && (
        <div className="mt-2 flex flex-col gap-6 border-t border-border pt-6">
          <ComplianceThresholdsCard />
          <RecordingGuidanceCard />
        </div>
      )}
    </section>
  );
}

function ServiceUserReportCard({ report }: { report: PeriodReport }) {
  const { compliance } = report;
  const missedRefused = report.missedCount + report.refusedCount;

  // No plan anywhere in the range → show the user (so none go missing) but a plain "no activity"
  // line rather than a misleading 0%/red compliance badge and an empty export.
  if (report.weeks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h2 className="text-lg font-semibold">{report.serviceUser.name}</h2>
          <p className="text-sm text-muted-foreground">No plans recorded for this period.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{report.serviceUser.name}</h2>
            <div className="mt-1">
              <ComplianceBadge status={compliance.status} />
            </div>
          </div>
          <ExportPeriodReportButton
            report={report}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Delivered" value={reportHours(compliance.deliveredMinutes)} />
          <Metric label="Contracted" value={reportHours(compliance.contractedMinutes)} />
          <Metric label="Remaining" value={remainingLabel(compliance.remainingMinutes)} />
          <Metric label="Delivery" value={`${compliance.deliveryPct}%`} />
        </dl>

        {report.weeks.length > 1 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Per-week breakdown for {report.serviceUser.name}
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Week
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Delivered
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Contracted
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.weeks.map((wk) => (
                  <tr key={wk.weekPlanId} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{wk.weekCommencing}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {reportHours(wk.compliance.deliveredMinutes)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {reportHours(wk.compliance.contractedMinutes)}
                    </td>
                    <td className="px-3 py-2">
                      <ComplianceBadge status={wk.compliance.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Staff notes{' '}
            <span className="font-normal text-muted-foreground">({report.staffNotes.length})</span>
            {missedRefused > 0 && (
              <span className="ml-2 text-xs font-medium text-destructive">
                {missedRefused} missed/refused
              </span>
            )}
          </h3>
          {report.staffNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes recorded for this period.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {report.staffNotes.map((note, i) => (
                <li
                  key={`${note.weekCommencing}-${note.day}-${i}`}
                  className="rounded-md border border-border/60 bg-muted/30 p-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {note.weekCommencing} · {weekdayLabel(note.day)}
                    </span>
                    <span>{note.activityName}</span>
                    {note.timeSpent !== null && <span>{reportHours(note.timeSpent)}</span>}
                    {note.outcome && <span>· {outcomeLabel(note.outcome)}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{note.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
