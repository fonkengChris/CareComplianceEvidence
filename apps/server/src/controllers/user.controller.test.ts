import type { User } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller test stubs the service via mock.module — no DB or bound port. Role
 * enforcement lives in middleware; this only checks the read passes rows through.
 */

const serviceMock = {
  listUsers: mock((): Promise<User[]> => Promise.resolve([])),
};

mock.module('../services/user.service', () => serviceMock);

const controller = await import('./user.controller');

const sample: User = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Morgan Manager',
  email: 'manager@example.com',
  role: 'MANAGER',
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
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

afterEach(() => {
  serviceMock.listUsers.mockReset();
});

describe('list', () => {
  it('returns the users from the service', async () => {
    serviceMock.listUsers.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list({} as unknown as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([sample]);
  });
});
