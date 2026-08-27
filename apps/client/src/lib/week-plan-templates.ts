import type { DayEntryInput, WeekPlanTemplateWithEntries, WeekPlanWithEntries } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the week-plan-template API. A template
 * is 1:1 with a service user, so reads/writes are keyed by `serviceUserId`. Mirrors the
 * week-plans lib pattern (bearer token + silent 401 refresh handled by the instance).
 */

/** The service user's template (created empty on first access) with its planned lines. */
export async function fetchTemplate(serviceUserId: string): Promise<WeekPlanTemplateWithEntries> {
  const { data } = await api.get<WeekPlanTemplateWithEntries>(
    `/api/week-plan-templates/${serviceUserId}`,
  );
  return data;
}

/** Bulk-replace the whole set of planned lines for a service user's template. */
export async function replaceTemplateEntries(
  serviceUserId: string,
  entries: DayEntryInput[],
): Promise<WeekPlanTemplateWithEntries> {
  const { data } = await api.put<WeekPlanTemplateWithEntries>(
    `/api/week-plan-templates/${serviceUserId}/day-entries`,
    { entries },
  );
  return data;
}

/** Generate a new week plan for the service user from its template. */
export async function generateWeekFromTemplate(
  serviceUserId: string,
  weekCommencing: string,
): Promise<WeekPlanWithEntries> {
  const { data } = await api.post<WeekPlanWithEntries>(
    `/api/week-plan-templates/${serviceUserId}/generate`,
    { weekCommencing },
  );
  return data;
}

/** Snapshot an existing week plan's planned lines into its service user's template. */
export async function saveWeekAsTemplate(weekPlanId: string): Promise<WeekPlanTemplateWithEntries> {
  const { data } = await api.post<WeekPlanTemplateWithEntries>(
    `/api/week-plan-templates/from-week/${weekPlanId}`,
  );
  return data;
}
