import type { ServiceUser, User } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the service layer via mock.module — no DB. They assert the
 * status-code mapping and that `me` reads the caller's id from req.user, plus validation
 * 400s before the service is called. Role enforcement lives in route middleware.
 */

const serviceMock = {
  listAssignmentsForStaff: mock((): Promise<ServiceUser[]> => Promise.resolve([])),
  listStaffForServiceUser: mock((): Promise<User[]> => Promise.resolve([])),
  assign: mock((): Promise<void> => Promise.resolve()),
  unassign: mock((): Promise<void> => Promise.resolve()),
};
mock.module('../services/staff-assignment.service', () => serviceMock);

const controller = await import('./staff-assignment.controller');

const staffId = '11111111-1111-4111-8111-111111111111';
const serviceUserId = '22222222-2222-4222-8222-222222222222';

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

  it('204s and assigns on a valid body', async () => {
    const res = mockRes();
    await controller.create({ body: { staffId, serviceUserId } } as unknown as Request, res);
    expect(serviceMock.assign).toHaveBeenCalledWith(staffId, serviceUserId);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });
});

describe('remove', () => {
  it('204s and unassigns', async () => {
    const res = mockRes();
    await controller.remove(
      { params: { serviceUserId, staffId } } as unknown as Request,
      res,
    );
    expect(serviceMock.unassign).toHaveBeenCalledWith(staffId, serviceUserId);
    expect(res.statusCode).toBe(204);
  });
});
