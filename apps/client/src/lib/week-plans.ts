import type {
  DayEntryInput,
  DayEntryRecord,
  DayEntryStaffCreate,
  WeekPlan,
  WeekPlanCreate,
  WeekPlanUpdate,
  WeekPlanWithEntries,
} from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the week-plan API — the functions the
 * TanStack Query hooks call. The instance attaches the bearer token and silently refreshes
 * on a 401; non-2xx responses reject with the server's error message so React Query moves
 * to its error state. Mirrors the service-users lib pattern.
 */

export async function fetchWeekPlans(serviceUserId?: string): Promise<WeekPlan[]> {
  const query = serviceUserId ? `?serviceUserId=${encodeURIComponent(serviceUserId)}` : '';
  const { data } = await api.get<WeekPlan[]>(`/api/week-plans${query}`);
  return data;
}

export async function fetchWeekPlan(id: string): Promise<WeekPlanWithEntries> {
  const { data } = await api.get<WeekPlanWithEntries>(`/api/week-plans/${id}`);
  return data;
}

export async function createWeekPlan(input: WeekPlanCreate): Promise<WeekPlan> {
  const { data } = await api.post<WeekPlan>('/api/week-plans', input);
  return data;
}

export async function updateWeekPlan(id: string, input: WeekPlanUpdate): Promise<WeekPlan> {
  const { data } = await api.put<WeekPlan>(`/api/week-plans/${id}`, input);
  return data;
}

/** Bulk-replace the whole set of planned lines for a plan. */
export async function replaceDayEntries(
  id: string,
  entries: DayEntryInput[],
): Promise<WeekPlanWithEntries> {
  const { data } = await api.put<WeekPlanWithEntries>(`/api/week-plans/${id}/day-entries`, {
    entries,
  });
  return data;
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
  const { data } = await api.patch<WeekPlanWithEntries>(
    `/api/week-plans/${planId}/day-entries/${entryId}/record`,
    body,
  );
  return data;
}

/** Staff records an unplanned activity as a new line on the plan. */
export async function addDayEntry(
  planId: string,
  body: DayEntryStaffCreate,
): Promise<WeekPlanWithEntries> {
  const { data } = await api.post<WeekPlanWithEntries>(
    `/api/week-plans/${planId}/day-entries`,
    body,
  );
  return data;
}

/** Duplicate Previous Week: copy this plan into the given target week. */
export async function duplicateWeekPlan(
  id: string,
  weekCommencing: string,
): Promise<WeekPlanWithEntries> {
  const { data } = await api.post<WeekPlanWithEntries>(`/api/week-plans/${id}/duplicate`, {
    weekCommencing,
  });
  return data;
}
