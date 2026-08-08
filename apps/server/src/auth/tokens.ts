import { type AccessTokenClaims, accessTokenClaimsSchema } from '@care/shared';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';

/**
 * Token primitives. Two distinct token types:
 *  - Access token: a short-lived HS256 JWT (stateless, verified by signature).
 *  - Refresh token: an opaque random string; only its SHA-256 hash is stored, so a
 *    DB leak never yields a usable token. Lookups hash the presented token and match.
 */

const secret = new TextEncoder().encode(config.jwtSecret);
const ALG = 'HS256';

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(config.accessTokenTtl)
    .sign(secret);
}

/** Verifies signature + expiry and returns typed claims. Throws if invalid/expired. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
  return accessTokenClaimsSchema.parse({
    sub: payload.sub,
    role: payload.role,
    email: payload.email,
  });
}

/** SHA-256, hex. Deterministic — the same token always yields the same hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A fresh opaque refresh token plus the hash to persist. Raw token is returned once. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

/** The instant a new refresh token should expire, given the configured TTL. */
export function refreshTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

/** Pure guard: a stored refresh row is usable only if not revoked and not expired. */
export function isRefreshTokenUsable(
  row: { revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return row.revokedAt === null && row.expiresAt.getTime() > now.getTime();
}
