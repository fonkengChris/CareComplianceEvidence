import type { ServiceUser, User } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for the supervision group (Phase 5). `fetchMyAssignments`
 * powers the staff dashboard (the caller's own service users); the manager helpers drive
 * the assignment section on the service-user detail page. Mirrors the other lib modules.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** The service users the current staff member supervises. */
export async function fetchMyAssignments(): Promise<ServiceUser[]> {
  return unwrap<ServiceUser[]>(await apiFetch('/api/assignments/me'));
}

/** The staff members assigned to a service user (manager view). */
export async function fetchStaffForServiceUser(serviceUserId: string): Promise<User[]> {
  return unwrap<User[]>(
    await apiFetch(`/api/assignments/service-user/${serviceUserId}`),
  );
}

/** Assign a staff member to a service user. No body is returned (204). */
export async function assignStaff(staffId: string, serviceUserId: string): Promise<void> {
  const res = await apiFetch('/api/assignments', {
    method: 'POST',
    body: JSON.stringify({ staffId, serviceUserId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
}

/** Remove a staff member from a service user's group. No body is returned (204). */
export async function unassignStaff(staffId: string, serviceUserId: string): Promise<void> {
  const res = await apiFetch(
    `/api/assignments/service-user/${serviceUserId}/staff/${staffId}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
}
