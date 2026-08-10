import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ComplianceBadge from '../components/ComplianceBadge';
import ComplianceThresholdsCard from '../components/ComplianceThresholdsCard';
import ExportReportButton from '../components/ExportReportButton';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '@/lib/utils';
import { reportHours } from '../lib/reports';
import { fetchWeeklySummary } from '../lib/summary';
import { currentWeekCommencing, shiftWeek } from '../lib/week';

/**
 * Reports & compliance page (Phases 6 + 8): pick a week and download the one-page commissioner PDF
 * for any service user with a plan that week, and — for managers — tune the 🟢/🟡/🔴 compliance
 * thresholds that colour every status. Distinct from the Dashboard weekly summary, which is for
 * monitoring status. It reuses /api/summary to list the week's plans; every figure is
 * backend-owned. Auditors see the exports but not the (manager-only) threshold editor.
 */
export default function ReportsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [week, setWeek] = useState<string>(() => currentWeekCommencing());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['summary', week],
    queryFn: () => fetchWeeklySummary(week),
  });

  const exportable = data?.rows.filter((row) => row.weekPlanId !== null && row.compliance !== null);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports &amp; compliance</h1>
          <p className="text-sm text-muted-foreground">
            Download the commissioner PDF report for a service user's week.
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

      {exportable && exportable.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No plans to report on this week.
          </CardContent>
        </Card>
      )}

      {exportable && exportable.length > 0 && (
        <ul className="flex flex-col gap-3">
          {exportable.map((row) => (
            <li key={row.serviceUser.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <FileText className="size-5" />
                    </span>
                    <div>
                      <p className="font-medium">{row.serviceUser.name}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {reportHours(row.compliance!.deliveredMinutes)} delivered of{' '}
                        {reportHours(row.compliance!.contractedMinutes)} · {row.compliance!.deliveryPct}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ComplianceBadge status={row.compliance!.status} />
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
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {isManager && (
        <div className="mt-2 border-t border-border pt-6">
          <ComplianceThresholdsCard />
        </div>
      )}
    </section>
  );
}
