import type {
  DayEntryInput,
  DayEntryRecord,
  DayEntryStaffCreate,
  WeekPlan,
  WeekPlanCreate,
  WeekPlanUpdate,
  WeekPlanWithEntries,
} from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for the week-plan API — the functions the TanStack Query
 * hooks call. apiFetch attaches the bearer token and silently refreshes on a 401;
 * errors surface as thrown Errors so React Query moves to its error state. Mirrors the
 * service-users lib pattern.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchWeekPlans(serviceUserId?: string): Promise<WeekPlan[]> {
  const query = serviceUserId ? `?serviceUserId=${encodeURIComponent(serviceUserId)}` : '';
  return unwrap<WeekPlan[]>(await apiFetch(`/api/week-plans${query}`));
}

export async function fetchWeekPlan(id: string): Promise<WeekPlanWithEntries> {
  return unwrap<WeekPlanWithEntries>(await apiFetch(`/api/week-plans/${id}`));
}

export async function createWeekPlan(input: WeekPlanCreate): Promise<WeekPlan> {
  return unwrap<WeekPlan>(
    await apiFetch('/api/week-plans', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function updateWeekPlan(id: string, input: WeekPlanUpdate): Promise<WeekPlan> {
  return unwrap<WeekPlan>(
    await apiFetch(`/api/week-plans/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  );
}

/** Bulk-replace the whole set of planned lines for a plan. */
export async function replaceDayEntries(
  id: string,
  entries: DayEntryInput[],
): Promise<WeekPlanWithEntries> {
  return unwrap<WeekPlanWithEntries>(
    await apiFetch(`/api/week-plans/${id}/day-entries`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),
  );
}

/**
 * Staff recording (Phase 5): record what happened on a planned line — time spent,
 * outcome and comment only. Returns the refreshed plan (with recomputed reviewHint).
 */
export async function recordDayEntry(
  planId: string,
  entryId: string,
  body: DayEntryRecord,
): Promise<WeekPlanWithEntries> {
  return unwrap<WeekPlanWithEntries>(
    await apiFetch(`/api/week-plans/${planId}/day-entries/${entryId}/record`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}

/** Staff records an unplanned activity as a new line on the plan. */
export async function addDayEntry(
  planId: string,
  body: DayEntryStaffCreate,
): Promise<WeekPlanWithEntries> {
  return unwrap<WeekPlanWithEntries>(
    await apiFetch(`/api/week-plans/${planId}/day-entries`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

/** Duplicate Previous Week: copy this plan into the given target week. */
export async function duplicateWeekPlan(
  id: string,
  weekCommencing: string,
): Promise<WeekPlanWithEntries> {
  return unwrap<WeekPlanWithEntries>(
    await apiFetch(`/api/week-plans/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ weekCommencing }),
    }),
  );
}
