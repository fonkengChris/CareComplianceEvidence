import type { WeeklySummaryRow } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ComplianceBadge from '../components/ComplianceBadge';
import ExportReportButton from '../components/ExportReportButton';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { cn } from '@/lib/utils';
import { fetchWeeklySummary } from '../lib/summary';

/**
 * Manager/auditor weekly summary (Phase 7): every active service user's status for one week
 * in a single screen, without opening individual plans. A week picker steps ±7 days; each
 * planned row expands to that service user's per-activity breakdown and a link into the plan.
 * Every figure comes from the backend (CLAUDE.md: the frontend displays, never derives).
 */

/** Minutes → a compact hours string, matching WeekComplianceSummary. */
function toHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

/** The Monday of the week containing `now`, as YYYY-MM-DD (mirrors the server default). */
function currentWeekCommencing(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD date by whole days, staying on the Monday grid. */
function shiftWeek(weekCommencing: string, deltaDays: number): string {
  const d = new Date(`${weekCommencing}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

const COLUMN_COUNT = 8;

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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Contracted</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Missed</TableHead>
                  <TableHead>Refused</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <SummaryRow
                    key={row.serviceUser.id}
                    row={row}
                    isManager={isManager}
                    expanded={expanded.has(row.serviceUser.id)}
                    onToggle={() => toggle(row.serviceUser.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function SummaryRow({
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
    <>
      <TableRow className="align-top">
        <TableCell>
          {hasPlan ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailId}
              className="flex items-center gap-1 text-left font-medium text-primary hover:underline"
            >
              <ChevronDown
                className={cn('size-4 transition-transform', expanded ? '' : '-rotate-90')}
              />
              {serviceUser.name}
            </button>
          ) : (
            <span className="font-medium">{serviceUser.name}</span>
          )}
          {row.reviewHintCount > 0 && (
            <span className="ml-2 text-xs font-medium text-warning">
              ⚑ {row.reviewHintCount} to review
            </span>
          )}
        </TableCell>
        {hasPlan ? (
          <>
            <TableCell>
              <ComplianceBadge status={compliance.status} />
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {toHours(compliance.deliveredMinutes)}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {toHours(compliance.contractedMinutes)}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {compliance.remainingMinutes >= 0
                ? toHours(compliance.remainingMinutes)
                : `over by ${toHours(-compliance.remainingMinutes)}`}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {compliance.deliveryPct}%
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{row.missedCount}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{row.refusedCount}</TableCell>
          </>
        ) : (
          <TableCell className="text-muted-foreground" colSpan={COLUMN_COUNT - 1}>
            {isManager ? (
              <>
                No plan ·{' '}
                <Link
                  to={`/service-users/${serviceUser.id}/week-plans/new`}
                  className="text-primary hover:underline"
                >
                  Create plan
                </Link>
              </>
            ) : (
              'No plan'
            )}
          </TableCell>
        )}
      </TableRow>

      {hasPlan && expanded && (
        <TableRow id={detailId} className="bg-muted/40 hover:bg-muted/40">
          <TableCell className="p-4" colSpan={COLUMN_COUNT}>
            <div className="mb-2 flex items-center justify-between">
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
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
