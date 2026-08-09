import type { Home, User } from '@care/shared';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { homes, staffHomeAssignments, users } from '../db/schema';
import { toPublicUser } from './auth.service';
import { toPublicHome } from './home.service';

/**
 * Home-assignment service — the DB layer for staff → home membership. Assigning a staff
 * member to a home grants access to every service user in it (the union is resolved in
 * staff-assignment.service). A manager grows/shrinks membership by adding/removing rows.
 */

/** The staff members assigned to a home, ordered by name — the manager's view. */
export async function listStaffForHome(homeId: string): Promise<User[]> {
  const rows = await db
    .select({ user: users })
    .from(staffHomeAssignments)
    .innerJoin(users, eq(users.id, staffHomeAssignments.staffId))
    .where(eq(staffHomeAssignments.homeId, homeId))
    .orderBy(asc(users.name));
  return rows.map((r) => toPublicUser(r.user));
}

/** The homes a staff member is assigned to, ordered by name. */
export async function listHomesForStaff(staffId: string): Promise<Home[]> {
  const rows = await db
    .select({ home: homes })
    .from(staffHomeAssignments)
    .innerJoin(homes, eq(homes.id, staffHomeAssignments.homeId))
    .where(eq(staffHomeAssignments.staffId, staffId))
    .orderBy(asc(homes.name));
  return rows.map((r) => toPublicHome(r.home));
}

/** Assign a staff member to a home. Idempotent (unique staff/home pair). */
export async function assignHome(staffId: string, homeId: string): Promise<void> {
  await db.insert(staffHomeAssignments).values({ staffId, homeId }).onConflictDoNothing();
}

/** Remove a staff member from a home. Idempotent. */
export async function unassignHome(staffId: string, homeId: string): Promise<void> {
  await db
    .delete(staffHomeAssignments)
    .where(
      and(
        eq(staffHomeAssignments.staffId, staffId),
        eq(staffHomeAssignments.homeId, homeId),
      ),
    );
}
