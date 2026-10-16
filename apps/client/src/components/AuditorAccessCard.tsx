import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  accessStatusLabel,
  accessStatusVariant,
  fetchMyAccessRequests,
  fetchRequestableServiceUsers,
  requestAccess,
  withdrawAccessRequest,
} from '../lib/auditor-access';
import { toErrorMessage } from '../lib/errors';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

/**
 * The auditor's access panel on the Reports page: pick the service users you intend to audit
 * (with an optional reason) and send the request to a manager, then track each request's status.
 * Only approved service users appear in the auditor's reports — enforced by the server; this
 * card just raises and lists requests.
 */
export default function AuditorAccessCard() {
  const queryClient = useQueryClient();
  const requestable = useQuery({
    queryKey: ['auditor-access', 'requestable'],
    queryFn: fetchRequestableServiceUsers,
  });
  const mine = useQuery({ queryKey: ['auditor-access', 'me'], queryFn: fetchMyAccessRequests });

  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auditor-access'] });

  const submit = useMutation({
    mutationFn: () => requestAccess(selected, reason.trim() || undefined),
    onSuccess: () => {
      setSelected([]);
      setReason('');
      invalidate();
    },
  });
  const withdraw = useMutation({ mutationFn: withdrawAccessRequest, onSuccess: invalidate });

  // Only service users with no open (pending/approved) request can be requested.
  const available = (requestable.data ?? []).filter((su) => su.status === null);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-4">
        <div>
          <h2 className="text-lg font-semibold">Audit access</h2>
          <p className="text-sm text-muted-foreground">
            Choose the service users whose records you intend to audit. A manager must approve each
            request before their reports appear here.
          </p>
        </div>

        <form
          aria-label="Request audit access"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected.length > 0) submit.mutate();
          }}
        >
          {requestable.isLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading service users…
            </p>
          )}
          {requestable.data && available.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have already requested every service user.
            </p>
          )}
          {available.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Service users</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {available.map((su) => (
                  <label
                    key={su.id}
                    className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(su.id)}
                      onChange={() => toggle(su.id)}
                    />
                    <span>
                      {su.name}
                      {su.homeName && (
                        <span className="block text-xs text-muted-foreground">{su.homeName}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {available.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="audit-reason">Reason (optional)</Label>
              <Textarea
                id="audit-reason"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Quarterly commissioner audit"
              />
            </div>
          )}
          {submit.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {toErrorMessage(submit.error)}
            </p>
          )}
          {available.length > 0 && (
            <div>
              <Button type="submit" size="sm" disabled={selected.length === 0 || submit.isPending}>
                {submit.isPending ? 'Sending…' : 'Request access'}
              </Button>
            </div>
          )}
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Your requests</h3>
          {withdraw.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {toErrorMessage(withdraw.error)}
            </p>
          )}
          {mine.data && mine.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          )}
          {mine.data && mine.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mine.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{r.serviceUserName}</span>
                    <Badge variant={accessStatusVariant(r.status)}>
                      {accessStatusLabel(r.status)}
                    </Badge>
                  </span>
                  {r.status === 'PENDING' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => withdraw.mutate(r.id)}
                      disabled={withdraw.isPending}
                    >
                      Withdraw
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
