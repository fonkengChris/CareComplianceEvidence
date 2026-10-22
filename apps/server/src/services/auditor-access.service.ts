import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { auditorAccessRequests, serviceUsers, users } from '../db/schema';
import { type AuditWrite, recordAudit } from './audit.service';

/**
 * Auditor-access service — the only layer that touches `auditor_access_requests`. A MANAGER sets
 * the service users an AUDITOR may audit (from the auditor's user form); each is an APPROVED row.
 * Only APPROVED rows scope the auditor's reports (`approvedServiceUserIds` / `isAuditorApproved`,
 * used by the report controller). The auditor never lists service users themselves (GDPR).
 * Every grant and revoke is appended to the audit trail, atomically with the change.
 */

/** Pure diff of the current grant set against the wanted one. */
export function diffGrants(
  current: readonly string[],
  wanted: readonly string[],
): { add: string[]; remove: string[] } {
  const have = new Set(current);
  const want = new Set(wanted);
  return {
    add: [...want].filter((id) => !have.has(id)),
    remove: [...have].filter((id) => !want.has(id)),
  };
}

export type SetGrantsResult = 'ok' | 'not_found' | 'not_auditor';

/**
 * Replace the set of service users an auditor may audit. New ids become APPROVED grants (an
 * existing PENDING row left over from the old request flow is promoted rather than duplicated);
 * dropped ids are REVOKED; any other leftover PENDING rows for the auditor are closed as
 * REJECTED. Unknown service-user ids are ignored. Only AUDITOR accounts can hold grants.
 */
export async function setAuditorServiceUsers(
  auditorId: string,
  serviceUserIds: readonly string[],
  actorId: string,
): Promise<SetGrantsResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, auditorId))
      .limit(1);
    if (!target) return 'not_found';
    if (target.role !== 'AUDITOR') return 'not_auditor';

    const wanted = serviceUserIds.length
      ? (
          await tx
            .select({ id: serviceUsers.id })
            .from(serviceUsers)
            .where(inArray(serviceUsers.id, [...new Set(serviceUserIds)]))
        ).map((r) => r.id)
      : [];

    const open = await tx
      .select()
      .from(auditorAccessRequests)
      .where(
        and(
          eq(auditorAccessRequests.auditorId, auditorId),
          inArray(auditorAccessRequests.status, ['PENDING', 'APPROVED']),
        ),
      );
    const approved = open.filter((r) => r.status === 'APPROVED');
    const pendingBySu = new Map(
      open.filter((r) => r.status === 'PENDING').map((r) => [r.serviceUserId, r]),
    );
    const { add, remove } = diffGrants(
      approved.map((r) => r.serviceUserId),
      wanted,
    );

    const now = new Date();
    const audits: AuditWrite[] = [];
    const change = (
      id: string,
      status: 'APPROVED' | 'REVOKED' | 'REJECTED',
      from: string | null,
      action: string,
    ) => {
      audits.push({
        userId: actorId,
        action,
        entityType: 'AUDITOR_ACCESS',
        entityId: id,
        field: 'status',
        fromValue: from,
        toValue: status,
      });
    };

    for (const su of add) {
      const pending = pendingBySu.get(su);
      if (pending) {
        await tx
          .update(auditorAccessRequests)
          .set({ status: 'APPROVED', decidedById: actorId, decidedAt: now })
          .where(eq(auditorAccessRequests.id, pending.id));
        pendingBySu.delete(su);
        change(pending.id, 'APPROVED', 'PENDING', 'GRANT');
      } else {
        const [row] = await tx
          .insert(auditorAccessRequests)
          .values({
            auditorId,
            serviceUserId: su,
            status: 'APPROVED',
            decidedById: actorId,
            decidedAt: now,
          })
          .returning({ id: auditorAccessRequests.id });
        change(row!.id, 'APPROVED', null, 'GRANT');
      }
    }

    const revoke = approved.filter((r) => remove.includes(r.serviceUserId));
    const stalePending = [...pendingBySu.values()];
    for (const [rows, status] of [
      [revoke, 'REVOKED'],
      [stalePending, 'REJECTED'],
    ] as const) {
      if (rows.length === 0) continue;
      await tx
        .update(auditorAccessRequests)
        .set({ status, decidedById: actorId, decidedAt: now })
        .where(
          inArray(
            auditorAccessRequests.id,
            rows.map((r) => r.id),
          ),
        );
      for (const r of rows) change(r.id, status, r.status, 'REVOKE');
    }

    await recordAudit(tx, audits);
    return 'ok';
  });
}

/** The service users an auditor is currently approved to audit. */
export async function approvedServiceUserIds(auditorId: string): Promise<string[]> {
  const rows = await db
    .select({ serviceUserId: auditorAccessRequests.serviceUserId })
    .from(auditorAccessRequests)
    .where(
      and(
        eq(auditorAccessRequests.auditorId, auditorId),
        eq(auditorAccessRequests.status, 'APPROVED'),
      ),
    );
  return rows.map((r) => r.serviceUserId);
}

/** Whether an auditor currently holds an APPROVED grant for a service user. */
export async function isAuditorApproved(
  auditorId: string,
  serviceUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: auditorAccessRequests.id })
    .from(auditorAccessRequests)
    .where(
      and(
        eq(auditorAccessRequests.auditorId, auditorId),
        eq(auditorAccessRequests.serviceUserId, serviceUserId),
        eq(auditorAccessRequests.status, 'APPROVED'),
      ),
    )
    .limit(1);
  return row !== undefined;
}
