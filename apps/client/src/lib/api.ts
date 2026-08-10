import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from '@care/shared';

/**
 * API client (axios). The access token is held in memory only (never localStorage) so it
 * is not exposed to XSS across reloads; a fresh one is obtained via silent refresh using
 * the httpOnly refresh cookie. A request interceptor attaches the bearer token and a
 * response interceptor performs a single-flight refresh + one retry on a 401, then
 * normalises errors so callers reject with the server's message.
 *
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Shared axios instance. `withCredentials` sends the httpOnly refresh cookie. */
export const api = axios.create({ withCredentials: true });

/** Turn an axios failure into a plain Error carrying the server's message where present. */
function normalizeError(error: AxiosError): Error {
  const body = error.response?.data as { error?: string } | undefined;
  if (body?.error) return new Error(body.error);
  if (error.response) return new Error(`Request failed (${error.response.status})`);
  return new Error(error.message || 'Request failed');
}

// Attach the bearer token (when present) to every outgoing request.
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('authorization', `Bearer ${accessToken}`);
  return config;
});

// Shared in-flight refresh so concurrent 401s trigger only one /auth/refresh call.
let refreshInFlight: Promise<AuthResponse | null> | null = null;

/** Attempt to mint a new access token from the refresh cookie. Single-flight. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await api.post<AuthResponse>('/api/auth/refresh');
        accessToken = res.data.accessToken;
        return res.data;
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

// On a 401 for a non-auth request, refresh once and retry the original request.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as
      (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    // Skip the refresh call itself to avoid an infinite loop; every other 401 gets one
    // silent refresh + retry.
    const isRefreshCall = config?.url === '/api/auth/refresh';

    if (error.response?.status === 401 && config && !config._retried && !isRefreshCall) {
      config._retried = true;
      const refreshed = await refreshSession();
      if (refreshed) return api.request(config);
    }
    return Promise.reject(normalizeError(error));
  },
);
