import type { AuditLogView } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
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
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit History</h1>
        <p className="text-sm text-muted-foreground">
          Every tracked change — who made it, what changed, and when. Read-only.
        </p>
      </div>

      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load the audit history.
        </p>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No changes recorded yet.
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>From → To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function AuditRow({ log }: { log: AuditLogView }) {
  return (
    <TableRow className="align-top">
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatWhen(log.createdAt)}
      </TableCell>
      <TableCell>{orDash(log.actorName)}</TableCell>
      <TableCell className="text-muted-foreground">{orDash(log.entityLabel)}</TableCell>
      <TableCell className="text-muted-foreground">{describeChange(log)}</TableCell>
      <TableCell className="text-muted-foreground">
        {log.field ? `${orDash(log.fromValue)} → ${orDash(log.toValue)}` : orDash(log.toValue)}
      </TableCell>
    </TableRow>
  );
}
