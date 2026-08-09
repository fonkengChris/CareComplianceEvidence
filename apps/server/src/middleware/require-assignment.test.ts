import type { AccessTokenClaims } from '@care/shared';
import { describe, expect, it, mock } from 'bun:test';
import type { NextFunction, Request, Response } from 'express';

/**
 * The guard resolves a plan to its service user and checks the caller's supervision
 * group. Both service dependencies are stubbed via mock.module — no DB. Covers: manager
 * bypass, assigned staff pass, unassigned staff 403, and unknown plan 404.
 */

const weekPlanMock = {
  serviceUserIdForPlan: mock((): Promise<string | null> => Promise.resolve('su-1')),
};
const assignmentMock = {
  isStaffAssigned: mock((): Promise<boolean> => Promise.resolve(true)),
};
mock.module('../services/week-plan.service', () => weekPlanMock);
mock.module('../services/staff-assignment.service', () => assignmentMock);

const { requireAssignment } = await import('./require-assignment');

const staff: AccessTokenClaims = {
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'STAFF',
  email: 'sam@example.com',
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
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

async function run(user: AccessTokenClaims | undefined) {
  const req = { params: { id: 'plan-1' }, user } as unknown as Request;
  const res = mockRes();
  const next = mock(() => {});
  await requireAssignment(req, res, next as unknown as NextFunction);
  return { res, next };
}

describe('requireAssignment', () => {
  it('lets a MANAGER through without an assignment check', async () => {
    const { res, next } = await run({ ...staff, role: 'MANAGER' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(assignmentMock.isStaffAssigned).not.toHaveBeenCalled();
  });

  it('lets an assigned STAFF member through', async () => {
    weekPlanMock.serviceUserIdForPlan.mockResolvedValueOnce('su-1');
    assignmentMock.isStaffAssigned.mockResolvedValueOnce(true);
    const { res, next } = await run(staff);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('403s an unassigned STAFF member', async () => {
    weekPlanMock.serviceUserIdForPlan.mockResolvedValueOnce('su-1');
    assignmentMock.isStaffAssigned.mockResolvedValueOnce(false);
    const { res, next } = await run(staff);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('404s when the plan is unknown', async () => {
    weekPlanMock.serviceUserIdForPlan.mockResolvedValueOnce(null);
    const { res, next } = await run(staff);
    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when there is no authenticated user', async () => {
    const { res, next } = await run(undefined);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
