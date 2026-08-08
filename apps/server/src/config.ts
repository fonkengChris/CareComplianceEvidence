/**
 * Centralised, env-driven configuration. Auth secrets and token lifetimes are read
 * here once — never hardcoded at call sites (CLAUDE.md rule). In production a real
 * `JWT_SECRET` is mandatory; outside production a clearly-labelled dev fallback keeps
 * local setup frictionless.
 */

const isProd = process.env.NODE_ENV === 'production';

const DEV_JWT_SECRET = 'dev-insecure-jwt-secret-change-me';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;
  if (isProd) {
    throw new Error('JWT_SECRET is required in production but was not set.');
  }
  return DEV_JWT_SECRET;
}

export const config = {
  isProd,
  // HMAC signing key for access-token JWTs.
  jwtSecret: resolveJwtSecret(),
  // Short-lived access token; anything `jose` accepts (e.g. "15m", "1h").
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  // Longer-lived, server-side, revocable refresh token.
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
} as const;
