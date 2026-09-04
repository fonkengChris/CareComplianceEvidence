import type { DailyDeliveredMinutes, WeeklySummaryRow } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ComplianceBadge from '../components/ComplianceBadge';
import ComplianceThresholdsCard from '../components/ComplianceThresholdsCard';
import ExportReportButton from '../components/ExportReportButton';
import RecordingGuidanceCard from '../components/RecordingGuidanceCard';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '@/lib/utils';
import { reportHours } from '../lib/reports';
import { fetchWeeklySummary } from '../lib/summary';
import { currentWeekCommencing, shiftWeek } from '../lib/week';

/**
 * Reports & compliance page (Phases 6 + 8). Presents the week's plans as a single table that
 * mirrors the commissioner spreadsheet's "Summary" sheet — one row per active service user with
 * delivered / contracted / remaining hours, a per-weekday (Mon–Sun) breakdown, missed/refused
 * counts and the plan's note — from which a manager downloads the one-page commissioner PDF.
 * Every figure is backend-owned (CLAUDE.md); the table only displays what /api/summary returns.
 * Managers additionally tune the 🟢/🟡/🔴 thresholds below; auditors see the table but not the editor.
 */

const WEEKDAY_COLUMNS: { key: keyof DailyDeliveredMinutes; label: string }[] = [
  { key: 'MON', label: 'Mon' },
  { key: 'TUE', label: 'Tue' },
  { key: 'WED', label: 'Wed' },
  { key: 'THU', label: 'Thu' },
  { key: 'FRI', label: 'Fri' },
  { key: 'SAT', label: 'Sat' },
  { key: 'SUN', label: 'Sun' },
];

/** Compact hours for a table cell; a dash for an empty day keeps the grid readable. */
function hoursCell(minutes: number): string {
  return minutes > 0 ? reportHours(minutes) : '–';
}

/** Remaining hours as text, flagging an overspend the way the PDF does. */
function remainingLabel(remainingMinutes: number): string {
  return remainingMinutes >= 0
    ? reportHours(remainingMinutes)
    : `-${reportHours(-remainingMinutes)}`;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [week, setWeek] = useState<string>(() => currentWeekCommencing());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['summary', week],
    queryFn: () => fetchWeeklySummary(week),
  });

  const rows = data?.rows ?? [];
  const planned = rows.filter((row) => row.weekPlanId !== null && row.compliance !== null);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports &amp; compliance</h1>
          <p className="text-sm text-muted-foreground">
            Week commencing {week}. Download the commissioner PDF for any service user's week.
          </p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Select week">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeek((w) => shiftWeek(w, -7))}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="min-w-32 text-center text-sm font-medium tabular-nums">
            Week of {week}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeek((w) => shiftWeek(w, 7))}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load reports for this week.
        </p>
      )}

      {data && planned.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No plans to report on this week.
          </CardContent>
        </Card>
      )}

      {data && planned.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Weekly summary of delivered support hours for week commencing {week}
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Service user
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Delivered
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Contracted
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Remaining
                  </th>
                  {WEEKDAY_COLUMNS.map((col) => (
                    <th key={col.key} scope="col" className="px-2 py-3 text-right font-medium">
                      {col.label}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    M/R
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {planned.map((row) => (
                  <SummaryTableRow key={row.serviceUser.id} row={row} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {isManager && (
        <div className="mt-2 flex flex-col gap-6 border-t border-border pt-6">
          <ComplianceThresholdsCard />
          <RecordingGuidanceCard />
        </div>
      )}
    </section>
  );
}

function SummaryTableRow({ row }: { row: WeeklySummaryRow }) {
  // Both are non-null here: parent filters to planned rows before rendering.
  const compliance = row.compliance!;
  const missedRefused = row.missedCount + row.refusedCount;

  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{row.serviceUser.name}</div>
        {row.notes && (
          <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={row.notes}>
            {row.notes}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {reportHours(compliance.deliveredMinutes)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
        {reportHours(compliance.contractedMinutes)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {remainingLabel(compliance.remainingMinutes)}
      </td>
      {WEEKDAY_COLUMNS.map((col) => (
        <td
          key={col.key}
          className={cn(
            'px-2 py-3 text-right tabular-nums',
            row.dailyMinutes[col.key] === 0 && 'text-muted-foreground',
          )}
        >
          {hoursCell(row.dailyMinutes[col.key])}
        </td>
      ))}
      <td className="px-3 py-3 text-right tabular-nums">
        {missedRefused > 0 ? (
          <span className="font-medium text-destructive">{missedRefused}</span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
      <td className="px-4 py-3">
        <ComplianceBadge status={compliance.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Link
            to={`/week-plans/${row.weekPlanId}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            View plan
          </Link>
          <ExportReportButton
            weekPlanId={row.weekPlanId!}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
          />
        </div>
      </td>
    </tr>
  );
}
