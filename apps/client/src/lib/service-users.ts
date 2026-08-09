import type { ServiceUser, ServiceUserCreate, ServiceUserUpdate } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the service-user API. These are the
 * functions the TanStack Query hooks call; the instance attaches the bearer token and
 * silently refreshes on a 401. Non-2xx responses reject with the server's error message
 * so React Query can move to its error state.
 */

export type ActiveFilter = 'all' | 'active' | 'inactive';

export async function fetchServiceUsers(filter: ActiveFilter = 'all'): Promise<ServiceUser[]> {
  const query = filter === 'all' ? '' : `?active=${filter === 'active'}`;
  const { data } = await api.get<ServiceUser[]>(`/api/service-users${query}`);
  return data;
}

export async function fetchServiceUser(id: string): Promise<ServiceUser> {
  const { data } = await api.get<ServiceUser>(`/api/service-users/${id}`);
  return data;
}

export async function createServiceUser(input: ServiceUserCreate): Promise<ServiceUser> {
  const { data } = await api.post<ServiceUser>('/api/service-users', input);
  return data;
}

export async function updateServiceUser(
  id: string,
  input: ServiceUserUpdate,
): Promise<ServiceUser> {
  const { data } = await api.put<ServiceUser>(`/api/service-users/${id}`, input);
  return data;
}

export async function setServiceUserActive(id: string, active: boolean): Promise<ServiceUser> {
  const { data } = await api.patch<ServiceUser>(`/api/service-users/${id}/active`, { active });
  return data;
}
