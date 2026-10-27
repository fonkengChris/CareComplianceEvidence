import type { AccessTokenClaims, Role } from '@care/shared';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from './app';
import { signAccessToken } from './auth/tokens';
import { client } from './db';

/**
 * Route-level role enforcement (Phase 10). Unlike the controller tests, this mounts the
 * *real* Express `app` — every router with its actual middleware chain — and drives it
 * over HTTP, proving the guards are wired onto the right routes in the right order.
 *
 * It deliberately asserts only the rejection paths (401/403). Those short-circuit in the
 * auth/role middleware before any controller or database call, so the test needs no DB
 * and — crucially — no service mocks: mocking a whole service module here would leak into
 * that service's own unit tests in the same `bun test` run. AUDITOR's *positive* report
 * access (scoped to approved service users) is covered by the report controller test and the
 * client page tests.
 *
 * Requests use node:http rather than global fetch because the suite preloads happy-dom,
 * whose fetch enforces a same-origin policy that blocks a localhost request. The ephemeral
 * `app.listen(0)` bind is transient (unlike a long-running dev server) so it is fine here.
 */

const PLAN = 'plan-1';
const ENTRY = 'entry-1';
const SERVICE_USER = '22222222-2222-4222-8222-222222222222';

async function tokenFor(role: Role): Promise<string> {
  const claims: AccessTokenClaims = {
    sub: '99999999-9999-4999-8999-999999999999',
    role,
    email: `${role.toLowerCase()}@example.com`,
  };
  return signAccessToken(claims);
}

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await client.end({ timeout: 1 }).catch(() => {});
});

/** Fire one request over node:http and resolve its status code. */
function request(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(data ? { 'content-type': 'application/json' } : {}),
        },
      },
      (res) => {
        res.resume(); // drain so the socket frees
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('AUDITOR is blocked (403) from every write route', () => {
  it('403s on service-user, week-plan, recording, compliance and assignment writes', async () => {
    const token = await tokenFor('AUDITOR');
    expect(await request('POST', '/api/service-users', { token, body: {} })).toBe(403);
    expect(await request('PUT', `/api/service-users/${SERVICE_USER}`, { token, body: {} })).toBe(
      403,
    );
    expect(
      await request('PATCH', `/api/service-users/${SERVICE_USER}/active`, { token, body: {} }),
    ).toBe(403);
    expect(await request('DELETE', `/api/service-users/${SERVICE_USER}`, { token })).toBe(403);
    expect(await request('POST', '/api/week-plans', { token, body: {} })).toBe(403);
    expect(await request('PUT', `/api/week-plans/${PLAN}`, { token, body: {} })).toBe(403);
    expect(await request('POST', `/api/week-plans/${PLAN}/duplicate`, { token, body: {} })).toBe(
      403,
    );
    expect(
      await request('PATCH', `/api/week-plans/${PLAN}/day-entries/${ENTRY}/record`, {
        token,
        body: {},
      }),
    ).toBe(403);
    expect(await request('POST', `/api/week-plans/${PLAN}/day-entries`, { token, body: {} })).toBe(
      403,
    );
    expect(await request('PUT', '/api/compliance-settings', { token, body: {} })).toBe(403);
    expect(await request('POST', '/api/assignments', { token, body: {} })).toBe(403);
  });
});

describe('AUDITOR is confined to reports (403 on every other read)', () => {
  it('403s on the weekly summary, audit history, records, homes and settings', async () => {
    const token = await tokenFor('AUDITOR');
    expect(await request('GET', '/api/summary', { token })).toBe(403);
    expect(await request('GET', '/api/audit-logs', { token })).toBe(403);
    expect(await request('GET', '/api/service-users', { token })).toBe(403);
    expect(await request('GET', `/api/service-users/${SERVICE_USER}`, { token })).toBe(403);
    expect(await request('GET', '/api/homes', { token })).toBe(403);
    expect(await request('GET', '/api/week-plans', { token })).toBe(403);
    expect(await request('GET', `/api/week-plans/${PLAN}`, { token })).toBe(403);
    expect(await request('GET', '/api/compliance-settings', { token })).toBe(403);
    expect(await request('GET', '/api/activity-types', { token })).toBe(403);
  });

  it('cannot list service users or read/set audit assignments (GDPR)', async () => {
    const token = await tokenFor('AUDITOR');
    // The old self-service request endpoints are gone — nothing lists service users to an auditor.
    expect(await request('GET', '/api/auditor-access/service-users', { token })).toBe(404);
    expect(await request('GET', '/api/auditor-access/me', { token })).toBe(404);
    expect(await request('POST', '/api/auditor-access', { token, body: {} })).toBe(404);
    expect(await request('GET', `/api/auditor-access/auditors/${SERVICE_USER}`, { token })).toBe(
      403,
    );
    expect(
      await request('PUT', `/api/auditor-access/auditors/${SERVICE_USER}`, { token, body: {} }),
    ).toBe(403);
  });
});

describe('only MANAGERs assign service users to auditors', () => {
  it('403s STAFF and KEY_WORKER', async () => {
    for (const role of ['STAFF', 'KEY_WORKER'] as const) {
      const token = await tokenFor(role);
      expect(await request('GET', `/api/auditor-access/auditors/${SERVICE_USER}`, { token })).toBe(
        403,
      );
      expect(
        await request('PUT', `/api/auditor-access/auditors/${SERVICE_USER}`, { token, body: {} }),
      ).toBe(403);
    }
  });
});

describe('STAFF cannot reach manager/auditor-only routes', () => {
  it('403s on summary, audit, user management, and management writes', async () => {
    const token = await tokenFor('STAFF');
    expect(await request('GET', '/api/summary', { token })).toBe(403);
    expect(await request('GET', '/api/summary/period', { token })).toBe(403);
    expect(await request('GET', `/api/service-users/${SERVICE_USER}/report`, { token })).toBe(403);
    expect(await request('GET', '/api/audit-logs', { token })).toBe(403);
    expect(await request('GET', '/api/users', { token })).toBe(403);
    expect(await request('DELETE', `/api/users/${SERVICE_USER}`, { token })).toBe(403);
    expect(await request('POST', '/api/service-users', { token, body: {} })).toBe(403);
    expect(await request('DELETE', `/api/service-users/${SERVICE_USER}`, { token })).toBe(403);
    expect(
      await request('DELETE', '/api/homes/33333333-3333-4333-8333-333333333333', { token }),
    ).toBe(403);
    expect(await request('PUT', '/api/compliance-settings', { token, body: {} })).toBe(403);
  });
});

describe('shift routes are role-scoped', () => {
  it('403s AUDITOR on every shift route and MANAGER on starting one', async () => {
    const auditor = await tokenFor('AUDITOR');
    expect(await request('GET', '/api/shifts/me', { token: auditor })).toBe(403);
    expect(await request('POST', '/api/shifts', { token: auditor, body: {} })).toBe(403);
    expect(await request('POST', `/api/shifts/${SERVICE_USER}/end`, { token: auditor })).toBe(403);
    expect(await request('GET', `/api/shifts/home/${SERVICE_USER}`, { token: auditor })).toBe(403);
    const manager = await tokenFor('MANAGER');
    expect(await request('POST', '/api/shifts', { token: manager, body: {} })).toBe(403);
  });

  it('403s everyone but MANAGER on the shift monitor and forced sign-out', async () => {
    for (const role of ['STAFF', 'KEY_WORKER', 'AUDITOR'] as const) {
      const token = await tokenFor(role);
      expect(await request('GET', `/api/shifts/home/${SERVICE_USER}`, { token })).toBe(403);
      expect(await request('GET', '/api/shifts/active', { token })).toBe(403);
      expect(
        await request('POST', `/api/shifts/${SERVICE_USER}/terminate`, { token, body: {} }),
      ).toBe(403);
    }
  });
});

describe('unauthenticated requests are rejected', () => {
  it('401s a protected route with no token', async () => {
    expect(await request('GET', '/api/service-users')).toBe(401);
    expect(await request('GET', '/api/summary')).toBe(401);
    expect(await request('GET', '/api/audit-logs')).toBe(401);
    expect(await request('PUT', '/api/auth/me', { body: {} })).toBe(401);
    expect(await request('PUT', '/api/auth/me/password', { body: {} })).toBe(401);
    expect(await request('GET', '/api/shifts/me')).toBe(401);
    expect(await request('POST', '/api/shifts', { body: {} })).toBe(401);
  });
});
