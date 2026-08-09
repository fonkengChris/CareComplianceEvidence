import type { AuditLogView } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { describeChange, fetchAuditLogs } from '../lib/audit';

/**
 * Audit history (Phase 9): a read-only feed of tracked field changes (who / what / from → to /
 * when) for managers and auditors. Every value comes from the backend append-only trail — this
 * page only displays it, and there is no edit/delete affordance anywhere (CLAUDE.md).
 */

/** ISO timestamp → a compact, locale-friendly "when". */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** A missing text value renders as an em dash rather than an empty cell. */
function orDash(value: string | null): string {
  return value === null || value === '' ? '—' : value;
}

export default function AuditHistoryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: fetchAuditLogs,
  });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Audit History</h1>
      <p className="text-sm text-gray-500">
        Every tracked change — who made it, what changed, and when. Read-only.
      </p>

      {isLoading && (
        <p role="status" className="text-gray-500">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-red-600">
          Could not load the audit history.
        </p>
      )}

      {data && data.length === 0 && <p className="text-gray-500">No changes recorded yet.</p>}

      {data && data.length > 0 && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-600">
              <th className="py-2 pr-4">When</th>
              <th className="py-2 pr-4">Who</th>
              <th className="py-2 pr-4">Record</th>
              <th className="py-2 pr-4">Change</th>
              <th className="py-2 pr-4">From → To</th>
            </tr>
          </thead>
          <tbody>
            {data.map((log) => (
              <AuditRow key={log.id} log={log} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function AuditRow({ log }: { log: AuditLogView }) {
  return (
    <tr className="border-b border-gray-100 align-top text-sm">
      <td className="py-2 pr-4 whitespace-nowrap text-gray-700">{formatWhen(log.createdAt)}</td>
      <td className="py-2 pr-4 text-gray-700">{orDash(log.actorName)}</td>
      <td className="py-2 pr-4 text-gray-700">{orDash(log.entityLabel)}</td>
      <td className="py-2 pr-4 text-gray-700">{describeChange(log)}</td>
      <td className="py-2 pr-4 text-gray-700">
        {log.field ? `${orDash(log.fromValue)} → ${orDash(log.toValue)}` : orDash(log.toValue)}
      </td>
    </tr>
  );
}
