import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/button';

/** Staff can keep the installed app open for a whole shift, so look for a new deploy hourly. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and, when a new version has been deployed, offers a reload
 * instead of taking over the page — a forced reload could throw away a half-recorded entry.
 * Mounted from main.tsx (not AppShell) so the virtual module stays out of component tests.
 */
export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-lg"
    >
      <p className="flex-1">A new version is available. Save any changes, then reload.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button type="button" size="sm" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  );
}
