import { describe, expect, it } from 'bun:test';
import { accessTokenClaimsSchema, authResponseSchema, loginRequestSchema } from './auth';

describe('loginRequestSchema', () => {
  it('accepts a valid login', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'sam@example.com', password: 'anything' }).success,
    ).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(loginRequestSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(
      false,
    );
  });

  it('rejects an empty password', () => {
    expect(loginRequestSchema.safeParse({ email: 'sam@example.com', password: '' }).success).toBe(
      false,
    );
  });
});

describe('accessTokenClaimsSchema', () => {
  it('round-trips valid claims', () => {
    const claims = {
      sub: '11111111-1111-4111-8111-111111111111',
      role: 'MANAGER' as const,
      email: 'boss@example.com',
    };
    expect(accessTokenClaimsSchema.parse(claims)).toEqual(claims);
  });

  it('rejects an unknown role', () => {
    expect(
      accessTokenClaimsSchema.safeParse({
        sub: '11111111-1111-4111-8111-111111111111',
        role: 'SUPERUSER',
        email: 'boss@example.com',
      }).success,
    ).toBe(false);
  });
});

describe('authResponseSchema', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Sam Staff',
    email: 'sam@example.com',
    role: 'STAFF',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };

  it('accepts an access token + public user', () => {
    expect(authResponseSchema.safeParse({ accessToken: 'jwt.abc.def', user }).success).toBe(true);
  });

  it('strips a leaked passwordHash from the nested user', () => {
    const parsed = authResponseSchema.parse({
      accessToken: 'jwt.abc.def',
      user: { ...user, passwordHash: 'super-secret' },
    });
    expect('passwordHash' in parsed.user).toBe(false);
  });
});
