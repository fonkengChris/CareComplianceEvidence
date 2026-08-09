import type { ServiceUser, User } from '@care/shared';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { serviceUsers, staffAssignments, users } from '../db/schema';
import { toPublicUser } from './auth.service';
import { toPublicServiceUser } from './service-user.service';

/**
 * Staff-assignment service — the only layer that touches the DB for the supervision
 * group (which service users a staff member covers). A manager grows/shrinks the group
 * by adding/removing `(staffId, serviceUserId)` rows; staff may view and record against
 * the week plans of their assigned service users, and only those (Phase 5, CLAUDE.md).
 */

/**
 * The active service users a staff member currently supervises, ordered by name — the
 * staff dashboard payload. Inactive service users are excluded: there is nothing to
 * record against once a service user is soft-deleted.
 */
export async function listAssignmentsForStaff(staffId: string): Promise<ServiceUser[]> {
  const rows = await db
    .select({ serviceUser: serviceUsers })
    .from(staffAssignments)
    .innerJoin(serviceUsers, eq(serviceUsers.id, staffAssignments.serviceUserId))
    .where(and(eq(staffAssignments.staffId, staffId), eq(serviceUsers.active, true)))
    .orderBy(asc(serviceUsers.name));
  return rows.map((r) => toPublicServiceUser(r.serviceUser));
}

/** The staff members assigned to a service user, ordered by name — the manager's view. */
export async function listStaffForServiceUser(serviceUserId: string): Promise<User[]> {
  const rows = await db
    .select({ user: users })
    .from(staffAssignments)
    .innerJoin(users, eq(users.id, staffAssignments.staffId))
    .where(eq(staffAssignments.serviceUserId, serviceUserId))
    .orderBy(asc(users.name));
  return rows.map((r) => toPublicUser(r.user));
}

/**
 * Assign a staff member to a service user. Idempotent: re-assigning an existing pair is
 * a no-op (unique `staff_assignments_staff_service_user`), so this always succeeds.
 */
export async function assign(staffId: string, serviceUserId: string): Promise<void> {
  await db.insert(staffAssignments).values({ staffId, serviceUserId }).onConflictDoNothing();
}

/** Remove a staff member from a service user's supervision group. Idempotent. */
export async function unassign(staffId: string, serviceUserId: string): Promise<void> {
  await db
    .delete(staffAssignments)
    .where(
      and(
        eq(staffAssignments.staffId, staffId),
        eq(staffAssignments.serviceUserId, serviceUserId),
      ),
    );
}

/**
 * Whether a staff member currently supervises a service user — the reusable guard behind
 * scoped reads and the recording endpoints. A missing row means "not assigned" → the
 * caller returns 403.
 */
export async function isStaffAssigned(staffId: string, serviceUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .where(
      and(
        eq(staffAssignments.staffId, staffId),
        eq(staffAssignments.serviceUserId, serviceUserId),
      ),
    )
    .limit(1);
  return row !== undefined;
}
