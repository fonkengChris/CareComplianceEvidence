import type { WeeklySummaryRow } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ComplianceBadge from '../components/ComplianceBadge';
import ComplianceRing from '../components/ComplianceRing';
import ExportReportButton from '../components/ExportReportButton';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '@/lib/utils';
import { fetchWeeklySummary } from '../lib/summary';
import { currentWeekCommencing, shiftWeek } from '../lib/week';

/**
 * Manager/auditor weekly summary (Phase 7): every active service user's status for one week
 * on a single screen, without opening individual plans. A ring-card grid replaces the old
 * table — each planned card expands to that service user's per-activity breakdown and a link
 * into the plan. Every figure comes from the backend (CLAUDE.md: the frontend displays, never
 * derives); the overview band only sums those figures for at-a-glance context.
 */

/** Minutes → a compact hours string, matching WeekComplianceSummary. */
function toHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

export default function ManagerSummaryPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [week, setWeek] = useState<string>(() => currentWeekCommencing());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['summary', week],
    queryFn: () => fetchWeeklySummary(week),
  });

  function toggle(serviceUserId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(serviceUserId)) next.delete(serviceUserId);
      else next.add(serviceUserId);
      return next;
    });
  }

  const planned = data?.rows.filter((r) => r.compliance !== null) ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly Summary</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              Bands: 🟢 ≥{data.settings.greenMin}% · 🟡 ≥{data.settings.amberMin}% · 🔴 &gt;
              {data.settings.redOverPct}%
            </p>
          )}
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
          Could not load the weekly summary.
        </p>
      )}

      {data && data.rows.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No active service users.
          </CardContent>
        </Card>
      )}

      {data && data.rows.length > 0 && (
        <>
          <OverviewBand rows={data.rows} planned={planned} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.rows.map((row) => (
              <SummaryCard
                key={row.serviceUser.id}
                row={row}
                isManager={isManager}
                expanded={expanded.has(row.serviceUser.id)}
                onToggle={() => toggle(row.serviceUser.id)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * At-a-glance band: an overall delivery ring plus status counts. Pure display aggregation of the
 * backend figures — it neither computes nor overrides any compliance status.
 */
function OverviewBand({
  rows,
  planned,
}: {
  rows: WeeklySummaryRow[];
  planned: WeeklySummaryRow[];
}) {
  const delivered = planned.reduce((sum, r) => sum + (r.compliance?.deliveredMinutes ?? 0), 0);
  const contracted = planned.reduce((sum, r) => sum + (r.compliance?.contractedMinutes ?? 0), 0);
  const overallPct = contracted > 0 ? Math.round((delivered / contracted) * 100) : 0;
  const reviewTotal = rows.reduce((sum, r) => sum + r.reviewHintCount, 0);
  const onTrack = planned.filter((r) => r.compliance?.status === 'ON_TRACK').length;
  const attention = planned.filter(
    (r) => r.compliance?.status === 'ATTENTION' || r.compliance?.status === 'OVER_HOURS'
  ).length;
  const underTarget = planned.filter((r) => r.compliance?.status === 'UNDER_TARGET').length;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-6 p-6 pt-6">
        <div className="flex items-center gap-5">
          <ComplianceRing deliveryPct={overallPct} size="lg" />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall delivery</p>
            <p className="font-display text-lg font-semibold">
              {toHours(delivered)} <span className="text-muted-foreground">of</span>{' '}
              {toHours(contracted)}
            </p>
            <p className="text-sm text-muted-foreground">
              {planned.length} planned · {rows.length - planned.length} without a plan
            </p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Fact label="On track" value={onTrack} />
          <Fact label="Under target" value={underTarget} />
          <Fact label="Attention" value={attention} />
          <Fact label="To review" value={reviewTotal} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-display text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SummaryCard({
  row,
  isManager,
  expanded,
  onToggle,
}: {
  row: WeeklySummaryRow;
  isManager: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { serviceUser, compliance, weekPlanId } = row;
  const hasPlan = compliance !== null && weekPlanId !== null;
  const detailId = `breakdown-${serviceUser.id}`;

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5 pt-5">
        <div className="flex items-start gap-4">
          {hasPlan ? (
            <ComplianceRing status={compliance.status} deliveryPct={compliance.deliveryPct} />
          ) : (
            <div className="grid size-28 place-items-center rounded-full border-2 border-dashed border-border text-2xl text-muted-foreground">
              —
            </div>
          )}
          <div className="min-w-0 flex-1">
            {hasPlan ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={detailId}
                className="flex items-center gap-1 text-left font-semibold text-primary hover:underline"
              >
                <ChevronDown
                  className={cn('size-4 transition-transform', expanded ? '' : '-rotate-90')}
                />
                {serviceUser.name}
              </button>
            ) : (
              <span className="font-semibold">{serviceUser.name}</span>
            )}

            {hasPlan ? (
              <div className="mt-2 flex flex-col gap-2">
                <ComplianceBadge status={compliance.status} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <Metric label="Delivered" value={toHours(compliance.deliveredMinutes)} />
                  <Metric label="Contracted" value={toHours(compliance.contractedMinutes)} />
                  <Metric
                    label={compliance.remainingMinutes >= 0 ? 'Remaining' : 'Over by'}
                    value={toHours(Math.abs(compliance.remainingMinutes))}
                  />
                  <Metric label="Delivery" value={`${compliance.deliveryPct}%`} />
                </dl>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {isManager ? (
                  <>
                    No plan for this week ·{' '}
                    <Link
                      to={`/service-users/${serviceUser.id}/week-plans/new`}
                      className="text-primary hover:underline"
                    >
                      Create plan
                    </Link>
                  </>
                ) : (
                  'No plan for this week'
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {row.reviewHintCount > 0 && (
            <span className="font-medium text-warning">⚑ {row.reviewHintCount} to review</span>
          )}
          {hasPlan && (row.missedCount > 0 || row.refusedCount > 0) && (
            <span className="tabular-nums">
              {row.missedCount} missed · {row.refusedCount} refused
            </span>
          )}
        </div>

        {hasPlan && expanded && (
          <div id={detailId} className="mt-auto border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Activity breakdown</h2>
              <div className="flex items-center gap-2">
                <ExportReportButton
                  weekPlanId={weekPlanId}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                />
                <Link
                  to={`/week-plans/${weekPlanId}`}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                >
                  View plan
                </Link>
              </div>
            </div>
            {row.activityBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities recorded.</p>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Activity</th>
                    <th className="py-1 pr-4 font-medium">Lines</th>
                    <th className="py-1 pr-4 font-medium">Delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {row.activityBreakdown.map((item) => (
                    <tr key={item.activityTypeId ?? 'unassigned'}>
                      <td className="py-1 pr-4">{item.activityName}</td>
                      <td className="py-1 pr-4 text-muted-foreground">{item.entryCount}</td>
                      <td className="py-1 pr-4 text-muted-foreground">
                        {toHours(item.deliveredMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
