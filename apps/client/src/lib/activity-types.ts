import type { ActivityType } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helper for the read-only activity-type list, used to populate the planner's
 * activity dropdown. Activities are always selected from this admin-maintained list,
 * never free-typed (CLAUDE.md).
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchActivityTypes(): Promise<ActivityType[]> {
  return unwrap<ActivityType[]>(await apiFetch('/api/activity-types'));
}
