import type { CheckInDisplayCode, HomeDisplay } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import * as realDisplay from '../services/home-display.service';

/**
 * Check-in display controller tests stub the DB-touching service functions via mock.module
 * (spreading the real module so `toPublicDisplay` stays intact). They pin the 400/404 mapping,
 * that the manager is the recorded actor, and that the code endpoint authenticates by the
 * display token header only. Route roles are covered by app.integration.test.
 */

const serviceMock = {
  ...realDisplay,
  pairDisplay: mock<typeof realDisplay.pairDisplay>(() => Promise.resolve(null)),
  listDisplays: mock<typeof realDisplay.listDisplays>(() => Promise.resolve([])),
  revokeDisplay: mock<typeof realDisplay.revokeDisplay>(() => Promise.resolve('ok' as const)),
  codeForDisplayToken: mock<typeof realDisplay.codeForDisplayToken>(() => Promise.resolve(null)),
};
mock.module('../services/home-display.service', () => serviceMock);

const controller = await import('./home-display.controller');

const HOME = '33333333-3333-4333-8333-333333333333';
const DISPLAY = '44444444-4444-4444-8444-444444444444';
const MANAGER = '99999999-9999-4999-8999-999999999999';

const display: HomeDisplay = {
  id: DISPLAY,
  homeId: HOME,
  name: 'Office tablet',
  createdAt: '2026-11-23T09:00:00.000Z',
  lastSeenAt: null,
  revokedAt: null,
};

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

function req(extra: Record<string, unknown> = {}): Request {
  return {
    user: { sub: MANAGER, role: 'MANAGER' },
    params: { id: HOME, displayId: DISPLAY },
    body: {},
    get: () => undefined,
    ...extra,
  } as unknown as Request;
}

afterEach(() => {
  serviceMock.pairDisplay.mockReset();
  serviceMock.listDisplays.mockReset();
  serviceMock.revokeDisplay.mockReset();
  serviceMock.codeForDisplayToken.mockReset();
});

describe('pair', () => {
  it('400s without a name', async () => {
    const res = mockRes();
    await controller.pair(req({ body: { name: '  ' } }), res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.pairDisplay).not.toHaveBeenCalled();
  });

  it('201s with the display and its one-time token, as the manager', async () => {
    serviceMock.pairDisplay.mockResolvedValueOnce({ display, token: 'raw-token' });
    const res = mockRes();
    await controller.pair(req({ body: { name: ' Office tablet ' } }), res);
    expect(serviceMock.pairDisplay).toHaveBeenCalledWith(HOME, 'Office tablet', MANAGER);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ display, token: 'raw-token' });
  });

  it('404s an unknown home', async () => {
    serviceMock.pairDisplay.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.pair(req({ body: { name: 'Office tablet' } }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('list', () => {
  it("returns the home's displays", async () => {
    serviceMock.listDisplays.mockResolvedValueOnce([display]);
    const res = mockRes();
    await controller.list(req(), res);
    expect(serviceMock.listDisplays).toHaveBeenCalledWith(HOME);
    expect(res.body).toEqual([display]);
  });
});

describe('revoke', () => {
  it('204s and records the manager as actor', async () => {
    serviceMock.revokeDisplay.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.revoke(req(), res);
    expect(serviceMock.revokeDisplay).toHaveBeenCalledWith(HOME, DISPLAY, MANAGER);
    expect(res.statusCode).toBe(204);
  });

  it('404s a display that is not on this home', async () => {
    serviceMock.revokeDisplay.mockResolvedValueOnce('not-found');
    const res = mockRes();
    await controller.revoke(req(), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('code', () => {
  const current: CheckInDisplayCode = {
    homeId: HOME,
    homeName: 'Riverside House',
    code: '123456',
    expiresAt: '2026-11-23T09:01:00.000Z',
  };

  it('401s without a display token, never touching the service', async () => {
    const res = mockRes();
    await controller.code(req(), res);
    expect(res.statusCode).toBe(401);
    expect(serviceMock.codeForDisplayToken).not.toHaveBeenCalled();
  });

  it('401s an unknown or revoked token', async () => {
    serviceMock.codeForDisplayToken.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.code(req({ get: () => 'stale' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns the current code, uncached', async () => {
    serviceMock.codeForDisplayToken.mockResolvedValueOnce(current);
    const res = mockRes();
    await controller.code(
      req({ get: (h: string) => (h === 'X-Display-Token' ? ' tok ' : undefined) }),
      res,
    );
    expect(serviceMock.codeForDisplayToken).toHaveBeenCalledWith('tok');
    expect(res.body).toEqual(current);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
