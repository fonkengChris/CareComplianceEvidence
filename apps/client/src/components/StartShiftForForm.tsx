import type { User } from '@care/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toErrorMessage } from '../lib/errors';
import { startShiftFor } from '../lib/shifts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';

/**
 * Manager fallback for starting a staff member's shift at this home when its check-in screen
 * isn't working. The server checks they belong to the home and audits the manager as the one who
 * started it, with the optional reason.
 */
export function StartShiftForForm({ homeId, staff }: { homeId: string; staff: User[] }) {
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState('');
  const [reason, setReason] = useState('');

  const start = useMutation({
    mutationFn: () => startShiftFor({ staffId, homeId, reason: reason.trim() || undefined }),
    onSuccess: () => {
      setStaffId('');
      setReason('');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });

  if (staff.length === 0) return null;

  return (
    <form
      aria-label="Start a shift for a staff member"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Check-in screen not working? Start a shift for someone here. It's recorded in the audit
        trail under your name.
      </p>
      {start.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(start.error)}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start-for-staff">Staff member</Label>
          <Select
            id="start-for-staff"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="min-w-48"
          >
            <option value="">— Select —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="start-for-reason">Reason (optional)</Label>
          <Input
            id="start-for-reason"
            value={reason}
            maxLength={500}
            placeholder="e.g. Check-in tablet offline"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={!staffId || start.isPending}>
          {start.isPending ? 'Starting…' : 'Start shift'}
        </Button>
      </div>
    </form>
  );
}
