import type { CreateUserResult, Session } from '../services/auth.service';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the service layer via mock.module, so no DB or bound port is
 * needed. They assert status codes, cookie set/clear, and response body shape.
 */

const serviceMock = {
  login: mock((): Promise<Session | null> => Promise.resolve(null)),
  createUser: mock((): Promise<CreateUserResult> => Promise.resolve({ ok: true, value: sampleUser })),
  refresh: mock((): Promise<Session | null> => Promise.resolve(null)),
  logout: mock((): Promise<void> => Promise.resolve()),
  getUserById: mock((): Promise<unknown> => Promise.resolve(null)),
};

mock.module('../services/auth.service', () => serviceMock);

// Imported AFTER the mock is registered so the controller binds to the stub.
const controller = await import('./auth.controller');

const sampleUser = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sam Staff',
  email: 'sam@example.com',
  role: 'STAFF' as const,
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

const session: Session = {
  user: sampleUser,
  accessToken: 'access.jwt.token',
  refreshToken: 'raw-refresh-token',
};

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    cookies: [] as { name: string; value: string }[],
    cleared: [] as string[],
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    cookie(name: string, value: string) {
      this.cookies.push({ name, value });
      return this;
    },
    clearCookie(name: string) {
      this.cleared.push(name);
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    cookies: { name: string; value: string }[];
    cleared: string[];
    ended: boolean;
  };
}

afterEach(() => {
  serviceMock.login.mockReset();
  serviceMock.createUser.mockReset();
  serviceMock.refresh.mockReset();
  serviceMock.logout.mockReset();
  serviceMock.getUserById.mockReset();
});

describe('login', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.login({ body: { email: 'bad' } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.login).not.toHaveBeenCalled();
  });

  it('401s on bad credentials', async () => {
    serviceMock.login.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.login(
      { body: { email: 'sam@example.com', password: 'nope' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(res.cookies).toHaveLength(0);
  });

  it('sets the refresh cookie and returns the access token + user on success', async () => {
    serviceMock.login.mockResolvedValueOnce(session);
    const res = mockRes();
    await controller.login(
      { body: { email: 'sam@example.com', password: 'Password123!' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toEqual([{ name: 'refresh_token', value: 'raw-refresh-token' }]);
    expect(res.body).toEqual({ accessToken: 'access.jwt.token', user: sampleUser });
  });
});

describe('register', () => {
  const validBody = {
    name: 'New User',
    email: 'new@example.com',
    role: 'STAFF' as const,
    password: 'Password123!',
  };

  it('400s on an invalid body (weak/short password)', async () => {
    const res = mockRes();
    await controller.register(
      { body: { ...validBody, password: 'short' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.createUser).not.toHaveBeenCalled();
  });

  it('409s when the email is already taken', async () => {
    serviceMock.createUser.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.register({ body: validBody } as unknown as Request, res);
    expect(res.statusCode).toBe(409);
  });

  it('201s with the created user and never auto-logs-in (no cookie)', async () => {
    serviceMock.createUser.mockResolvedValueOnce({ ok: true, value: sampleUser });
    const res = mockRes();
    await controller.register({ body: validBody } as unknown as Request, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(sampleUser);
    expect(res.cookies).toHaveLength(0);
  });
});

describe('refresh', () => {
  it('401s when no refresh cookie is present', async () => {
    const res = mockRes();
    await controller.refresh({ cookies: {} } as unknown as Request, res);
    expect(res.statusCode).toBe(401);
    expect(serviceMock.refresh).not.toHaveBeenCalled();
  });

  it('clears the cookie and 401s when the token is invalid', async () => {
    serviceMock.refresh.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.refresh({ cookies: { refresh_token: 'stale' } } as unknown as Request, res);
    expect(res.statusCode).toBe(401);
    expect(res.cleared).toContain('refresh_token');
  });

  it('rotates the cookie and returns a fresh session on success', async () => {
    serviceMock.refresh.mockResolvedValueOnce(session);
    const res = mockRes();
    await controller.refresh({ cookies: { refresh_token: 'old' } } as unknown as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toEqual([{ name: 'refresh_token', value: 'raw-refresh-token' }]);
    expect(res.body).toEqual({ accessToken: 'access.jwt.token', user: sampleUser });
  });
});

describe('logout', () => {
  it('revokes the token, clears the cookie, and 204s', async () => {
    const res = mockRes();
    await controller.logout({ cookies: { refresh_token: 'live' } } as unknown as Request, res);
    expect(serviceMock.logout).toHaveBeenCalledWith('live');
    expect(res.cleared).toContain('refresh_token');
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it('still clears the cookie and 204s when no token is present', async () => {
    const res = mockRes();
    await controller.logout({ cookies: {} } as unknown as Request, res);
    expect(serviceMock.logout).not.toHaveBeenCalled();
    expect(res.cleared).toContain('refresh_token');
    expect(res.statusCode).toBe(204);
  });
});

describe('me', () => {
  it('returns the authenticated user', async () => {
    serviceMock.getUserById.mockResolvedValueOnce(sampleUser);
    const res = mockRes();
    await controller.me({ user: { sub: sampleUser.id } } as unknown as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sampleUser);
  });

  it('404s when the user no longer exists', async () => {
    serviceMock.getUserById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.me({ user: { sub: sampleUser.id } } as unknown as Request, res);
    expect(res.statusCode).toBe(404);
  });
});
