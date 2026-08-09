import type { WeeklySummaryRow } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ComplianceBadge from '../components/ComplianceBadge';
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Weekly Summary</h1>
        <div className="flex items-center gap-2" role="group" aria-label="Select week">
          <button
            type="button"
            onClick={() => setWeek((w) => shiftWeek(w, -7))}
            className="rounded border border-gray-300 px-3 py-1"
          >
            ← Previous
          </button>
          <span className="font-medium">Week of {week}</span>
          <button
            type="button"
            onClick={() => setWeek((w) => shiftWeek(w, 7))}
            className="rounded border border-gray-300 px-3 py-1"
          >
            Next →
          </button>
        </div>
      </div>

      {data && (
        <p className="text-sm text-gray-500">
          Bands: 🟢 ≥{data.settings.greenMin}% · 🟡 ≥{data.settings.amberMin}% · 🔴 &gt;
          {data.settings.redOverPct}%
        </p>
      )}

      {isLoading && (
        <p role="status" className="text-gray-500">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-red-600">
          Could not load the weekly summary.
        </p>
      )}

      {data && data.rows.length === 0 && (
        <p className="text-gray-500">No active service users.</p>
      )}

      {data && data.rows.length > 0 && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-600">
              <th className="py-2 pr-4">Service User</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Delivered</th>
              <th className="py-2 pr-4">Contracted</th>
              <th className="py-2 pr-4">Remaining</th>
              <th className="py-2 pr-4">Delivery</th>
              <th className="py-2 pr-4">Missed</th>
              <th className="py-2 pr-4">Refused</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <SummaryRow
                key={row.serviceUser.id}
                row={row}
                expanded={expanded.has(row.serviceUser.id)}
                onToggle={() => toggle(row.serviceUser.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SummaryRow({
  row,
  expanded,
  onToggle,
}: {
  row: WeeklySummaryRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { serviceUser, compliance, weekPlanId } = row;
  const hasPlan = compliance !== null && weekPlanId !== null;
  const detailId = `breakdown-${serviceUser.id}`;

  return (
    <>
      <tr className="border-b border-gray-100 align-top">
        <td className="py-2 pr-4">
          {hasPlan ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailId}
              className="text-left font-medium text-blue-700"
            >
              {expanded ? '▾' : '▸'} {serviceUser.name}
            </button>
          ) : (
            <span className="font-medium">{serviceUser.name}</span>
          )}
          {row.reviewHintCount > 0 && (
            <span className="ml-2 text-xs text-amber-700">⚑ {row.reviewHintCount} to review</span>
          )}
        </td>
        {hasPlan ? (
          <>
            <td className="py-2 pr-4">
              <ComplianceBadge status={compliance.status} />
            </td>
            <td className="py-2 pr-4 text-gray-700">{toHours(compliance.deliveredMinutes)}</td>
            <td className="py-2 pr-4 text-gray-700">{toHours(compliance.contractedMinutes)}</td>
            <td className="py-2 pr-4 text-gray-700">
              {compliance.remainingMinutes >= 0
                ? toHours(compliance.remainingMinutes)
                : `over by ${toHours(-compliance.remainingMinutes)}`}
            </td>
            <td className="py-2 pr-4 text-gray-700">{compliance.deliveryPct}%</td>
            <td className="py-2 pr-4 text-gray-700">{row.missedCount}</td>
            <td className="py-2 pr-4 text-gray-700">{row.refusedCount}</td>
          </>
        ) : (
          <td className="py-2 pr-4 text-gray-500" colSpan={COLUMN_COUNT - 1}>
            No plan ·{' '}
            <Link
              to={`/service-users/${serviceUser.id}/week-plans/new`}
              className="text-blue-700 underline"
            >
              Create plan
            </Link>
          </td>
        )}
      </tr>

      {hasPlan && expanded && (
        <tr id={detailId} className="border-b border-gray-100 bg-gray-50">
          <td className="px-4 py-3" colSpan={COLUMN_COUNT}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Activity breakdown</h2>
              <Link to={`/week-plans/${weekPlanId}`} className="text-sm text-blue-700 underline">
                View plan
              </Link>
            </div>
            {row.activityBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500">No activities recorded.</p>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-gray-500">
                    <th className="py-1 pr-4 font-medium">Activity</th>
                    <th className="py-1 pr-4 font-medium">Lines</th>
                    <th className="py-1 pr-4 font-medium">Delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {row.activityBreakdown.map((item) => (
                    <tr key={item.activityTypeId ?? 'unassigned'}>
                      <td className="py-1 pr-4 text-gray-700">{item.activityName}</td>
                      <td className="py-1 pr-4 text-gray-700">{item.entryCount}</td>
                      <td className="py-1 pr-4 text-gray-700">{toHours(item.deliveredMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
