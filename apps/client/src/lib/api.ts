import type { AuthResponse } from '@care/shared';

/**
 * API client. The access token is held in memory only (never localStorage) so it is
 * not exposed to XSS across reloads; a fresh one is obtained via silent refresh using
 * the httpOnly refresh cookie. `apiFetch` attaches the bearer token and, on a 401,
 * performs a single-flight refresh and retries the request exactly once.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// Shared in-flight refresh so concurrent 401s trigger only one /auth/refresh call.
let refreshInFlight: Promise<AuthResponse | null> | null = null;

/** Attempt to mint a new access token from the refresh cookie. Single-flight. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          accessToken = null;
          return null;
        }
        const data = (await res.json()) as AuthResponse;
        accessToken = data.accessToken;
        return data;
      } catch {
        accessToken = null;
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** fetch wrapper that adds auth + JSON headers and silently refreshes once on 401. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(path, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers ?? {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  const res = await send();
  if (res.status !== 401) return res;

  const refreshed = await refreshSession();
  if (!refreshed) return res;
  return send();
}
