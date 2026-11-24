import type { HomeDisplayPaired } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { toErrorMessage } from '../lib/errors';
import {
  displayPairingUrl,
  fetchHomeDisplays,
  pairHomeDisplay,
  revokeHomeDisplay,
  storeDisplayToken,
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
 * Manager panel for a home's work devices (check-in screens). Staff can only start a shift with
 * the rotating code a work device shows, so pairing one (an office tablet/laptop) is what lets this
 * home's staff check in. A work device is not a user: it holds its own revocable token that can
 * fetch the code and nothing else. Pair it either here on the device itself ("Make this a work
 * device" — stores the token, signs the manager out, shows the code) or from another device via a
 * one-time pairing link. Unpairing stops it at once.
 */
export function CheckInDisplaysCard({ homeId }: { homeId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [name, setName] = useState('');
  const [paired, setPaired] = useState<HomeDisplayPaired | null>(null);

  const displays = useQuery({
    queryKey: ['home-displays', homeId],
    queryFn: () => fetchHomeDisplays(homeId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['home-displays', homeId] });

  const pair = useMutation({
    mutationFn: (target: 'this-device' | 'link') =>
      pairHomeDisplay(homeId, name.trim()).then((result) => ({ result, target })),
    onSuccess: ({ result, target }) => {
      setName('');
      if (target === 'link') {
        setPaired(result);
        return refresh();
      }
      // This device becomes the work device: keep its token, leave no manager session behind.
      if (storeDisplayToken(result.token)) navigate('/check-in-display', { replace: true });
      else window.location.assign(displayPairingUrl(result.token));
      logout().catch(() => undefined);
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
        <CardTitle>Work devices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          A work device is a tablet or laptop that stays at this home and shows the check-in code
          staff need to start a shift, which proves they are on site. It stays paired until you
          unpair it, and it can't open or record anything about residents.
        </p>
        {(pair.isError || revoke.isError) && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {toErrorMessage(pair.error ?? revoke.error)}
          </p>
        )}

        {displays.data && active.length === 0 && (
          <p className="text-sm font-medium text-warning">
            No work device yet — staff can't start a shift here until one is paired (or a manager
            starts it for them).
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
              <span className="font-medium">{paired.display.name}</span>. It is shown only once. If
              you are signed in on that device, sign out afterwards. The device keeps showing the
              code.
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
          className="flex flex-col gap-2"
          aria-label="Pair a work device"
          onSubmit={(e) => {
            e.preventDefault();
            pair.mutate('this-device');
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="display-name">Device name</Label>
              <Input
                id="display-name"
                value={name}
                maxLength={100}
                placeholder="e.g. Office tablet"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!name.trim() || pair.isPending}>
              {pair.isPending ? 'Pairing…' : 'Make this a work device'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!name.trim() || pair.isPending}
              onClick={() => pair.mutate('link')}
            >
              Get a pairing link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            On the tablet or laptop itself, choose{' '}
            <span className="font-medium">Make this a work device</span>: you'll be signed out and
            it will show the code from then on. To pair a different device, get a link and open it
            there.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
