import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { apiFetch, getAccessToken, refreshSession, setAccessToken } from './api';

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
    globalThis.fetch = mock(async () => jsonResponse(authResponse)) as unknown as typeof fetch;
    const res = await refreshSession();
    expect(res?.accessToken).toBe('new-access-token');
    expect(getAccessToken()).toBe('new-access-token');
  });

  it('returns null and clears the token when refresh fails', async () => {
    setAccessToken('stale');
    globalThis.fetch = mock(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch;
    expect(await refreshSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('coalesces concurrent calls into a single request (single-flight)', async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse(authResponse);
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(calls).toBe(1);
    expect(a?.accessToken).toBe('new-access-token');
    expect(b?.accessToken).toBe('new-access-token');
  });
});

describe('apiFetch', () => {
  it('refreshes once on 401 and retries the original request', async () => {
    let targetCalls = 0;
    let refreshCalls = 0;
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls++;
        return jsonResponse(authResponse);
      }
      targetCalls++;
      if (targetCalls === 1) return new Response(null, { status: 401 });
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const res = await apiFetch('/api/data');
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(targetCalls).toBe(2);
    expect(getAccessToken()).toBe('new-access-token');
  });

  it('does not retry when the refresh itself fails', async () => {
    let targetCalls = 0;
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return new Response(null, { status: 401 });
      targetCalls++;
      return new Response(null, { status: 401 });
    }) as unknown as typeof fetch;

    const res = await apiFetch('/api/data');
    expect(res.status).toBe(401);
    expect(targetCalls).toBe(1);
  });
});
