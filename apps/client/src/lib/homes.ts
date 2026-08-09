import type { Home, HomeCreate, HomeUpdate, ServiceUser } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the home API (MANAGER writes; reads open
 * to any authenticated role). Mirrors the service-users lib pattern: non-2xx responses reject
 * with the server's error message so React Query moves to its error state.
 */

export type ActiveFilter = 'all' | 'active' | 'inactive';

export async function fetchHomes(filter: ActiveFilter = 'all'): Promise<Home[]> {
  const query = filter === 'all' ? '' : `?active=${filter === 'active'}`;
  const { data } = await api.get<Home[]>(`/api/homes${query}`);
  return data;
}

export async function fetchHome(id: string): Promise<Home> {
  const { data } = await api.get<Home>(`/api/homes/${id}`);
  return data;
}

export async function fetchHomeServiceUsers(id: string): Promise<ServiceUser[]> {
  const { data } = await api.get<ServiceUser[]>(`/api/homes/${id}/service-users`);
  return data;
}

export async function createHome(input: HomeCreate): Promise<Home> {
  const { data } = await api.post<Home>('/api/homes', input);
  return data;
}

export async function updateHome(id: string, input: HomeUpdate): Promise<Home> {
  const { data } = await api.put<Home>(`/api/homes/${id}`, input);
  return data;
}

export async function setHomeActive(id: string, active: boolean): Promise<Home> {
  const { data } = await api.patch<Home>(`/api/homes/${id}/active`, { active });
  return data;
}
