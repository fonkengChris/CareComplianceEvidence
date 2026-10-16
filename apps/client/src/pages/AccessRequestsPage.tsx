import type { AccessRequest } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  type AccessDecision,
  accessStatusLabel,
  accessStatusVariant,
  decideAccessRequest,
  fetchAccessRequests,
} from '../lib/auditor-access';
import { toErrorMessage } from '../lib/errors';

/**
 * Manager review of auditor access requests: pending requests to approve or reject, current
 * grants to revoke, and the decided history. An auditor's reports only include service users
 * approved here (server-enforced). MANAGER-only (route-guarded + server-enforced); table pattern.
 */
export default function AccessRequestsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditor-access', 'all'],
    queryFn: () => fetchAccessRequests(),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: AccessDecision }) =>
      decideAccessRequest(id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auditor-access'] }),
  });

  const all = data ?? [];
  const pending = all.filter((r) => r.status === 'PENDING');
  const approved = all.filter((r) => r.status === 'APPROVED');
  const history = all.filter((r) => r.status === 'REJECTED' || r.status === 'REVOKED');

  const act = (id: string, decision: AccessDecision) => decide.mutate({ id, decision });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Access requests</h1>
        <p className="text-sm text-muted-foreground">
          Auditors request access to the service users they intend to audit. Approve a request to
          show that service user&apos;s reports to the auditor; revoke it to remove access.
        </p>
      </div>

      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load access requests.
        </p>
      )}
      {decide.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(decide.error)}
        </p>
      )}

      {data && (
        <>
          <RequestTable
            title="Pending"
            empty="No pending requests."
            rows={pending}
            actions={(r) => (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => act(r.id, 'approve')}
                  disabled={decide.isPending}
                  aria-label={`Approve ${r.auditorName} for ${r.serviceUserName}`}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => act(r.id, 'reject')}
                  disabled={decide.isPending}
                  aria-label={`Reject ${r.auditorName} for ${r.serviceUserName}`}
                >
                  Reject
                </Button>
              </>
            )}
          />
          <RequestTable
            title="Approved"
            empty="No auditor currently has access."
            rows={approved}
            actions={(r) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => act(r.id, 'revoke')}
                disabled={decide.isPending}
                aria-label={`Revoke ${r.auditorName} for ${r.serviceUserName}`}
              >
                Revoke
              </Button>
            )}
          />
          <RequestTable title="History" empty="No decided requests yet." rows={history} />
        </>
      )}
    </section>
  );
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function RequestTable({
  title,
  empty,
  rows,
  actions,
}: {
  title: string;
  empty: string;
  rows: AccessRequest[];
  actions?: (r: AccessRequest) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
      </h2>
      <Card>
        <CardContent className={rows.length === 0 ? 'p-6 text-sm text-muted-foreground' : 'p-0'}>
          {rows.length === 0 ? (
            empty
          ) : (
            <Table>
              <caption className="sr-only">{title} access requests</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Auditor</TableHead>
                  <TableHead>Service user</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  {actions && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.auditorName}</TableCell>
                    <TableCell>{r.serviceUserName}</TableCell>
                    <TableCell className="max-w-xs text-muted-foreground">
                      {r.reason ?? '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(r.requestedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={accessStatusVariant(r.status)}>
                        {accessStatusLabel(r.status)}
                      </Badge>
                      {r.decidedByName && (
                        <span className="block text-xs text-muted-foreground">
                          by {r.decidedByName}, {formatDate(r.decidedAt)}
                        </span>
                      )}
                    </TableCell>
                    {actions && (
                      <TableCell>
                        <div className="flex justify-end gap-2">{actions(r)}</div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
