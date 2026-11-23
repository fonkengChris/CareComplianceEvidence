import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { describeChange, fetchEntityAudit } from '../lib/audit';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

/** "23 Nov 2026, 14:30"-style local timestamp. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Manager view of who accessed a service user's records and when (GDPR accountability): every
 * opened week plan, photo and report, plus direct-assignment and recorded changes, newest first.
 * Loaded on demand — it can be long.
 */
export function AccessHistoryCard({ serviceUserId }: { serviceUserId: string }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ['audit', 'SERVICE_USER', serviceUserId],
    queryFn: () => fetchEntityAudit('SERVICE_USER', serviceUserId),
    enabled: open,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Access history</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show who accessed these records'}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          {history.isLoading && (
            <p role="status" className="text-muted-foreground">
              Loading…
            </p>
          )}
          {history.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              Could not load the access history.
            </p>
          )}
          {history.data && history.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nobody has accessed these records yet.</p>
          )}
          {history.data && history.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map((log) => (
                  <TableRow key={log.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatWhen(log.createdAt)}
                    </TableCell>
                    <TableCell>{log.actorName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{describeChange(log)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.action === 'VIEW'
                        ? (log.toValue ?? '—')
                        : [log.fromValue, log.toValue].filter(Boolean).join(' → ') || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}
