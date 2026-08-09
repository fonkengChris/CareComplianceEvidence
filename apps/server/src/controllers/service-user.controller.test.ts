import type { ServiceUser } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the service layer via mock.module, so no DB or bound port is
 * needed. They assert status codes and response body shape. Role enforcement lives in
 * middleware (see middleware/auth.test.ts) — the routes merely compose it.
 */

const serviceMock = {
  listServiceUsers: mock((): Promise<ServiceUser[]> => Promise.resolve([])),
  getServiceUser: mock((): Promise<ServiceUser | null> => Promise.resolve(null)),
  createServiceUser: mock((): Promise<ServiceUser> => Promise.resolve(sample)),
  updateServiceUser: mock((): Promise<ServiceUser | null> => Promise.resolve(null)),
  setServiceUserActive: mock((): Promise<ServiceUser | null> => Promise.resolve(null)),
};

mock.module('../services/service-user.service', () => serviceMock);

const controller = await import('./service-user.controller');

const sample: ServiceUser = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ada Lovelace',
  address: '1 Analytical Ave',
  contractedHours: 12.5,
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

// Writes carry the authenticated actor, threaded into the service for the audit trail.
const managerUser = {
  sub: '99999999-9999-4999-8999-999999999999',
  role: 'MANAGER' as const,
  email: 'manager@example.com',
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
  serviceMock.listServiceUsers.mockReset();
  serviceMock.getServiceUser.mockReset();
  serviceMock.createServiceUser.mockReset();
  serviceMock.updateServiceUser.mockReset();
  serviceMock.setServiceUserActive.mockReset();
});

describe('list', () => {
  it('passes the ?active=true filter through and returns the rows', async () => {
    serviceMock.listServiceUsers.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list({ query: { active: 'true' } } as unknown as Request, res);
    expect(serviceMock.listServiceUsers).toHaveBeenCalledWith({ active: true });
    expect(res.body).toEqual([sample]);
  });

  it('treats a missing/invalid filter as no filter', async () => {
    serviceMock.listServiceUsers.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.list({ query: {} } as unknown as Request, res);
    expect(serviceMock.listServiceUsers).toHaveBeenCalledWith({ active: undefined });
  });
});

describe('getById', () => {
  it('404s when the service user does not exist', async () => {
    serviceMock.getServiceUser.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.getById({ params: { id: sample.id } } as unknown as Request, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the service user when found', async () => {
    serviceMock.getServiceUser.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.getById({ params: { id: sample.id } } as unknown as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sample);
  });
});

describe('create', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.create({ body: { name: '' } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.createServiceUser).not.toHaveBeenCalled();
  });

  it('201s with the created service user', async () => {
    serviceMock.createServiceUser.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.create(
      { body: { name: 'Ada Lovelace', contractedHours: 12.5 } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(sample);
  });
});

describe('update', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { contractedHours: -1 } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.updateServiceUser).not.toHaveBeenCalled();
  });

  it('404s when the id is unknown', async () => {
    serviceMock.updateServiceUser.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { name: 'New name' }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('200s with the updated service user and passes the actor to the service', async () => {
    serviceMock.updateServiceUser.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { name: 'Ada Lovelace' }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sample);
    expect(serviceMock.updateServiceUser).toHaveBeenCalledWith(
      sample.id,
      { name: 'Ada Lovelace' },
      managerUser.sub,
    );
  });
});

describe('setActive', () => {
  it('400s when active is not a boolean', async () => {
    const res = mockRes();
    await controller.setActive({ params: { id: sample.id }, body: {} } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.setServiceUserActive).not.toHaveBeenCalled();
  });

  it('404s when the id is unknown', async () => {
    serviceMock.setServiceUserActive.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.setActive(
      { params: { id: sample.id }, body: { active: false }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('toggles active and returns the updated service user', async () => {
    const deactivated = { ...sample, active: false };
    serviceMock.setServiceUserActive.mockResolvedValueOnce(deactivated);
    const res = mockRes();
    await controller.setActive(
      { params: { id: sample.id }, body: { active: false }, user: managerUser } as unknown as Request,
      res,
    );
    expect(serviceMock.setServiceUserActive).toHaveBeenCalledWith(sample.id, false, managerUser.sub);
    expect(res.body).toEqual(deactivated);
  });
});
