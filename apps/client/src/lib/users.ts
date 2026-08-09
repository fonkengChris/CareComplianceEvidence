import type { User, UserCreate, UserUpdate } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for user management (MANAGER-only). Listing is
 * GET /users; creation reuses the auth register endpoint (POST /auth/register), which hashes
 * the password server-side and does not log the new user in; editing is PUT /users/:id.
 * Mirrors the service-users lib pattern.
 */

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/api/users');
  return data;
}

export async function fetchUser(id: string): Promise<User> {
  const { data } = await api.get<User>(`/api/users/${id}`);
  return data;
}

export async function createUser(input: UserCreate): Promise<User> {
  const { data } = await api.post<User>('/api/auth/register', input);
  return data;
}

export async function updateUser(id: string, input: UserUpdate): Promise<User> {
  const { data } = await api.put<User>(`/api/users/${id}`, input);
  return data;
}
