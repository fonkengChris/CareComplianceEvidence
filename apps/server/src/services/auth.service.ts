import { type User, userSchema } from '@care/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens, users } from '../db/schema';
import { verifyPassword } from '../auth/password';
import {
  generateRefreshToken,
  hashToken,
  isRefreshTokenUsable,
  refreshTokenExpiry,
  signAccessToken,
} from '../auth/tokens';

/**
 * Auth service — the only layer that touches the DB for authentication. Controllers
 * call these; routes never query Drizzle directly (CLAUDE.md layering). Calculations
 * of "is this session still valid" live here and in the pure token guards.
 */

type UserRow = typeof users.$inferSelect;

/** A session pair: a stateless access token and the raw refresh token (cookie-bound). */
export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** Map a DB user row to the public shared shape — drops passwordHash, ISO-dates. */
export function toPublicUser(row: UserRow): User {
  return userSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Issue an access token + a freshly-persisted refresh token for a user. */
async function issueSession(row: UserRow): Promise<Session> {
  const accessToken = await signAccessToken({ sub: row.id, role: row.role, email: row.email });
  const { token, tokenHash } = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: row.id,
    tokenHash,
    expiresAt: refreshTokenExpiry(),
  });
  return { user: toPublicUser(row), accessToken, refreshToken: token };
}

/** Authenticate by email + password. Returns null on any failure (no info leak). */
export async function login(email: string, password: string): Promise<Session | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row || !row.active) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  return issueSession(row);
}

/**
 * Validate a presented refresh token and ROTATE it: the old token is revoked and a
 * new one issued in the same breath, so a stolen-then-replayed token is caught (the
 * legitimate rotation already revoked it). Returns null if the token is unusable or
 * the user has since been deactivated.
 */
export async function refresh(rawToken: string): Promise<Session | null> {
  const tokenHash = hashToken(rawToken);
  const [current] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  if (!current || !isRefreshTokenUsable(current)) return null;

  const [user] = await db.select().from(users).where(eq(users.id, current.userId)).limit(1);
  if (!user || !user.active) return null;

  // Revoke the presented token, then issue a fresh session.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, current.id));
  return issueSession(user);
}

/** Revoke the presented refresh token. Idempotent — unknown/already-revoked is a no-op. */
export async function logout(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

/**
 * Revoke every live refresh token for a user — used on user deactivation so a
 * departed staff member's access ends promptly (Phase 3 wires this to the user
 * management flow).
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Fetch the public user for a verified access token (/auth/me). */
export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toPublicUser(row) : null;
}
