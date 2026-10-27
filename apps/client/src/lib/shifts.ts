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

/** Everyone on shift right now, optionally at one home (manager's shift monitor). */
export async function fetchActiveShifts(homeId?: string): Promise<ShiftSession[]> {
  const query = homeId ? `?homeId=${encodeURIComponent(homeId)}` : '';
  const { data } = await api.get<ShiftSession[]>(`/api/shifts/active${query}`);
  return data;
}

/**
 * End a shift a manager judges unauthorised and sign the staff member out of the app. The
 * optional reason is kept in the audit trail. No body is returned (204).
 */
export async function terminateShift(sessionId: string, reason?: string): Promise<void> {
  await api.post(`/api/shifts/${sessionId}/terminate`, reason ? { reason } : {});
}

/** "3h 05m"-style time on shift so far, from the start until `now`. */
export function shiftDuration(startedAt: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** "14:30"-style local clock time for a shift timestamp. */
export function shiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
