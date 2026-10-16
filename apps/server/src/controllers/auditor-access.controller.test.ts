import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import * as realService from '../services/auditor-access.service';

/**
 * Controller tests stub the DB-touching service functions via mock.module (keeping the real pure
 * helpers so other test files are unaffected) — no DB or bound port. They assert validation 400s,
 * that the caller's id is what gets scoped, and the transition → status-code mapping. Role
 * enforcement lives in route middleware (see app.integration.test.ts).
 */

const serviceMock = {
  ...realService,
  listRequestable: mock<typeof realService.listRequestable>(() => Promise.resolve([])),
  listForAuditor: mock<typeof realService.listForAuditor>(() => Promise.resolve([])),
  listForManager: mock<typeof realService.listForManager>(() => Promise.resolve([])),
  createRequests: mock<typeof realService.createRequests>(() => Promise.resolve(0)),
  transition: mock<typeof realService.transition>(() => Promise.resolve('ok')),
};

mock.module('../services/auditor-access.service', () => serviceMock);

const controller = await import('./auditor-access.controller');

const AUDITOR = '11111111-1111-4111-8111-111111111111';
const MANAGER = '33333333-3333-4333-8333-333333333333';
const SU = '22222222-2222-4222-8222-222222222222';
const REQ = '44444444-4444-4444-8444-444444444444';

function mockReq(opts: {
  sub: string;
  role: 'AUDITOR' | 'MANAGER';
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}): Request {
  return {
    user: { sub: opts.sub, role: opts.role, email: 'x@example.com' },
    body: opts.body ?? {},
    params: opts.params ?? {},
    query: opts.query ?? {},
  } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; ended: boolean };
}

afterEach(() => {
  serviceMock.createRequests.mockReset();
  serviceMock.listForManager.mockReset();
  serviceMock.transition.mockReset();
});

describe('create', () => {
  it('400s an empty selection without calling the service', async () => {
    const res = mockRes();
    await controller.create(
      mockReq({ sub: AUDITOR, role: 'AUDITOR', body: { serviceUserIds: [] } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.createRequests).not.toHaveBeenCalled();
  });

  it('creates requests for the calling auditor and returns the count', async () => {
    serviceMock.createRequests.mockResolvedValueOnce(1);
    const res = mockRes();
    await controller.create(
      mockReq({
        sub: AUDITOR,
        role: 'AUDITOR',
        body: { serviceUserIds: [SU], reason: 'Quarterly audit' },
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ created: 1 });
    expect(serviceMock.createRequests).toHaveBeenCalledWith(AUDITOR, [SU], 'Quarterly audit');
  });
});

describe('list', () => {
  it('400s an unknown status filter', async () => {
    const res = mockRes();
    await controller.list(
      mockReq({ sub: MANAGER, role: 'MANAGER', query: { status: 'NOPE' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('passes a valid status filter through', async () => {
    serviceMock.listForManager.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.list(
      mockReq({ sub: MANAGER, role: 'MANAGER', query: { status: 'PENDING' } }),
      res,
    );
    expect(serviceMock.listForManager).toHaveBeenCalledWith('PENDING');
  });
});

describe('decisions', () => {
  it('approves as the calling manager → 204', async () => {
    serviceMock.transition.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.approve(mockReq({ sub: MANAGER, role: 'MANAGER', params: { id: REQ } }), res);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(serviceMock.transition).toHaveBeenCalledWith(REQ, 'APPROVE', MANAGER);
  });

  it('maps an unknown request to 404 and a disallowed transition to 409', async () => {
    serviceMock.transition.mockResolvedValueOnce('not_found');
    const notFound = mockRes();
    await controller.reject(
      mockReq({ sub: MANAGER, role: 'MANAGER', params: { id: REQ } }),
      notFound,
    );
    expect(notFound.statusCode).toBe(404);

    serviceMock.transition.mockResolvedValueOnce('invalid');
    const invalid = mockRes();
    await controller.revoke(
      mockReq({ sub: MANAGER, role: 'MANAGER', params: { id: REQ } }),
      invalid,
    );
    expect(invalid.statusCode).toBe(409);
  });

  it('scopes a withdrawal to the calling auditor', async () => {
    serviceMock.transition.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.withdraw(mockReq({ sub: AUDITOR, role: 'AUDITOR', params: { id: REQ } }), res);
    expect(res.statusCode).toBe(204);
    expect(serviceMock.transition).toHaveBeenCalledWith(REQ, 'WITHDRAW', AUDITOR, AUDITOR);
  });
});
