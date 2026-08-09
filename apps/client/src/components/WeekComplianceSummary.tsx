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

export default function WeekComplianceSummary({ compliance }: { compliance: WeekCompliance }) {
  const { deliveredMinutes, contractedMinutes, remainingMinutes, deliveryPct, status } = compliance;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1">
          <dt className="text-gray-500">Delivered</dt>
          <dd className="font-medium">{toHours(deliveredMinutes)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-gray-500">Contracted</dt>
          <dd className="font-medium">{toHours(contractedMinutes)}</dd>
        </div>
        <div className="flex gap-1">
          {/* Signed remaining: negative means over the contracted total. */}
          <dt className="text-gray-500">{remainingMinutes >= 0 ? 'Remaining' : 'Over by'}</dt>
          <dd className="font-medium">{toHours(Math.abs(remainingMinutes))}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-gray-500">Delivery</dt>
          <dd className="font-medium">{deliveryPct}%</dd>
        </div>
      </dl>
      <ComplianceBadge status={status} />
    </div>
  );
}
