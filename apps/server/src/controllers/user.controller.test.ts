import type { User } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import type { DeleteUserResult, UpdateUserResult } from '../services/user.service';

/**
 * Controller test stubs the service via mock.module — no DB or bound port. Role
 * enforcement lives in middleware; this checks the read passes rows through and the
 * edit maps the service's typed result to the right status code.
 */

const serviceMock = {
  listUsers: mock((): Promise<User[]> => Promise.resolve([])),
  getUser: mock((): Promise<User | null> => Promise.resolve(null)),
  updateUser: mock((): Promise<UpdateUserResult> => Promise.resolve({ ok: true, value: sample })),
  deleteUser: mock((): Promise<DeleteUserResult> => Promise.resolve('deleted')),
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
    end() {
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

afterEach(() => {
  serviceMock.listUsers.mockReset();
  serviceMock.getUser.mockReset();
  serviceMock.updateUser.mockReset();
  serviceMock.deleteUser.mockReset();
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

describe('getById', () => {
  it('404s when the user does not exist', async () => {
    serviceMock.getUser.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.getById({ params: { id: sample.id } } as unknown as Request, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the user when found', async () => {
    serviceMock.getUser.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.getById({ params: { id: sample.id } } as unknown as Request, res);
    expect(res.body).toEqual(sample);
  });
});

describe('update', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { email: 'not-an-email' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.updateUser).not.toHaveBeenCalled();
  });

  it('404s when the id is unknown', async () => {
    serviceMock.updateUser.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { name: 'New name' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('409s on a duplicate email', async () => {
    serviceMock.updateUser.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { email: 'taken@example.com' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('200s with the updated user', async () => {
    serviceMock.updateUser.mockResolvedValueOnce({ ok: true, value: sample });
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { name: 'Morgan Manager' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sample);
  });
});

describe('remove', () => {
  const caller = { sub: '99999999-9999-4999-8999-999999999999', role: 'MANAGER' as const };
  const req = (id: string) => ({ params: { id }, user: caller }) as unknown as Request;

  it('204s when the user is deleted', async () => {
    serviceMock.deleteUser.mockResolvedValueOnce('deleted');
    const res = mockRes();
    await controller.remove(req(sample.id), res);
    expect(serviceMock.deleteUser).toHaveBeenCalledWith(sample.id);
    expect(res.statusCode).toBe(204);
  });

  it('400s when a manager tries to delete themselves', async () => {
    const res = mockRes();
    await controller.remove(req(caller.sub), res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.deleteUser).not.toHaveBeenCalled();
  });

  it('404s for an unknown user', async () => {
    serviceMock.deleteUser.mockResolvedValueOnce('not-found');
    const res = mockRes();
    await controller.remove(req(sample.id), res);
    expect(res.statusCode).toBe(404);
  });

  it('409s when the user is on the audit trail', async () => {
    serviceMock.deleteUser.mockResolvedValueOnce('has-audit-history');
    const res = mockRes();
    await controller.remove(req(sample.id), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toContain('Deactivate');
  });
});
