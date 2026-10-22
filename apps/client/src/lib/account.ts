import type { AuthResponse, PasswordChange, ProfileUpdate, User } from '@care/shared';
import { api, setAccessToken } from './api';

/**
 * Self-service account helpers (any role). Both target the signed-in user via the token —
 * there is no id in the path. A password change rotates the session server-side, so the
 * fresh access token is stored here before the caller sees the result.
 */

export async function updateProfile(input: ProfileUpdate): Promise<User> {
  const { data } = await api.put<User>('/api/auth/me', input);
  return data;
}

export async function changePassword(input: PasswordChange): Promise<User> {
  const { data } = await api.put<AuthResponse>('/api/auth/me/password', input);
  setAccessToken(data.accessToken);
  return data.user;
}
