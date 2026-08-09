import type { User } from '@care/shared';
import { asc } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { toPublicUser } from './auth.service';

/**
 * User service — read side of user management (the manager's list). Creation lives in
 * auth.service (`createUser`, exposed via POST /auth/register) since it owns password
 * hashing; this module only reads. `toPublicUser` (from auth.service) drops the
 * passwordHash, so it can never leak through the list.
 */

/** List all users (active and inactive), ordered by name, for the manager's admin view. */
export async function listUsers(): Promise<User[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return rows.map(toPublicUser);
}
