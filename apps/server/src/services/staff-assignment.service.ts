import type { ServiceUser, User } from '@care/shared';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import { serviceUsers, staffAssignments, staffHomeAssignments, users } from '../db/schema';
import { toPublicUser } from './auth.service';
import { toPublicServiceUser } from './service-user.service';

/**
 * Staff-assignment service — the only layer that touches the DB for the supervision
 * group (which service users a staff member covers). A staff member's reach is the
 * UNION of two paths: direct `(staffId, serviceUserId)` rows AND membership of any home
 * the service user belongs to (`staff_home_assignments`). A manager grows/shrinks either.
 * Staff may view and record against the week plans of the service users they reach, and
 * only those (Phase 5, CLAUDE.md — enforced on the server, not just the UI).
 */

/** The ids of homes a staff member is assigned to. */
export async function homeIdsForStaff(staffId: string): Promise<string[]> {
  const rows = await db
    .select({ homeId: staffHomeAssignments.homeId })
    .from(staffHomeAssignments)
    .where(eq(staffHomeAssignments.staffId, staffId));
  return rows.map((r) => r.homeId);
}

/**
 * The active service users a staff member currently supervises, ordered by name — the
 * staff dashboard payload. Includes both directly-assigned service users and every
 * active service user in a home the staff member belongs to, de-duplicated. Inactive
 * service users are excluded: there is nothing to record against once soft-deleted.
 */
export async function listAssignmentsForStaff(staffId: string): Promise<ServiceUser[]> {
  const homeIds = await homeIdsForStaff(staffId);
  const reach = or(
    eq(staffAssignments.staffId, staffId),
    homeIds.length > 0 ? inArray(serviceUsers.homeId, homeIds) : undefined,
  );
  const rows = await db
    .selectDistinct({ serviceUser: serviceUsers })
    .from(serviceUsers)
    .leftJoin(
      staffAssignments,
      and(
        eq(staffAssignments.serviceUserId, serviceUsers.id),
        eq(staffAssignments.staffId, staffId),
      ),
    )
    .where(and(eq(serviceUsers.active, true), reach))
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
 * Whether a staff member currently reaches a service user — the reusable guard behind
 * scoped reads and the recording endpoints. True if there is a direct assignment OR the
 * service user belongs to a home the staff member is assigned to. No match → 403.
 */
export async function isStaffAssigned(staffId: string, serviceUserId: string): Promise<boolean> {
  const [direct] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .where(
      and(
        eq(staffAssignments.staffId, staffId),
        eq(staffAssignments.serviceUserId, serviceUserId),
      ),
    )
    .limit(1);
  if (direct !== undefined) return true;

  // Home path: does this service user's home appear among the staff member's homes?
  const [viaHome] = await db
    .select({ id: staffHomeAssignments.id })
    .from(staffHomeAssignments)
    .innerJoin(serviceUsers, eq(serviceUsers.homeId, staffHomeAssignments.homeId))
    .where(
      and(
        eq(staffHomeAssignments.staffId, staffId),
        eq(serviceUsers.id, serviceUserId),
      ),
    )
    .limit(1);
  return viaHome !== undefined;
}
