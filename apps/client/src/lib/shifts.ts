import type {
  CheckInDisplayCode,
  Home,
  HomeDisplay,
  HomeDisplayPaired,
  ShiftSession,
  ShiftStart,
  ShiftStartFor,
} from '@care/shared';
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

/** Start a shift at a home, proving presence with the code shown on the home's check-in display. */
export async function startShift(input: ShiftStart): Promise<ShiftSession> {
  const { data } = await api.post<ShiftSession>('/api/shifts', input);
  return data;
}

/** A manager starts a staff member's shift (fallback when the home's display isn't working). */
export async function startShiftFor(input: ShiftStartFor): Promise<ShiftSession> {
  const { data } = await api.post<ShiftSession>('/api/shifts/start-for', input);
  return data;
}

/** A home's paired check-in displays (manager view). */
export async function fetchHomeDisplays(homeId: string): Promise<HomeDisplay[]> {
  const { data } = await api.get<HomeDisplay[]>(`/api/homes/${homeId}/displays`);
  return data;
}

/** Pair a new check-in display at a home. The returned token is shown only this once. */
export async function pairHomeDisplay(homeId: string, name: string): Promise<HomeDisplayPaired> {
  const { data } = await api.post<HomeDisplayPaired>(`/api/homes/${homeId}/displays`, { name });
  return data;
}

/** Unpair a check-in display; it stops showing codes at once. No body is returned (204). */
export async function revokeHomeDisplay(homeId: string, displayId: string): Promise<void> {
  await api.post(`/api/homes/${homeId}/displays/${displayId}/revoke`);
}

/** The current code for the home a display token is paired with (no user session needed). */
export async function fetchDisplayCode(token: string): Promise<CheckInDisplayCode> {
  const { data } = await api.get<CheckInDisplayCode>('/api/check-in-display/code', {
    headers: { 'X-Display-Token': token },
  });
  return data;
}

/** The link that pairs a device as a home's check-in display (token in the hash, never sent to the server in logs). */
export function displayPairingUrl(token: string, origin: string = window.location.origin): string {
  return `${origin}/check-in-display#token=${token}`;
}

/** The link a display's QR code encodes: opens the app with the home and code prefilled. */
export function checkInUrl(
  homeId: string,
  code: string,
  origin: string = window.location.origin,
): string {
  return `${origin}/?checkin=${homeId}.${code}`;
}

/** Parse a `?checkin=<homeId>.<code>` value from a scanned display QR, or null. */
export function parseCheckIn(value: string | null): { homeId: string; code: string } | null {
  const match = value?.match(/^([0-9a-f-]{36})\.(\d{6})$/i);
  return match ? { homeId: match[1]!, code: match[2]! } : null;
}

/** Read the check-in from the text of a scanned display QR (a `checkInUrl` link), or null. */
export function checkInFromScan(text: string): { homeId: string; code: string } | null {
  try {
    return parseCheckIn(new URL(text).searchParams.get('checkin'));
  } catch {
    return null;
  }
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
