import type { User, UserUpdate } from '@care/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { auditLogs, users } from '../db/schema';
import { hashPassword } from '../auth/password';
import { revokeAllForUser, toPublicUser } from './auth.service';
import { endOpenShiftsForUser } from './shift.service';

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
 * token and ends any open shift so the departed user's access ends promptly (CLAUDE.md);
 * `actorId` is who is recorded as ending it. A duplicate email maps to a typed `conflict` for
 * the controller to return as 409.
 */
export async function updateUser(
  id: string,
  input: UserUpdate,
  actorId: string = id,
): Promise<UpdateUserResult> {
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
    if (input.active === false) {
      await revokeAllForUser(id);
      await endOpenShiftsForUser(id, actorId);
    }
    return { ok: true, value: toPublicUser(row) };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'conflict' };
    throw err;
  }
}

export type DeleteUserResult = 'deleted' | 'not-found' | 'has-audit-history';

/**
 * Permanently delete a user who has never made an audited change. Their refresh tokens,
 * staff/home assignments and auditor access requests go with them (FK cascades). Once they
 * appear as the actor on the audit trail, deleting would blank the "who" on those rows
 * (`audit_logs.user_id` is `set null`), so they can only be deactivated.
 */
export async function deleteUser(id: string): Promise<DeleteUserResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!row) return 'not-found';

    const [audited] = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.userId, id))
      .limit(1);
    if (audited) return 'has-audit-history';

    await tx.delete(users).where(eq(users.id, id));
    return 'deleted';
  });
}
