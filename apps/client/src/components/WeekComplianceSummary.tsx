import type { WeekCompliance } from '@care/shared';
import ComplianceBadge from './ComplianceBadge';

/**
 * Header summary for a week plan: the backend-computed delivered / contracted / remaining
 * hours plus the 🟢/🟡/🔴 badge. Purely presentational — every value comes from
 * `weekPlan.compliance`; nothing is calculated here (CLAUDE.md). Shown on both the manager
 * planner and the staff recording view.
 */

/** Minutes → a compact hours string, e.g. 630 → "10.5h". */
function toHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function WeekComplianceSummary({ compliance }: { compliance: WeekCompliance }) {
  const { deliveredMinutes, contractedMinutes, remainingMinutes, deliveryPct, status } = compliance;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Delivered" value={toHours(deliveredMinutes)} />
        <Stat label="Contracted" value={toHours(contractedMinutes)} />
        {/* Signed remaining: negative means over the contracted total. */}
        <Stat
          label={remainingMinutes >= 0 ? 'Remaining' : 'Over by'}
          value={toHours(Math.abs(remainingMinutes))}
        />
        <Stat label="Delivery" value={`${deliveryPct}%`} />
      </dl>
      <ComplianceBadge status={status} />
    </div>
  );
}
