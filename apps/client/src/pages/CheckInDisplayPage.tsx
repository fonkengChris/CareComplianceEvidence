import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { toErrorMessage } from '../lib/errors';
import {
  checkInUrl,
  DISPLAY_TOKEN_KEY,
  fetchDisplayCode,
  storeDisplayToken,
  storedDisplayToken,
} from '../lib/shifts';

// Re-exported for callers/tests that reach the token key through this page.
export { DISPLAY_TOKEN_KEY };

/**
 * Read the display token: a fresh `#token=…` pairing link wins (and is stored, then scrubbed from
 * the address bar); otherwise the one stored at pairing. If storage is blocked (private mode), a
 * pairing link still works for the life of the tab.
 */
function readToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (fromHash) {
    storeDisplayToken(fromHash);
    window.history.replaceState(null, '', window.location.pathname);
    return fromHash;
  }
  return storedDisplayToken();
}

/**
 * Keep the screen on while the code is showing (Screen Wake Lock, where supported). The lock is
 * dropped whenever the page is hidden, so it is re-requested on return.
 */
function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (
      navigator as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    ).wakeLock;
    if (!active || !wakeLock) return;
    let lock: { release(): Promise<void> } | null = null;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wakeLock
        .request('screen')
        .then((l) => {
          lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

/**
 * The on-site check-in screen of a work device: a manager-paired tablet/laptop at a home. It shows
 * the home's rotating 6-digit code and a QR of it; staff must enter or scan it to start a shift,
 * proving they are physically there. No user is signed in here — the device's own revocable token
 * can fetch this code and nothing else, and never expires (it stays "logged in" until a manager
 * unpairs it). Opening the app on a work device lands here (LoginPage redirects). Public route,
 * outside the app shell.
 */
export default function CheckInDisplayPage() {
  const [token] = useState(readToken);
  const [now, setNow] = useState(() => Date.now());

  const current = useQuery({
    queryKey: ['check-in-display', token],
    queryFn: () => fetchDisplayCode(token!),
    enabled: token !== null,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  // Tick the countdown each second; refetch the moment the shown code rolls over.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expiresAt = current.data ? new Date(current.data.expiresAt).getTime() : null;
  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const { refetch } = current;
  useWakeLock(Boolean(current.data));

  // Unpaired by a manager (401 → null): forget the token so the device is an ordinary one again.
  const revoked = current.data === null;
  useEffect(() => {
    if (revoked) storeDisplayToken(null);
  }, [revoked]);
  useEffect(() => {
    if (secondsLeft === 0) void refetch();
  }, [secondsLeft, refetch]);

  const [qr, setQr] = useState<string | null>(null);
  const homeId = current.data?.homeId;
  const code = current.data?.code;
  useEffect(() => {
    if (!homeId || !code) return;
    let cancelled = false;
    QRCode.toString(checkInUrl(homeId, code), { type: 'svg', margin: 1 })
      .then((svg) => {
        if (!cancelled) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [homeId, code]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6 text-foreground">
      <BrandLogo size="lg" className="text-foreground" />
      {token === null || revoked ? (
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <MonitorSmartphone className="size-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">This screen isn't paired</h1>
          <p role="alert" className="text-muted-foreground">
            {revoked
              ? 'This device is not paired any more. A manager can sign in here and make it a work device again from the home’s page.'
              : 'A manager can sign in here and make it a work device from the home’s page (Work devices).'}
          </p>
          <Link to="/login" className="text-sm font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      ) : current.isError ? (
        // A network/server hiccup: keep polling (the interval carries on) rather than unpairing.
        <p role="alert" className="text-muted-foreground">
          Can't reach the server ({toErrorMessage(current.error)}) — retrying…
        </p>
      ) : !current.data ? (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      ) : (
        <div className="flex w-full max-w-3xl flex-col items-center gap-8 md:flex-row md:justify-center md:gap-14">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-xl font-medium text-muted-foreground">
              Shift check-in · {current.data.homeName}
            </h1>
            <p
              aria-label="Check-in code"
              className="font-mono text-7xl font-semibold tracking-[0.2em] tabular-nums sm:text-8xl"
            >
              {current.data.code}
            </p>
            <p className="text-sm text-muted-foreground">
              Changes in {secondsLeft}s · enter it on your dashboard, or scan the code
            </p>
          </div>
          {qr && (
            <img
              src={qr}
              alt="QR code to start your shift"
              className="size-56 rounded-xl bg-white p-3 shadow-sm"
            />
          )}
        </div>
      )}
      {token !== null && !revoked && (
        <Link
          to="/login?manage"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Manager sign-in
        </Link>
      )}
    </main>
  );
}
