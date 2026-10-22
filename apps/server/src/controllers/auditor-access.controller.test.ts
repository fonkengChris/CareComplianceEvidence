import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import * as realService from '../services/auditor-access.service';

/**
 * Controller tests stub the DB-touching service functions via mock.module (keeping the real pure
 * helpers so other test files are unaffected) — no DB or bound port. They assert validation 400s,
 * that the acting manager is passed through, and the result → status-code mapping. Role
 * enforcement lives in route middleware (see app.integration.test.ts).
 */

const serviceMock = {
  ...realService,
  approvedServiceUserIds: mock<typeof realService.approvedServiceUserIds>(() =>
    Promise.resolve([]),
  ),
  setAuditorServiceUsers: mock<typeof realService.setAuditorServiceUsers>(() =>
    Promise.resolve('ok'),
  ),
};

mock.module('../services/auditor-access.service', () => serviceMock);

const controller = await import('./auditor-access.controller');

const AUDITOR = '11111111-1111-4111-8111-111111111111';
const MANAGER = '33333333-3333-4333-8333-333333333333';
const SU = '22222222-2222-4222-8222-222222222222';

function mockReq(body: unknown = {}): Request {
  return {
    user: { sub: MANAGER, role: 'MANAGER', email: 'm@example.com' },
    body,
    params: { auditorId: AUDITOR },
    query: {},
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
  serviceMock.approvedServiceUserIds.mockReset();
  serviceMock.setAuditorServiceUsers.mockReset();
});

describe('getServiceUsers', () => {
  it("returns the auditor's assigned service-user ids", async () => {
    serviceMock.approvedServiceUserIds.mockResolvedValueOnce([SU]);
    const res = mockRes();
    await controller.getServiceUsers(mockReq(), res);
    expect(serviceMock.approvedServiceUserIds).toHaveBeenCalledWith(AUDITOR);
    expect(res.body).toEqual({ serviceUserIds: [SU] });
  });
});

describe('setServiceUsers', () => {
  it('400s a malformed body without calling the service', async () => {
    const res = mockRes();
    await controller.setServiceUsers(mockReq({ serviceUserIds: ['not-a-uuid'] }), res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.setAuditorServiceUsers).not.toHaveBeenCalled();
  });

  it('replaces the set as the acting manager → 204', async () => {
    serviceMock.setAuditorServiceUsers.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.setServiceUsers(mockReq({ serviceUserIds: [SU] }), res);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(serviceMock.setAuditorServiceUsers).toHaveBeenCalledWith(AUDITOR, [SU], MANAGER);
  });

  it('maps an unknown user to 404 and a non-auditor to 409', async () => {
    serviceMock.setAuditorServiceUsers.mockResolvedValueOnce('not_found');
    const notFound = mockRes();
    await controller.setServiceUsers(mockReq({ serviceUserIds: [] }), notFound);
    expect(notFound.statusCode).toBe(404);

    serviceMock.setAuditorServiceUsers.mockResolvedValueOnce('not_auditor');
    const notAuditor = mockRes();
    await controller.setServiceUsers(mockReq({ serviceUserIds: [] }), notAuditor);
    expect(notAuditor.statusCode).toBe(409);
  });
});
