import type { WeeklySummary } from '@care/shared';
import { api } from './api';

/**
 * Typed helper over the shared axios instance for the manager weekly-summary API (Phase 7). The
 * instance attaches the bearer token and silently refreshes on a 401; rejections drive React
 * Query's error state. `weekCommencing` is optional — the server defaults to the current week's
 * Monday when omitted.
 */

export async function fetchWeeklySummary(weekCommencing?: string): Promise<WeeklySummary> {
  const query = weekCommencing ? `?weekCommencing=${weekCommencing}` : '';
  const { data } = await api.get<WeeklySummary>(`/api/summary${query}`);
  return data;
}
