import type { ServiceUser, User } from '@care/shared';
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

/** The staff members assigned to a service user (manager view). */
export async function fetchStaffForServiceUser(serviceUserId: string): Promise<User[]> {
  const { data } = await api.get<User[]>(`/api/assignments/service-user/${serviceUserId}`);
  return data;
}

/** Assign a staff member to a service user. No body is returned (204). */
export async function assignStaff(staffId: string, serviceUserId: string): Promise<void> {
  await api.post('/api/assignments', { staffId, serviceUserId });
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
