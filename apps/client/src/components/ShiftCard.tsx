import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { toErrorMessage } from '../lib/errors';
import { endShift, fetchMyHomes, fetchMyShift, shiftTime, startShift } from '../lib/shifts';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';
import { Select } from './ui/select';

/**
 * Shift check-in for staff. Home membership alone does not open a home's residents: the staff
 * member starts a shift here (audited, auto-expiring server-side) and ends it when they leave.
 * Starting/ending refreshes the assignment and week-plan lists, which the server scopes to the
 * active shift. Renders nothing for staff with no home (direct assignments only).
 */
export function ShiftCard() {
  const queryClient = useQueryClient();
  const [homeId, setHomeId] = useState('');

  // Re-poll so the card flips to "off shift" shortly after the server-side expiry.
  const shift = useQuery({
    queryKey: ['shifts', 'me'],
    queryFn: fetchMyShift,
    refetchInterval: 60_000,
  });
  const homes = useQuery({ queryKey: ['homes', 'mine'], queryFn: fetchMyHomes });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shifts'] }),
      queryClient.invalidateQueries({ queryKey: ['assignments', 'me'] }),
      queryClient.invalidateQueries({ queryKey: ['week-plans'] }),
    ]);

  const start = useMutation({ mutationFn: startShift, onSuccess: refresh });
  const end = useMutation({ mutationFn: endShift, onSuccess: refresh });

  const activeHomes = (homes.data ?? []).filter((h) => h.active);
  if (shift.isLoading || homes.isLoading) return null;
  if (!shift.data && activeHomes.length === 0) return null;

  const selected = activeHomes.length === 1 ? activeHomes[0]!.id : homeId;
  const error = start.error ?? end.error;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        {shift.data ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 text-primary" />
              On shift at {shift.data.homeName} until {shiftTime(shift.data.expiresAt)}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={end.isPending}
              onClick={() => end.mutate(shift.data!.id)}
            >
              {end.isPending ? 'Ending…' : 'End shift'}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              You're off shift. Start a shift to see and record for the residents of your home.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              {activeHomes.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="shift-home">Home</Label>
                  <Select
                    id="shift-home"
                    value={homeId}
                    onChange={(e) => setHomeId(e.target.value)}
                    className="min-w-56"
                  >
                    <option value="">— Select —</option>
                    {activeHomes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <Button
                type="button"
                disabled={!selected || start.isPending}
                onClick={() => start.mutate(selected)}
              >
                {start.isPending
                  ? 'Starting…'
                  : activeHomes.length === 1
                    ? `Start shift at ${activeHomes[0]!.name}`
                    : 'Start shift'}
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {toErrorMessage(error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
