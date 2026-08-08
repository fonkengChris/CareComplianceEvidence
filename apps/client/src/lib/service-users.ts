import type { ServiceUser, ServiceUserCreate, ServiceUserUpdate } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for the service-user API. These are the functions the
 * TanStack Query hooks call; apiFetch attaches the bearer token and silently refreshes
 * on a 401. Errors surface as thrown Errors so React Query can move to its error state.
 */

export type ActiveFilter = 'all' | 'active' | 'inactive';

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchServiceUsers(filter: ActiveFilter = 'all'): Promise<ServiceUser[]> {
  const query = filter === 'all' ? '' : `?active=${filter === 'active'}`;
  return unwrap<ServiceUser[]>(await apiFetch(`/api/service-users${query}`));
}

export async function fetchServiceUser(id: string): Promise<ServiceUser> {
  return unwrap<ServiceUser>(await apiFetch(`/api/service-users/${id}`));
}

export async function createServiceUser(input: ServiceUserCreate): Promise<ServiceUser> {
  return unwrap<ServiceUser>(
    await apiFetch('/api/service-users', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function updateServiceUser(
  id: string,
  input: ServiceUserUpdate,
): Promise<ServiceUser> {
  return unwrap<ServiceUser>(
    await apiFetch(`/api/service-users/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  );
}

export async function setServiceUserActive(id: string, active: boolean): Promise<ServiceUser> {
  return unwrap<ServiceUser>(
    await apiFetch(`/api/service-users/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  );
}
