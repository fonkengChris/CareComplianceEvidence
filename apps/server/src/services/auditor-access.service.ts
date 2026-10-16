import {
  type AccessRequest,
  type AccessRequestStatus,
  type RequestableServiceUser,
  accessRequestSchema,
} from '@care/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { auditorAccessRequests, homes, serviceUsers, users } from '../db/schema';
import { recordAudit } from './audit.service';

/**
 * Auditor-access service — the only layer that touches `auditor_access_requests`. An AUDITOR
 * names the service users they intend to audit; a MANAGER approves or rejects each request and
 * may later revoke a grant. Only APPROVED rows scope the auditor's reports (see
 * `approvedServiceUserIds` / `isAuditorApproved`, used by the report controller). Every decision
 * is also appended to the audit trail, atomically with the status change.
 */

/** A manager's (or the auditor's own) action on a request. */
export type AccessAction = 'APPROVE' | 'REJECT' | 'REVOKE' | 'WITHDRAW';

/**
 * Pure transition table: the status a request moves to under an action, or null when the action
 * is not allowed from the current status. Only a PENDING request can be approved, rejected or
 * withdrawn; only an APPROVED grant can be revoked. Withdrawn requests read as REJECTED history.
 */
export function nextStatus(
  current: AccessRequestStatus,
  action: AccessAction,
): AccessRequestStatus | null {
  if (current === 'PENDING') {
    if (action === 'APPROVE') return 'APPROVED';
    if (action === 'REJECT' || action === 'WITHDRAW') return 'REJECTED';
  }
  if (current === 'APPROVED' && action === 'REVOKE') return 'REVOKED';
  return null;
}

const decidedBy = alias(users, 'decided_by');

type JoinedRow = {
  request: typeof auditorAccessRequests.$inferSelect;
  auditorName: string;
  serviceUserName: string;
  decidedByName: string | null;
};

/** Map a joined row to the public shared shape (ISO dates). */
export function toPublicAccessRequest(row: JoinedRow): AccessRequest {
  const r = row.request;
  return accessRequestSchema.parse({
    id: r.id,
    auditorId: r.auditorId,
    auditorName: row.auditorName,
    serviceUserId: r.serviceUserId,
    serviceUserName: row.serviceUserName,
    status: r.status,
    reason: r.reason,
    requestedAt: r.requestedAt.toISOString(),
    decidedById: r.decidedById,
    decidedByName: row.decidedByName,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  });
}

function selectJoined() {
  return db
    .select({
      request: auditorAccessRequests,
      auditorName: users.name,
      serviceUserName: serviceUsers.name,
      decidedByName: decidedBy.name,
    })
    .from(auditorAccessRequests)
    .innerJoin(users, eq(users.id, auditorAccessRequests.auditorId))
    .innerJoin(serviceUsers, eq(serviceUsers.id, auditorAccessRequests.serviceUserId))
    .leftJoin(decidedBy, eq(decidedBy.id, auditorAccessRequests.decidedById));
}

const OPEN_STATUSES: AccessRequestStatus[] = ['PENDING', 'APPROVED'];

/**
 * Active service users the auditor can pick from — identity only (name + home), plus the
 * auditor's open status for each (PENDING/APPROVED) or null when it can be requested.
 */
export async function listRequestable(auditorId: string): Promise<RequestableServiceUser[]> {
  const [rows, open] = await Promise.all([
    db
      .select({ id: serviceUsers.id, name: serviceUsers.name, homeName: homes.name })
      .from(serviceUsers)
      .leftJoin(homes, eq(homes.id, serviceUsers.homeId))
      .where(eq(serviceUsers.active, true))
      .orderBy(asc(serviceUsers.name)),
    db
      .select({
        serviceUserId: auditorAccessRequests.serviceUserId,
        status: auditorAccessRequests.status,
      })
      .from(auditorAccessRequests)
      .where(
        and(
          eq(auditorAccessRequests.auditorId, auditorId),
          inArray(auditorAccessRequests.status, OPEN_STATUSES),
        ),
      ),
  ]);
  const statusById = new Map(open.map((o) => [o.serviceUserId, o.status]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    homeName: r.homeName ?? null,
    status: statusById.get(r.id) ?? null,
  }));
}

/**
 * Open PENDING requests for each named active service user. Pairs that already have an open
 * (pending or approved) row are skipped by the partial unique index, so re-requesting is a
 * no-op. Returns how many new requests were created.
 */
export async function createRequests(
  auditorId: string,
  serviceUserIds: string[],
  reason: string | undefined,
): Promise<number> {
  const unique = [...new Set(serviceUserIds)];
  const active = await db
    .select({ id: serviceUsers.id })
    .from(serviceUsers)
    .where(and(inArray(serviceUsers.id, unique), eq(serviceUsers.active, true)));
  if (active.length === 0) return 0;
  const inserted = await db
    .insert(auditorAccessRequests)
    .values(
      active.map((su) => ({
        auditorId,
        serviceUserId: su.id,
        reason: reason && reason.length > 0 ? reason : null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: auditorAccessRequests.id });
  return inserted.length;
}

/** The auditor's own requests, newest first. */
export async function listForAuditor(auditorId: string): Promise<AccessRequest[]> {
  const rows = await selectJoined()
    .where(eq(auditorAccessRequests.auditorId, auditorId))
    .orderBy(desc(auditorAccessRequests.requestedAt));
  return rows.map(toPublicAccessRequest);
}

/** Every request (optionally one status), newest first — the manager's queue. */
export async function listForManager(status?: AccessRequestStatus): Promise<AccessRequest[]> {
  const query = selectJoined();
  const rows = await (
    status ? query.where(eq(auditorAccessRequests.status, status)) : query
  ).orderBy(desc(auditorAccessRequests.requestedAt));
  return rows.map(toPublicAccessRequest);
}

export type TransitionResult = 'ok' | 'not_found' | 'invalid';

/**
 * Apply an action to a request inside a transaction, recording the status change in the audit
 * trail. `auditorId` restricts the lookup to the auditor's own request (for WITHDRAW); managers
 * pass null. An action not allowed from the current status is `invalid` (→ 409).
 */
export async function transition(
  id: string,
  action: AccessAction,
  actorId: string,
  auditorId: string | null = null,
): Promise<TransitionResult> {
  return db.transaction(async (tx) => {
    const where =
      auditorId === null
        ? eq(auditorAccessRequests.id, id)
        : and(eq(auditorAccessRequests.id, id), eq(auditorAccessRequests.auditorId, auditorId));
    const [current] = await tx.select().from(auditorAccessRequests).where(where).limit(1);
    if (!current) return 'not_found';
    const to = nextStatus(current.status, action);
    if (to === null) return 'invalid';
    await tx
      .update(auditorAccessRequests)
      .set({ status: to, decidedById: actorId, decidedAt: new Date() })
      .where(eq(auditorAccessRequests.id, id));
    await recordAudit(tx, [
      {
        userId: actorId,
        action: action,
        entityType: 'AUDITOR_ACCESS',
        entityId: id,
        field: 'status',
        fromValue: current.status,
        toValue: to,
      },
    ]);
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
