import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, QrCode } from 'lucide-react';
import { useState } from 'react';
import { toErrorMessage } from '../lib/errors';
import {
  checkInFromScan,
  endShift,
  fetchMyHomes,
  fetchMyShift,
  parseCheckIn,
  shiftTime,
  startShift,
} from '../lib/shifts';
import { QrScanner } from './QrScanner';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';

/**
 * Shift check-in for staff. Home membership alone does not open a home's residents: the staff
 * member starts a shift here with the 6-digit code shown on the home's check-in display (proof
 * they are on site; audited, auto-expiring server-side) and ends it when they leave. Scanning the
 * display's QR opens the app with `?checkin=<home>.<code>`, which prefills both; "Scan QR code"
 * reads the same QR with the camera from inside the app (the phone's camera app opens the browser,
 * not the installed app).
 * Starting/ending refreshes the assignment and week-plan lists, which the server scopes to the
 * active shift. Renders nothing for staff with no home (direct assignments only).
 */
export function ShiftCard({ checkIn = null }: { checkIn?: string | null }) {
  const queryClient = useQueryClient();
  // A scanned display QR lands on the dashboard as ?checkin=…; read once to prefill.
  const [scanned] = useState(() => parseCheckIn(checkIn));
  const [homeId, setHomeId] = useState(scanned?.homeId ?? '');
  const [code, setCode] = useState(scanned?.code ?? '');
  const [scanning, setScanning] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);

  const onScan = (text: string) => {
    const found = checkInFromScan(text);
    if (!found) {
      setScanHint("That isn't a check-in QR code — scan the code on the home's check-in screen.");
      return;
    }
    setHomeId(found.homeId);
    setCode(found.code);
    setScanHint(null);
    setScanning(false);
  };

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

  const start = useMutation({
    mutationFn: startShift,
    onSuccess: () => {
      setCode('');
      return refresh();
    },
  });
  const end = useMutation({ mutationFn: endShift, onSuccess: refresh });

  const activeHomes = (homes.data ?? []).filter((h) => h.active);
  if (shift.isLoading || homes.isLoading) return null;
  if (!shift.data && activeHomes.length === 0) return null;

  const selected = activeHomes.length === 1 ? activeHomes[0]!.id : homeId;
  const codeValid = /^\d{6}$/.test(code);
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
              You're off shift. To see and record for the residents of your home, enter the code
              shown on the home's check-in screen (or scan its QR code).
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shift-code">Check-in code</Label>
                <Input
                  id="shift-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-32 font-mono tracking-widest"
                />
              </div>
              <Button
                type="button"
                disabled={!selected || !codeValid || start.isPending}
                onClick={() => start.mutate({ homeId: selected, code })}
              >
                {start.isPending
                  ? 'Starting…'
                  : activeHomes.length === 1
                    ? `Start shift at ${activeHomes[0]!.name}`
                    : 'Start shift'}
              </Button>
              {!scanning && (
                <Button type="button" variant="outline" onClick={() => setScanning(true)}>
                  <QrCode className="size-4" />
                  Scan QR code
                </Button>
              )}
            </div>
            {scanning && (
              <QrScanner
                onScan={onScan}
                onClose={() => {
                  setScanning(false);
                  setScanHint(null);
                }}
              />
            )}
            {scanHint && <p className="text-sm text-muted-foreground">{scanHint}</p>}
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
