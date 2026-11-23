import type { AssignedStaff, ServiceUser } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the service layer via mock.module — no DB. They assert the
 * status-code mapping and that `me` reads the caller's id from req.user, plus validation
 * 400s before the service is called. Role enforcement lives in route middleware.
 */

const serviceMock = {
  listAssignmentsForStaff: mock((): Promise<ServiceUser[]> => Promise.resolve([])),
  listStaffForServiceUser: mock((): Promise<AssignedStaff[]> => Promise.resolve([])),
  assign: mock((): Promise<'ok' | 'not-found'> => Promise.resolve('ok')),
  unassign: mock((): Promise<void> => Promise.resolve()),
};
mock.module('../services/staff-assignment.service', () => serviceMock);

const controller = await import('./staff-assignment.controller');

const staffId = '11111111-1111-4111-8111-111111111111';
const serviceUserId = '22222222-2222-4222-8222-222222222222';
const manager = { sub: '99999999-9999-4999-8999-999999999999', role: 'MANAGER' };

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
  serviceMock.listAssignmentsForStaff.mockReset();
  serviceMock.listStaffForServiceUser.mockReset();
  serviceMock.assign.mockReset();
  serviceMock.unassign.mockReset();
});

describe('me', () => {
  it("returns the caller's assigned service users", async () => {
    const rows = [{ id: serviceUserId } as ServiceUser];
    serviceMock.listAssignmentsForStaff.mockResolvedValueOnce(rows);
    const res = mockRes();
    await controller.me({ user: { sub: staffId } } as unknown as Request, res);
    expect(serviceMock.listAssignmentsForStaff).toHaveBeenCalledWith(staffId);
    expect(res.body).toEqual(rows);
  });
});

describe('create', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.create({ body: { staffId: 'nope' } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.assign).not.toHaveBeenCalled();
  });

  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  it('400s without an end date, or with one in the past', async () => {
    const missing = mockRes();
    await controller.create(
      { body: { staffId, serviceUserId }, user: manager } as unknown as Request,
      missing,
    );
    expect(missing.statusCode).toBe(400);

    const past = mockRes();
    await controller.create(
      {
        body: { staffId, serviceUserId, endsAt: '2020-01-01T00:00:00.000Z' },
        user: manager,
      } as unknown as Request,
      past,
    );
    expect(past.statusCode).toBe(400);
    expect(serviceMock.assign).not.toHaveBeenCalled();
  });

  it('204s and assigns until the end date, as the caller', async () => {
    serviceMock.assign.mockResolvedValueOnce('ok');
    const res = mockRes();
    await controller.create(
      { body: { staffId, serviceUserId, endsAt }, user: manager } as unknown as Request,
      res,
    );
    expect(serviceMock.assign).toHaveBeenCalledWith(
      staffId,
      serviceUserId,
      new Date(endsAt),
      manager.sub,
    );
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it('404s an unknown staff member', async () => {
    serviceMock.assign.mockResolvedValueOnce('not-found');
    const res = mockRes();
    await controller.create(
      { body: { staffId, serviceUserId, endsAt }, user: manager } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('remove', () => {
  it('204s and unassigns', async () => {
    const res = mockRes();
    await controller.remove(
      { params: { serviceUserId, staffId }, user: manager } as unknown as Request,
      res,
    );
    expect(serviceMock.unassign).toHaveBeenCalledWith(staffId, serviceUserId, manager.sub);
    expect(res.statusCode).toBe(204);
  });
});
