import type { Home } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the service via mock.module — no DB or bound port. They assert
 * status codes and response body shape; role enforcement lives in middleware.
 */

const serviceMock = {
  listHomes: mock((): Promise<Home[]> => Promise.resolve([])),
  getHome: mock((): Promise<Home | null> => Promise.resolve(null)),
  createHome: mock((): Promise<Home> => Promise.resolve(sample)),
  updateHome: mock((): Promise<Home | null> => Promise.resolve(null)),
  setHomeActive: mock((): Promise<Home | null> => Promise.resolve(null)),
  listServiceUsersForHome: mock(() => Promise.resolve([])),
};

mock.module('../services/home.service', () => serviceMock);

const controller = await import('./home.controller');

const sample: Home = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Riverside House',
  address: '1 Riverside Way',
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
  serviceMock.listHomes.mockReset();
  serviceMock.getHome.mockReset();
  serviceMock.createHome.mockReset();
  serviceMock.updateHome.mockReset();
  serviceMock.setHomeActive.mockReset();
  serviceMock.listServiceUsersForHome.mockReset();
});

describe('list', () => {
  it('passes the ?active=true filter through and returns the rows', async () => {
    serviceMock.listHomes.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list({ query: { active: 'true' } } as unknown as Request, res);
    expect(serviceMock.listHomes).toHaveBeenCalledWith({ active: true });
    expect(res.body).toEqual([sample]);
  });
});

describe('getById', () => {
  it('404s when the home does not exist', async () => {
    serviceMock.getHome.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.getById({ params: { id: sample.id } } as unknown as Request, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the home when found', async () => {
    serviceMock.getHome.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.getById({ params: { id: sample.id } } as unknown as Request, res);
    expect(res.body).toEqual(sample);
  });
});

describe('create', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.create({ body: { name: '' } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.createHome).not.toHaveBeenCalled();
  });

  it('201s with the created home', async () => {
    serviceMock.createHome.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.create({ body: { name: 'Riverside House' } } as unknown as Request, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(sample);
  });
});

describe('update', () => {
  it('404s when the id is unknown', async () => {
    serviceMock.updateHome.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { name: 'New name' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('200s with the updated home', async () => {
    serviceMock.updateHome.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.update(
      { params: { id: sample.id }, body: { name: 'Riverside House' } } as unknown as Request,
      res,
    );
    expect(res.body).toEqual(sample);
  });
});

describe('setActive', () => {
  it('400s when active is not a boolean', async () => {
    const res = mockRes();
    await controller.setActive({ params: { id: sample.id }, body: {} } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.setHomeActive).not.toHaveBeenCalled();
  });

  it('toggles active and returns the updated home', async () => {
    const deactivated = { ...sample, active: false };
    serviceMock.setHomeActive.mockResolvedValueOnce(deactivated);
    const res = mockRes();
    await controller.setActive(
      { params: { id: sample.id }, body: { active: false } } as unknown as Request,
      res,
    );
    expect(serviceMock.setHomeActive).toHaveBeenCalledWith(sample.id, false);
    expect(res.body).toEqual(deactivated);
  });
});
