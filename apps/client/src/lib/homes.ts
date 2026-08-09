import type { Home, HomeCreate, HomeUpdate, ServiceUser } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for the home API (MANAGER writes; reads open to any
 * authenticated role). Mirrors the service-users lib pattern: errors surface as thrown
 * Errors so React Query moves to its error state.
 */

export type ActiveFilter = 'all' | 'active' | 'inactive';

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHomes(filter: ActiveFilter = 'all'): Promise<Home[]> {
  const query = filter === 'all' ? '' : `?active=${filter === 'active'}`;
  return unwrap<Home[]>(await apiFetch(`/api/homes${query}`));
}

export async function fetchHome(id: string): Promise<Home> {
  return unwrap<Home>(await apiFetch(`/api/homes/${id}`));
}

export async function fetchHomeServiceUsers(id: string): Promise<ServiceUser[]> {
  return unwrap<ServiceUser[]>(await apiFetch(`/api/homes/${id}/service-users`));
}

export async function createHome(input: HomeCreate): Promise<Home> {
  return unwrap<Home>(
    await apiFetch('/api/homes', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function updateHome(id: string, input: HomeUpdate): Promise<Home> {
  return unwrap<Home>(
    await apiFetch(`/api/homes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  );
}

export async function setHomeActive(id: string, active: boolean): Promise<Home> {
  return unwrap<Home>(
    await apiFetch(`/api/homes/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  );
}
