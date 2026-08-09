import type { User, UserCreate } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for user management (MANAGER-only). Listing is GET
 * /users; creation reuses the auth register endpoint (POST /auth/register), which
 * hashes the password server-side and does not log the new user in. Mirrors the
 * service-users lib pattern.
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

export async function createUser(input: UserCreate): Promise<User> {
  return unwrap<User>(
    await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  );
}
