import { describe, expect, it } from 'bun:test';
import {
  generateRefreshToken,
  hashToken,
  isRefreshTokenUsable,
  signAccessToken,
  verifyAccessToken,
} from './tokens';

const claims = {
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'MANAGER' as const,
  email: 'boss@example.com',
};

describe('access tokens', () => {
  it('signs and verifies, preserving claims', async () => {
    const token = await signAccessToken(claims);
    expect(await verifyAccessToken(token)).toEqual(claims);
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken(claims);
    const tampered = `${token}x`;
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it('rejects a garbage token', async () => {
    await expect(verifyAccessToken('not.a.jwt')).rejects.toThrow();
  });
});

describe('refresh tokens', () => {
  it('hashToken is deterministic and not the input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('generateRefreshToken returns a token whose hash matches hashToken', () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(token.length).toBeGreaterThan(0);
    expect(tokenHash).toBe(hashToken(token));
  });

  it('generates unique tokens', () => {
    expect(generateRefreshToken().token).not.toBe(generateRefreshToken().token);
  });
});

describe('isRefreshTokenUsable', () => {
  const now = new Date('2026-08-08T00:00:00.000Z');
  const future = new Date('2026-09-08T00:00:00.000Z');
  const past = new Date('2026-07-08T00:00:00.000Z');

  it('accepts a live, unrevoked token', () => {
    expect(isRefreshTokenUsable({ revokedAt: null, expiresAt: future }, now)).toBe(true);
  });

  it('rejects a revoked token', () => {
    expect(isRefreshTokenUsable({ revokedAt: now, expiresAt: future }, now)).toBe(false);
  });

  it('rejects an expired token', () => {
    expect(isRefreshTokenUsable({ revokedAt: null, expiresAt: past }, now)).toBe(false);
  });
});
