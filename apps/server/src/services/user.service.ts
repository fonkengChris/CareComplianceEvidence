import type { User, UserUpdate } from '@care/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { users } from '../db/schema';
import { hashPassword } from '../auth/password';
import { revokeAllForUser, toPublicUser } from './auth.service';

/**
 * User service — read + admin-edit side of user management (the manager's view).
 * Creation lives in auth.service (`createUser`, exposed via POST /auth/register) since
 * it owns password hashing; this module reads and edits. `toPublicUser` drops the
 * passwordHash, so it can never leak through the list or an edit response.
 */

/** Update result: `not-found` for an unknown id, `conflict` for a duplicate email. */
export type UpdateUserResult =
  | { ok: true; value: User }
  | { ok: false; reason: 'not-found' | 'conflict' };

/** List all users (active and inactive), ordered by name, for the manager's admin view. */
export async function listUsers(): Promise<User[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return rows.map(toPublicUser);
}

/** Fetch a single user by id (public shape), or null if none exists. */
export async function getUser(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toPublicUser(row) : null;
}

/**
 * Admin edit of a user. Only fields present in `input` are set; an omitted password
 * leaves the current one untouched (a present one is re-hashed here — the plaintext
 * never persists). Deactivating (`active: false`) also revokes every live refresh
 * token so the departed user's access ends promptly (CLAUDE.md). A duplicate email
 * maps to a typed `conflict` for the controller to return as 409.
 */
export async function updateUser(id: string, input: UserUpdate): Promise<UpdateUserResult> {
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.role !== undefined) patch.role = input.role;
  if (input.active !== undefined) patch.active = input.active;
  if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password);

  try {
    const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!row) return { ok: false, reason: 'not-found' };
    // Deactivation must terminate any live session.
    if (input.active === false) await revokeAllForUser(id);
    return { ok: true, value: toPublicUser(row) };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}
