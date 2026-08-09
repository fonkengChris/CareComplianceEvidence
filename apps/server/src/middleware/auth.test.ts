import type { AccessTokenClaims } from '@care/shared';
import { describe, expect, it, mock } from 'bun:test';
import type { NextFunction, Request, Response } from 'express';
import { signAccessToken } from '../auth/tokens';
import { requireAuth, requireRole } from './auth';

const claims: AccessTokenClaims = {
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'STAFF',
  email: 'sam@example.com',
};

/** Minimal Express res double capturing status + json. */
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

describe('requireAuth', () => {
  it('401s when the Authorization header is missing', async () => {
    const res = mockRes();
    const next = mock(() => {});
    await requireAuth({ headers: {} } as Request, res, next as unknown as NextFunction);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s on an invalid token', async () => {
    const res = mockRes();
    const next = mock(() => {});
    await requireAuth(
      { headers: { authorization: 'Bearer not.a.jwt' } } as Request,
      res,
      next as unknown as NextFunction,
    );
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next on a valid token', async () => {
    const token = await signAccessToken(claims);
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = mock(() => {});
    await requireAuth(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(claims);
  });
});

describe('requireRole', () => {
  function run(userRole: AccessTokenClaims['role'] | undefined, allowed: AccessTokenClaims['role'][]) {
    const req = (userRole ? { user: { ...claims, role: userRole } } : {}) as Request;
    const res = mockRes();
    const next = mock(() => {});
    requireRole(...allowed)(req, res, next as unknown as NextFunction);
    return { res, next };
  }

  it('calls next when the role is allowed', () => {
    const { res, next } = run('MANAGER', ['MANAGER']);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('403s when the role is not allowed', () => {
    const { res, next } = run('STAFF', ['MANAGER']);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets an auditor into a MANAGER/AUDITOR read guard', () => {
    const { res, next } = run('AUDITOR', ['MANAGER', 'AUDITOR']);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('403s an auditor on a manager-only write guard', () => {
    const { res, next } = run('AUDITOR', ['MANAGER']);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when there is no authenticated user', () => {
    const { res, next } = run(undefined, ['MANAGER']);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
