import type { AssignedStaff, ServiceUser, User } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the supervision group (Phase 5).
 * `fetchMyAssignments` powers the staff dashboard (the caller's own service users); the manager
 * helpers drive the assignment section on the service-user detail page. Mirrors the other lib
 * modules.
 */

/** The service users the current staff member supervises. */
export async function fetchMyAssignments(): Promise<ServiceUser[]> {
  const { data } = await api.get<ServiceUser[]>('/api/assignments/me');
  return data;
}

/** The staff members directly assigned to a service user, with when each link ends (manager view). */
export async function fetchStaffForServiceUser(serviceUserId: string): Promise<AssignedStaff[]> {
  const { data } = await api.get<AssignedStaff[]>(`/api/assignments/service-user/${serviceUserId}`);
  return data;
}

/**
 * Assign a staff member to a service user until `endsAt` (ISO), or renew an existing link to that
 * date. No body is returned (204).
 */
export async function assignStaff(
  staffId: string,
  serviceUserId: string,
  endsAt: string,
): Promise<void> {
  await api.post('/api/assignments', { staffId, serviceUserId, endsAt });
}

/** Default length of a new or renewed direct assignment, in days. */
export const ASSIGNMENT_DEFAULT_DAYS = 90;

/** A YYYY-MM-DD date `days` from `now` (for the end-date input). */
export function dateInDays(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** End of the given YYYY-MM-DD day (UTC) as an ISO timestamp — what the API stores as `endsAt`. */
export function endOfDayIso(date: string): string {
  return `${date}T23:59:59.000Z`;
}

/** Whole days from `now` until `iso` (negative once past). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.floor((new Date(iso).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** Remove a staff member from a service user's group. No body is returned (204). */
export async function unassignStaff(staffId: string, serviceUserId: string): Promise<void> {
  await api.delete(`/api/assignments/service-user/${serviceUserId}/staff/${staffId}`);
}

/** The staff members assigned to a home (manager view). */
export async function fetchStaffForHome(homeId: string): Promise<User[]> {
  const { data } = await api.get<User[]>(`/api/assignments/home/${homeId}`);
  return data;
}

/** Assign a staff member to a home. No body is returned (204). */
export async function assignStaffToHome(staffId: string, homeId: string): Promise<void> {
  await api.post('/api/assignments/home', { staffId, homeId });
}

/** Remove a staff member from a home. No body is returned (204). */
export async function unassignStaffFromHome(staffId: string, homeId: string): Promise<void> {
  await api.delete(`/api/assignments/home/${homeId}/staff/${staffId}`);
}
