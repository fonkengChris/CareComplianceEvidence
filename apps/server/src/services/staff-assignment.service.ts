import type { AssignedStaff, ServiceUser } from '@care/shared';
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db';
import {
  serviceUsers,
  shiftSessions,
  staffAssignments,
  staffHomeAssignments,
  users,
} from '../db/schema';
import { recordAudit } from './audit.service';
import { toPublicUser } from './auth.service';
import { toPublicServiceUser } from './service-user.service';

/**
 * Staff-assignment service — the only layer that touches the DB for the supervision
 * group (which service users a staff member covers). A staff member's reach is the
 * UNION of two paths: unexpired direct `(staffId, serviceUserId)` rows (each has an `endsAt` a
 * manager renews) AND the homes they are
 * currently ON SHIFT at. Home membership (`staff_home_assignments`) alone only makes a staff
 * member eligible to start a shift there — the home path is live only while they hold an
 * active `shift_sessions` row for that home, so off-shift staff cannot open residents'
 * records. Staff may view and record against the week plans of the service users they reach,
 * and only those (Phase 5, CLAUDE.md — enforced on the server, not just the UI).
 *
 * Key-worker REPORTS use the wider caseload (`listCaseloadIds` / `isInCaseload`): direct +
 * home membership, not shift-gated.
 */

/** The ids of homes a staff member is a member of (eligibility, not live access). */
export async function memberHomeIdsForStaff(staffId: string): Promise<string[]> {
  const rows = await db
    .select({ homeId: staffHomeAssignments.homeId })
    .from(staffHomeAssignments)
    .where(eq(staffHomeAssignments.staffId, staffId));
  return rows.map((r) => r.homeId);
}

/**
 * The ids of homes a staff member currently reaches via the home path: still a member AND
 * holding an active shift session there (not ended, not past its expiry).
 */
export async function activeShiftHomeIdsForStaff(staffId: string): Promise<string[]> {
  const rows = await db
    .select({ homeId: shiftSessions.homeId })
    .from(shiftSessions)
    .innerJoin(
      staffHomeAssignments,
      and(
        eq(staffHomeAssignments.homeId, shiftSessions.homeId),
        eq(staffHomeAssignments.staffId, shiftSessions.staffId),
      ),
    )
    .where(
      and(
        eq(shiftSessions.staffId, staffId),
        isNull(shiftSessions.endedAt),
        gt(shiftSessions.expiresAt, new Date()),
      ),
    );
  return rows.map((r) => r.homeId);
}

/**
 * Active service users reached by a direct assignment or by membership of one of `homeIds`,
 * ordered by name and de-duplicated. Inactive service users are excluded: there is nothing
 * to record against once soft-deleted.
 */
async function listReachable(staffId: string, homeIds: string[]): Promise<ServiceUser[]> {
  const reach = or(
    and(eq(staffAssignments.staffId, staffId), gt(staffAssignments.endsAt, new Date())),
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

/**
 * The service users a staff member can see and record for RIGHT NOW, ordered by name — the
 * staff dashboard payload: direct assignments plus the home they are on shift at.
 */
export async function listAssignmentsForStaff(staffId: string): Promise<ServiceUser[]> {
  return listReachable(staffId, await activeShiftHomeIdsForStaff(staffId));
}

/**
 * A key worker's report caseload ids: direct assignments plus every home they belong to,
 * regardless of shift (CLAUDE.md KEY_WORKER rule). Used for reports only, never recording.
 */
export async function listCaseloadIds(staffId: string): Promise<string[]> {
  const rows = await listReachable(staffId, await memberHomeIdsForStaff(staffId));
  return rows.map((su) => su.id);
}

/**
 * The staff directly assigned to a service user, with when each link lapses, ordered by name —
 * the manager's view. Expired links are included (marked by a past `assignmentEndsAt`) so a
 * manager can see and renew them.
 */
export async function listStaffForServiceUser(serviceUserId: string): Promise<AssignedStaff[]> {
  const rows = await db
    .select({ user: users, endsAt: staffAssignments.endsAt })
    .from(staffAssignments)
    .innerJoin(users, eq(users.id, staffAssignments.staffId))
    .where(eq(staffAssignments.serviceUserId, serviceUserId))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ ...toPublicUser(r.user), assignmentEndsAt: r.endsAt.toISOString() }));
}

/** "<staff name> until <YYYY-MM-DD>" — the audit text for a direct link. */
function assignmentText(staffName: string, endsAt: Date): string {
  return `${staffName} until ${endsAt.toISOString().slice(0, 10)}`;
}

/**
 * Assign a staff member to a service user until `endsAt`, or renew an existing link to that date
 * (unique `staff_assignments_staff_service_user`). Audited against the service user as
 * ASSIGN (from the previous link, if any → the new one). Unknown staff → `not-found`.
 */
export async function assign(
  staffId: string,
  serviceUserId: string,
  endsAt: Date,
  actorId: string,
): Promise<'ok' | 'not-found'> {
  return db.transaction(async (tx) => {
    const [staff] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, staffId))
      .limit(1);
    if (!staff) return 'not-found';
    const [existing] = await tx
      .select({ endsAt: staffAssignments.endsAt })
      .from(staffAssignments)
      .where(
        and(
          eq(staffAssignments.staffId, staffId),
          eq(staffAssignments.serviceUserId, serviceUserId),
        ),
      )
      .limit(1);
    await tx
      .insert(staffAssignments)
      .values({ staffId, serviceUserId, endsAt })
      .onConflictDoUpdate({
        target: [staffAssignments.staffId, staffAssignments.serviceUserId],
        set: { endsAt },
      });
    await recordAudit(tx, [
      {
        userId: actorId,
        action: 'ASSIGN',
        entityType: 'SERVICE_USER',
        entityId: serviceUserId,
        field: 'staffAssignment',
        fromValue: existing ? assignmentText(staff.name, existing.endsAt) : null,
        toValue: assignmentText(staff.name, endsAt),
      },
    ]);
    return 'ok';
  });
}

/** Remove a staff member from a service user's supervision group. Idempotent; audited if removed. */
export async function unassign(
  staffId: string,
  serviceUserId: string,
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(staffAssignments)
      .where(
        and(
          eq(staffAssignments.staffId, staffId),
          eq(staffAssignments.serviceUserId, serviceUserId),
        ),
      )
      .returning({ endsAt: staffAssignments.endsAt });
    if (removed.length === 0) return;
    const [staff] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, staffId))
      .limit(1);
    await recordAudit(tx, [
      {
        userId: actorId,
        action: 'UNASSIGN',
        entityType: 'SERVICE_USER',
        entityId: serviceUserId,
        field: 'staffAssignment',
        fromValue: assignmentText(staff?.name ?? staffId, removed[0]!.endsAt),
      },
    ]);
  });
}

/** Whether there is a direct assignment, or the service user's home is one of `homeIds`. */
async function reaches(
  staffId: string,
  serviceUserId: string,
  homeIds: string[],
): Promise<boolean> {
  const [direct] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .where(
      and(
        eq(staffAssignments.staffId, staffId),
        eq(staffAssignments.serviceUserId, serviceUserId),
        gt(staffAssignments.endsAt, new Date()),
      ),
    )
    .limit(1);
  if (direct !== undefined) return true;

  if (homeIds.length === 0) return false;
  const [viaHome] = await db
    .select({ id: serviceUsers.id })
    .from(serviceUsers)
    .where(and(eq(serviceUsers.id, serviceUserId), inArray(serviceUsers.homeId, homeIds)))
    .limit(1);
  return viaHome !== undefined;
}

/**
 * Whether a staff member currently reaches a service user — the reusable guard behind
 * scoped reads and the recording endpoints. True if there is a direct assignment OR the
 * service user belongs to the home the staff member is on shift at. No match → 403.
 */
export async function isStaffAssigned(staffId: string, serviceUserId: string): Promise<boolean> {
  return reaches(staffId, serviceUserId, await activeShiftHomeIdsForStaff(staffId));
}

/** Whether a service user is in a key worker's report caseload (see `listCaseloadIds`). */
export async function isInCaseload(staffId: string, serviceUserId: string): Promise<boolean> {
  return reaches(staffId, serviceUserId, await memberHomeIdsForStaff(staffId));
}
