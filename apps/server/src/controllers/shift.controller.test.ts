import type { ShiftSession } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import * as realShift from '../services/shift.service';

/**
 * Shift controller tests stub the DB-touching service functions via mock.module (spreading the
 * real module so its pure helpers stay intact for other files). They assert validation 400s,
 * the not-a-member 403, the own-session-only 404 and that the caller's identity and role are
 * what reach the service. Route roles are covered by app.integration.test.
 */

const serviceMock = {
  ...realShift,
  getActiveShift: mock<typeof realShift.getActiveShift>(() => Promise.resolve(null)),
  startShift: mock<typeof realShift.startShift>(() =>
    Promise.resolve({ ok: false, reason: 'not-member' } as const),
  ),
  endShift: mock<typeof realShift.endShift>(() => Promise.resolve('ok' as const)),
  listActiveShiftsForHome: mock<typeof realShift.listActiveShiftsForHome>(() =>
    Promise.resolve([]),
  ),
  listActiveShifts: mock<typeof realShift.listActiveShifts>(() => Promise.resolve([])),
  terminateShift: mock<typeof realShift.terminateShift>(() => Promise.resolve('ok' as const)),
};
mock.module('../services/shift.service', () => serviceMock);

const controller = await import('./shift.controller');

const STAFF = '11111111-1111-4111-8111-111111111111';
const HOME = '33333333-3333-4333-8333-333333333333';
const SHIFT = '55555555-5555-4555-8555-555555555555';

const session: ShiftSession = {
  id: SHIFT,
  staffId: STAFF,
  homeId: HOME,
  homeName: 'Riverside House',
  staffName: 'Sam Staff',
  startedAt: '2026-10-25T08:00:00.000Z',
  expiresAt: '2026-10-25T20:00:00.000Z',
  endedAt: null,
};

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function req(role: string, extra: Record<string, unknown> = {}): Request {
  return {
    user: { sub: STAFF, role },
    params: {},
    query: {},
    body: {},
    ...extra,
  } as unknown as Request;
}

afterEach(() => {
  serviceMock.getActiveShift.mockReset();
  serviceMock.startShift.mockReset();
  serviceMock.endShift.mockReset();
  serviceMock.listActiveShiftsForHome.mockReset();
  serviceMock.listActiveShifts.mockReset();
  serviceMock.terminateShift.mockReset();
});

describe('me', () => {
  it("returns the caller's active shift", async () => {
    serviceMock.getActiveShift.mockResolvedValueOnce(session);
    const res = mockRes();
    await controller.me(req('STAFF'), res);
    expect(serviceMock.getActiveShift).toHaveBeenCalledWith(STAFF);
    expect(res.body).toEqual(session);
  });
});

describe('start', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.start(req('STAFF', { body: { homeId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.startShift).not.toHaveBeenCalled();
  });

  it("403s a home the caller isn't assigned to", async () => {
    serviceMock.startShift.mockResolvedValueOnce({ ok: false, reason: 'not-member' });
    const res = mockRes();
    await controller.start(req('STAFF', { body: { homeId: HOME } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('201s with the new session', async () => {
    serviceMock.startShift.mockResolvedValueOnce({ ok: true, value: session });
    const res = mockRes();
    await controller.start(req('KEY_WORKER', { body: { homeId: HOME } }), res);
    expect(serviceMock.startShift).toHaveBeenCalledWith(STAFF, HOME);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(session);
  });
});

describe('end', () => {
  it("404s a session that isn't the caller's", async () => {
    serviceMock.endShift.mockResolvedValueOnce('not-found');
    const res = mockRes();
    await controller.end(req('STAFF', { params: { id: SHIFT } }), res);
    expect(serviceMock.endShift).toHaveBeenCalledWith(SHIFT, { id: STAFF, isManager: false });
    expect(res.statusCode).toBe(404);
  });

  it('lets a manager end any session', async () => {
    serviceMock.endShift.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.end(req('MANAGER', { params: { id: SHIFT } }), res);
    expect(serviceMock.endShift).toHaveBeenCalledWith(SHIFT, { id: STAFF, isManager: true });
    expect(res.statusCode).toBe(204);
  });
});

describe('listForHome', () => {
  it("returns the home's active sessions", async () => {
    serviceMock.listActiveShiftsForHome.mockResolvedValueOnce([session]);
    const res = mockRes();
    await controller.listForHome(req('MANAGER', { params: { homeId: HOME } }), res);
    expect(serviceMock.listActiveShiftsForHome).toHaveBeenCalledWith(HOME);
    expect(res.body).toEqual([session]);
  });
});

describe('listActive', () => {
  it('lists every active shift when unfiltered', async () => {
    serviceMock.listActiveShifts.mockResolvedValueOnce([session]);
    const res = mockRes();
    await controller.listActive(req('MANAGER'), res);
    expect(serviceMock.listActiveShifts).toHaveBeenCalledWith({});
    expect(res.body).toEqual([session]);
  });

  it('narrows to one home', async () => {
    serviceMock.listActiveShifts.mockResolvedValueOnce([]);
    await controller.listActive(req('MANAGER', { query: { homeId: HOME } }), mockRes());
    expect(serviceMock.listActiveShifts).toHaveBeenCalledWith({ homeId: HOME });
  });

  it('400s a malformed home filter', async () => {
    const res = mockRes();
    await controller.listActive(req('MANAGER', { query: { homeId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.listActiveShifts).not.toHaveBeenCalled();
  });
});

describe('terminate', () => {
  it('ends the shift and signs out, passing the manager and reason', async () => {
    serviceMock.terminateShift.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.terminate(
      req('MANAGER', { params: { id: SHIFT }, body: { reason: ' Not on the rota ' } }),
      res,
    );
    expect(serviceMock.terminateShift).toHaveBeenCalledWith(SHIFT, STAFF, 'Not on the rota');
    expect(res.statusCode).toBe(204);
  });

  it('treats a blank reason as none', async () => {
    serviceMock.terminateShift.mockResolvedValueOnce('ok');
    await controller.terminate(
      req('MANAGER', { params: { id: SHIFT }, body: { reason: '   ' } }),
      mockRes(),
    );
    expect(serviceMock.terminateShift).toHaveBeenCalledWith(SHIFT, STAFF, undefined);
  });

  it('404s an unknown shift and 409s one that already ended', async () => {
    serviceMock.terminateShift.mockResolvedValueOnce('not-found');
    const missing = mockRes();
    await controller.terminate(req('MANAGER', { params: { id: SHIFT } }), missing);
    expect(missing.statusCode).toBe(404);

    serviceMock.terminateShift.mockResolvedValueOnce('already-ended');
    const ended = mockRes();
    await controller.terminate(req('MANAGER', { params: { id: SHIFT } }), ended);
    expect(ended.statusCode).toBe(409);
  });

  it('400s an over-long reason', async () => {
    const res = mockRes();
    await controller.terminate(
      req('MANAGER', { params: { id: SHIFT }, body: { reason: 'x'.repeat(501) } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.terminateShift).not.toHaveBeenCalled();
  });
});
