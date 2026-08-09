import { beforeEach, describe, expect, it } from 'bun:test';
import { api, getAccessToken, refreshSession, setAccessToken } from './api';
import { mockApi } from './test-utils';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const authResponse = {
  accessToken: 'new-access-token',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Sam',
    email: 'sam@example.com',
    role: 'STAFF',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
};

beforeEach(() => {
  setAccessToken(null);
});

describe('refreshSession', () => {
  it('stores the new access token on success', async () => {
    mockApi(async () => jsonResponse(authResponse));
    const res = await refreshSession();
    expect(res?.accessToken).toBe('new-access-token');
    expect(getAccessToken()).toBe('new-access-token');
  });

  it('returns null and clears the token when refresh fails', async () => {
    setAccessToken('stale');
    mockApi(async () => new Response(null, { status: 401 }));
    expect(await refreshSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('coalesces concurrent calls into a single request (single-flight)', async () => {
    let calls = 0;
    mockApi(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse(authResponse);
    });

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(calls).toBe(1);
    expect(a?.accessToken).toBe('new-access-token');
    expect(b?.accessToken).toBe('new-access-token');
  });
});

describe('api 401 handling', () => {
  it('refreshes once on 401 and retries the original request', async () => {
    let targetCalls = 0;
    let refreshCalls = 0;
    mockApi(async (url) => {
      if (url === '/api/auth/refresh') {
        refreshCalls++;
        return jsonResponse(authResponse);
      }
      targetCalls++;
      if (targetCalls === 1) return new Response(null, { status: 401 });
      return jsonResponse({ ok: true });
    });

    const res = await api.get('/api/data');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(targetCalls).toBe(2);
    expect(getAccessToken()).toBe('new-access-token');
  });

  it('does not retry when the refresh itself fails', async () => {
    let targetCalls = 0;
    mockApi(async (url) => {
      if (url === '/api/auth/refresh') return new Response(null, { status: 401 });
      targetCalls++;
      return new Response(null, { status: 401 });
    });

    await expect(api.get('/api/data')).rejects.toThrow();
    expect(targetCalls).toBe(1);
  });
});
