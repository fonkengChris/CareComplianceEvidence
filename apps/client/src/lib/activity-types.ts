import type { ActivityType } from '@care/shared';
import { api } from './api';

/**
 * Typed helper for the read-only activity-type list, used to populate the planner's
 * activity dropdown. Activities are always selected from this admin-maintained list,
 * never free-typed (CLAUDE.md).
 */

export async function fetchActivityTypes(): Promise<ActivityType[]> {
  const { data } = await api.get<ActivityType[]>('/api/activity-types');
  return data;
}
