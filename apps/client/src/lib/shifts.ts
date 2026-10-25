import type { Home, ShiftSession } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for shift check-in. Starting a shift at one of
 * the caller's homes is what opens their access to that home's service users; ending it (or the
 * server-side expiry) closes it again. The manager helpers drive the home detail page.
 */

/** The caller's active shift, or null when off shift. */
export async function fetchMyShift(): Promise<ShiftSession | null> {
  const { data } = await api.get<ShiftSession | null>('/api/shifts/me');
  return data ?? null;
}

/** The homes the caller belongs to — the ones they may start a shift at. */
export async function fetchMyHomes(): Promise<Home[]> {
  const { data } = await api.get<Home[]>('/api/assignments/my-homes');
  return data;
}

/** Start a shift at a home. */
export async function startShift(homeId: string): Promise<ShiftSession> {
  const { data } = await api.post<ShiftSession>('/api/shifts', { homeId });
  return data;
}

/** End a shift session (own for staff, any for a manager). No body is returned (204). */
export async function endShift(sessionId: string): Promise<void> {
  await api.post(`/api/shifts/${sessionId}/end`);
}

/** Who is on shift at a home right now (manager view). */
export async function fetchHomeShifts(homeId: string): Promise<ShiftSession[]> {
  const { data } = await api.get<ShiftSession[]>(`/api/shifts/home/${homeId}`);
  return data;
}

/** "14:30"-style local clock time for a shift timestamp. */
export function shiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
