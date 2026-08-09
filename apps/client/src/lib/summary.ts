import type { WeeklySummary } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helper over apiFetch for the manager weekly-summary API (Phase 7). apiFetch attaches
 * the bearer token and silently refreshes on a 401; errors surface as thrown Errors so React
 * Query can move to its error state. `weekCommencing` is optional — the server defaults to the
 * current week's Monday when omitted.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchWeeklySummary(weekCommencing?: string): Promise<WeeklySummary> {
  const query = weekCommencing ? `?weekCommencing=${weekCommencing}` : '';
  return unwrap<WeeklySummary>(await apiFetch(`/api/summary${query}`));
}
