import type { HomeDisplayPaired } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toErrorMessage } from '../lib/errors';
import {
  displayPairingUrl,
  fetchHomeDisplays,
  pairHomeDisplay,
  revokeHomeDisplay,
} from '../lib/shifts';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

/** "23 Nov, 14:30"-style local timestamp. */
function when(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Manager panel for a home's check-in screens. Staff can only start a shift with the rotating
 * code a paired screen shows, so pairing one (an office tablet/PC) is what lets this home's staff
 * check in. Pairing reveals a one-time link to open on that device; revoking stops it at once.
 */
export function CheckInDisplaysCard({ homeId }: { homeId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [paired, setPaired] = useState<HomeDisplayPaired | null>(null);

  const displays = useQuery({
    queryKey: ['home-displays', homeId],
    queryFn: () => fetchHomeDisplays(homeId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['home-displays', homeId] });

  const pair = useMutation({
    mutationFn: () => pairHomeDisplay(homeId, name.trim()),
    onSuccess: (result) => {
      setPaired(result);
      setName('');
      return refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (displayId: string) => revokeHomeDisplay(homeId, displayId),
    onSuccess: refresh,
  });

  const active = (displays.data ?? []).filter((d) => d.revokedAt === null);
  const link = paired ? displayPairingUrl(paired.token) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check-in screens</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Staff start a shift by entering the code shown on a check-in screen at this home, which
          proves they are on site. Pair a tablet or PC that stays at the home.
        </p>
        {(pair.isError || revoke.isError) && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {toErrorMessage(pair.error ?? revoke.error)}
          </p>
        )}

        {displays.data && active.length === 0 && (
          <p className="text-sm font-medium text-warning">
            No check-in screen yet — staff can't start a shift here until one is paired (or a
            manager starts it for them).
          </p>
        )}
        {active.length > 0 && (
          <ul className="flex flex-col gap-2">
            {active.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">{d.name}</span>{' '}
                  <span className="text-muted-foreground">
                    {d.lastSeenAt ? `· last seen ${when(d.lastSeenAt)}` : '· not opened yet'}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Unpair ${d.name}`}
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(d.id)}
                  className="text-destructive hover:text-destructive"
                >
                  Unpair
                </Button>
              </li>
            ))}
          </ul>
        )}

        {link && paired && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3">
            <p className="text-sm">
              <Badge variant="success">Paired</Badge> Open this link on{' '}
              <span className="font-medium">{paired.display.name}</span>. It is shown only once.
              After opening it you can sign out on that device. The screen keeps working.
            </p>
            <Input
              readOnly
              aria-label="Pairing link"
              value={link}
              onFocus={(e) => e.target.select()}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(link)}
              >
                Copy link
              </Button>
              <a
                href={link}
                className="text-sm font-medium text-primary hover:underline self-center"
              >
                Open on this device
              </a>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPaired(null)}>
                Done
              </Button>
            </div>
          </div>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            pair.mutate();
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="display-name">New screen name</Label>
            <Input
              id="display-name"
              value={name}
              maxLength={100}
              placeholder="e.g. Office tablet"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!name.trim() || pair.isPending}>
            {pair.isPending ? 'Pairing…' : 'Pair screen'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
