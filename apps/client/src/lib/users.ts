import type { User, UserCreate, UserUpdate } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for user management (MANAGER-only). Listing is GET
 * /users; creation reuses the auth register endpoint (POST /auth/register), which
 * hashes the password server-side and does not log the new user in; editing is
 * PUT /users/:id. Mirrors the service-users lib pattern.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchUsers(): Promise<User[]> {
  return unwrap<User[]>(await apiFetch('/api/users'));
}

export async function fetchUser(id: string): Promise<User> {
  return unwrap<User>(await apiFetch(`/api/users/${id}`));
}

export async function createUser(input: UserCreate): Promise<User> {
  return unwrap<User>(
    await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function updateUser(id: string, input: UserUpdate): Promise<User> {
  return unwrap<User>(
    await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  );
}
