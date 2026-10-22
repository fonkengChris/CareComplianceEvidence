import type { Home, User } from '@care/shared';
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
  deleteHome: mock((): Promise<boolean> => Promise.resolve(true)),
  listServiceUsersForHome: mock(() => Promise.resolve([])),
};

// Full surface of the module, so other files importing it under this mock don't hit undefined.
const homeAssignmentMock = {
  listStaffForHome: mock((): Promise<User[]> => Promise.resolve([])),
  listHomesForStaff: mock((): Promise<Home[]> => Promise.resolve([])),
  assignHome: mock((): Promise<void> => Promise.resolve()),
  unassignHome: mock((): Promise<void> => Promise.resolve()),
};

mock.module('../services/home.service', () => serviceMock);
mock.module('../services/home-assignment.service', () => homeAssignmentMock);

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
    end() {
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
  serviceMock.deleteHome.mockReset();
  serviceMock.listServiceUsersForHome.mockReset();
  homeAssignmentMock.listHomesForStaff.mockReset();
});

const managerUser = {
  sub: '99999999-9999-4999-8999-999999999999',
  role: 'MANAGER' as const,
  email: 'manager@example.com',
};
const staffUser = { ...managerUser, role: 'STAFF' as const };
const OTHER_HOME = '44444444-4444-4444-8444-444444444444';

describe('list', () => {
  it('passes the ?active=true filter through and returns the rows', async () => {
    serviceMock.listHomes.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list(
      { query: { active: 'true' }, user: managerUser } as unknown as Request,
      res,
    );
    expect(serviceMock.listHomes).toHaveBeenCalledWith({ active: true });
    expect(res.body).toEqual([sample]);
  });
});

describe('staff / key worker scoping', () => {
  it('lists only the homes the caller belongs to', async () => {
    homeAssignmentMock.listHomesForStaff.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list({ query: {}, user: staffUser } as unknown as Request, res);
    expect(homeAssignmentMock.listHomesForStaff).toHaveBeenCalledWith(staffUser.sub);
    expect(serviceMock.listHomes).not.toHaveBeenCalled();
    expect(res.body).toEqual([sample]);
  });

  it("404s a home the caller doesn't belong to", async () => {
    homeAssignmentMock.listHomesForStaff.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.getById(
      {
        params: { id: OTHER_HOME },
        user: { ...staffUser, role: 'KEY_WORKER' },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(serviceMock.getHome).not.toHaveBeenCalled();
  });

  it("404s the service users of a home the caller doesn't belong to", async () => {
    homeAssignmentMock.listHomesForStaff.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.listServiceUsers(
      { params: { id: sample.id }, user: staffUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(serviceMock.listServiceUsersForHome).not.toHaveBeenCalled();
  });

  it("returns a member's home service users", async () => {
    homeAssignmentMock.listHomesForStaff.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.listServiceUsers(
      { params: { id: sample.id }, user: staffUser } as unknown as Request,
      res,
    );
    expect(serviceMock.listServiceUsersForHome).toHaveBeenCalledWith(sample.id);
  });
});

describe('getById', () => {
  it('404s when the home does not exist', async () => {
    serviceMock.getHome.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.getById(
      { params: { id: sample.id }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns the home when found', async () => {
    serviceMock.getHome.mockResolvedValueOnce(sample);
    const res = mockRes();
    await controller.getById(
      { params: { id: sample.id }, user: managerUser } as unknown as Request,
      res,
    );
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

describe('remove', () => {
  const req = { params: { id: sample.id } } as unknown as Request;

  it('204s when the home is deleted', async () => {
    serviceMock.deleteHome.mockResolvedValueOnce(true);
    const res = mockRes();
    await controller.remove(req, res);
    expect(serviceMock.deleteHome).toHaveBeenCalledWith(sample.id);
    expect(res.statusCode).toBe(204);
  });

  it('404s when the home does not exist', async () => {
    serviceMock.deleteHome.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.remove(req, res);
    expect(res.statusCode).toBe(404);
  });
});
