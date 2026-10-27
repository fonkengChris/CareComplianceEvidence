import type { ShiftSession } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toErrorMessage } from '../lib/errors';
import { fetchActiveShifts, shiftDuration, shiftTime, terminateShift } from '../lib/shifts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

/** How often the monitor re-polls, so new check-ins and expiries show without a reload. */
const REFRESH_MS = 30_000;

/**
 * Live table of everyone on shift (all homes, or one when `homeId` is given) for managers.
 * "End & sign out" is the response to unauthorised access: it opens an inline confirm with an
 * optional reason (kept in the audit trail), then ends the shift and revokes the person's login
 * sessions server-side. Manager-only — the server enforces it regardless of what renders here.
 */
export function ShiftMonitorTable({ homeId }: { homeId?: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const shifts = useQuery({
    queryKey: ['shifts', 'active', homeId ?? 'all'],
    queryFn: () => fetchActiveShifts(homeId),
    refetchInterval: REFRESH_MS,
  });

  const terminate = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      terminateShift(id, why.trim() || undefined),
    onSuccess: () => {
      setConfirming(null);
      setReason('');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });

  if (shifts.isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (shifts.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        Could not load who is on shift.
      </p>
    );
  }
  const rows = shifts.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {homeId ? 'Nobody is on shift here right now.' : 'Nobody is on shift right now.'}
      </p>
    );
  }

  const openConfirm = (s: ShiftSession) => {
    terminate.reset();
    setReason('');
    setConfirming(s.id);
  };

  return (
    <div className="flex flex-col gap-3">
      {terminate.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(terminate.error)}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            {!homeId && <TableHead>Home</TableHead>}
            <TableHead>Started</TableHead>
            <TableHead>Ends</TableHead>
            <TableHead>On shift for</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) =>
            confirming === s.id ? (
              <TableRow key={s.id} className="bg-destructive/5">
                <TableCell colSpan={homeId ? 5 : 6}>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      terminate.mutate({ id: s.id, why: reason });
                    }}
                  >
                    <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                      <label htmlFor={`reason-${s.id}`} className="text-sm font-medium">
                        End {s.staffName}'s shift and sign them out? Reason (optional)
                      </label>
                      <Input
                        id={`reason-${s.id}`}
                        value={reason}
                        maxLength={500}
                        placeholder="e.g. Not on the rota today"
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                    <Button type="submit" variant="destructive" disabled={terminate.isPending}>
                      {terminate.isPending ? 'Signing out…' : 'Confirm sign-out'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={terminate.isPending}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.staffName}</TableCell>
                {!homeId && <TableCell>{s.homeName}</TableCell>}
                <TableCell>{shiftTime(s.startedAt)}</TableCell>
                <TableCell>{shiftTime(s.expiresAt)}</TableCell>
                <TableCell>{shiftDuration(s.startedAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`End ${s.staffName}'s shift and sign them out`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => openConfirm(s)}
                  >
                    End &amp; sign out
                  </Button>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
