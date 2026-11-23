import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import BrandLogo from '../components/BrandLogo';
import { toErrorMessage } from '../lib/errors';
import { checkInUrl, fetchDisplayCode } from '../lib/shifts';

/** Where the paired display keeps its token (per device; re-pair if it is lost). */
export const DISPLAY_TOKEN_KEY = 'checkInDisplayToken';

/**
 * Read the display token: a fresh `#token=…` pairing link wins (and is stored, then scrubbed from
 * the address bar); otherwise the one stored at pairing. Storage can be blocked (private mode), so
 * every access is guarded and a pairing link still works for the life of the tab.
 */
function readToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (fromHash) {
    try {
      localStorage.setItem(DISPLAY_TOKEN_KEY, fromHash);
    } catch {
      // Storage unavailable — keep using the in-memory token for this tab.
    }
    window.history.replaceState(null, '', window.location.pathname);
    return fromHash;
  }
  try {
    return localStorage.getItem(DISPLAY_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * The on-site check-in screen, for a manager-paired device at a home (office tablet/PC). It shows
 * the home's rotating 6-digit code and a QR of it; staff must enter or scan it to start a shift,
 * proving they are physically there. No user signs in here — the device's own revocable token can
 * fetch this code and nothing else. Public route, outside the app shell.
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
      {token === null || current.isError ? (
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <MonitorSmartphone className="size-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">This screen isn't paired</h1>
          <p role="alert" className="text-muted-foreground">
            {current.isError
              ? toErrorMessage(current.error)
              : 'A manager can pair it from the home’s page in the app (Check-in displays).'}
          </p>
        </div>
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
    </main>
  );
}
