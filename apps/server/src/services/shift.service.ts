import { type ShiftSession, shiftSessionSchema } from '@care/shared';
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { verifyCheckInCode } from '../auth/check-in-code';
import {
  auditLogs,
  homes,
  refreshTokens,
  shiftSessions,
  staffHomeAssignments,
  users,
} from '../db/schema';
import { config } from '../config';
import { type AuditWrite, recordAudit } from './audit.service';

/**
 * Shift service — the only layer that touches `shift_sessions`. Home membership only makes a
 * staff member ELIGIBLE to work at a home; starting a shift here — with the home's on-site
 * check-in code as proof of presence, or by a manager on their behalf — is what opens their
 * home-path access (resolved in staff-assignment.service), and ending it — or the session reaching its
 * `expiresAt` cap — closes it again. Every start/end is written to the audit trail in the same
 * transaction, so "who could see this resident, and when" is always answerable.
 */

type ShiftRow = typeof shiftSessions.$inferSelect;

/** When a shift started at `startedAt` stops granting access. */
export function shiftExpiry(startedAt: Date, maxHours: number = config.shiftMaxHours): Date {
  return new Date(startedAt.getTime() + maxHours * 60 * 60 * 1000);
}

/** Whether a session still grants access at `now`: not ended and not past its cap. */
export function isShiftActive(
  row: Pick<ShiftRow, 'endedAt' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  return row.endedAt === null && row.expiresAt.getTime() > now.getTime();
}

/** Map a DB row (plus resolved names) to the public shared shape (ISO dates). */
export function toPublicShift(row: ShiftRow, homeName: string, staffName: string): ShiftSession {
  return shiftSessionSchema.parse({
    id: row.id,
    staffId: row.staffId,
    homeId: row.homeId,
    homeName,
    staffName,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  });
}

/** Sessions joined with their home and staff names, for every read path below. */
function selectShifts() {
  return db
    .select({ shift: shiftSessions, homeName: homes.name, staffName: users.name })
    .from(shiftSessions)
    .innerJoin(homes, eq(homes.id, shiftSessions.homeId))
    .innerJoin(users, eq(users.id, shiftSessions.staffId));
}

/** The staff member's active shift, or null when they are off shift. */
export async function getActiveShift(staffId: string): Promise<ShiftSession | null> {
  const [row] = await selectShifts()
    .where(
      and(
        eq(shiftSessions.staffId, staffId),
        isNull(shiftSessions.endedAt),
        gt(shiftSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ? toPublicShift(row.shift, row.homeName, row.staffName) : null;
}

/**
 * Everyone currently on shift, optionally at one home, earliest start first — the manager's
 * shift monitor.
 */
export async function listActiveShifts({ homeId }: { homeId?: string } = {}): Promise<
  ShiftSession[]
> {
  const rows = await selectShifts()
    .where(
      and(
        homeId === undefined ? undefined : eq(shiftSessions.homeId, homeId),
        isNull(shiftSessions.endedAt),
        gt(shiftSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(shiftSessions.startedAt));
  return rows.map((r) => toPublicShift(r.shift, r.homeName, r.staffName));
}

/** Everyone currently on shift at a home — the home detail page's panel. */
export async function listActiveShiftsForHome(homeId: string): Promise<ShiftSession[]> {
  return listActiveShifts({ homeId });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Close every open session for a staff member inside `tx` (an expired-but-unclosed row still
 * counts as open for the one-open-session index). Audits only sessions that were still granting
 * access — closing an already-lapsed row is bookkeeping, not an access change.
 */
async function closeOpen(
  tx: Tx,
  staffId: string,
  actorId: string,
  now: Date,
  note?: string,
): Promise<void> {
  const closed = await tx
    .update(shiftSessions)
    .set({ endedAt: now, endedById: actorId })
    .where(and(eq(shiftSessions.staffId, staffId), isNull(shiftSessions.endedAt)))
    .returning();
  const audits: AuditWrite[] = closed
    .filter((row) => row.expiresAt.getTime() > now.getTime())
    .map((row) => ({
      userId: actorId,
      action: 'SHIFT_END',
      entityType: 'SHIFT_SESSION',
      entityId: row.id,
      toValue: note ?? (actorId === staffId ? null : 'ended by another user'),
    }));
  await recordAudit(tx, audits);
}

export type StartShiftResult =
  { ok: true; value: ShiftSession } | { ok: false; reason: 'not-member' | 'bad-code' | 'locked' };

type Membership = { homeName: string; staffName: string; checkInSecret: string };

/** The staff member's (active) membership of an (active) home, or null. */
async function findMembership(tx: Tx, staffId: string, homeId: string): Promise<Membership | null> {
  const [member] = await tx
    .select({ homeName: homes.name, staffName: users.name, checkInSecret: homes.checkInSecret })
    .from(staffHomeAssignments)
    .innerJoin(homes, eq(homes.id, staffHomeAssignments.homeId))
    .innerJoin(users, eq(users.id, staffHomeAssignments.staffId))
    .where(
      and(
        eq(staffHomeAssignments.staffId, staffId),
        eq(staffHomeAssignments.homeId, homeId),
        eq(homes.active, true),
        eq(users.active, true),
      ),
    )
    .limit(1);
  return member ?? null;
}

/** How many wrong check-in codes the staff member entered in the current failure window. */
async function recentCodeFailures(tx: Tx, staffId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - config.checkInFailureWindowMinutes * 60 * 1000);
  const [row] = await tx
    .select({ n: count() })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.userId, staffId),
        eq(auditLogs.action, 'SHIFT_CODE_FAILED'),
        gt(auditLogs.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Open a session for `staffId` at `homeId` (closing any other open one first, so a staff member is
 * only ever on shift at one home) and audit SHIFT_START by `actorId`.
 */
async function openShift(
  tx: Tx,
  staffId: string,
  homeId: string,
  actorId: string,
  member: Membership,
  note: string,
): Promise<ShiftSession> {
  const now = new Date();
  await closeOpen(tx, staffId, actorId, now);
  const [row] = await tx
    .insert(shiftSessions)
    .values({ staffId, homeId, startedAt: now, expiresAt: shiftExpiry(now) })
    .returning();
  await recordAudit(tx, [
    {
      userId: actorId,
      action: 'SHIFT_START',
      entityType: 'SHIFT_SESSION',
      entityId: row!.id,
      toValue: note,
    },
  ]);
  return toPublicShift(row!, member.homeName, member.staffName);
}

/**
 * Start a shift at one of the staff member's (active) homes. `code` must be the home's current
 * on-site check-in code (shown on its paired display), proving the staff member is physically
 * there — a login alone never opens a home's records. Wrong codes are audited
 * (SHIFT_CODE_FAILED) and, after `config.checkInMaxFailures` within the failure window, further
 * attempts are refused outright. The new session lapses after `config.shiftMaxHours`.
 */
export async function startShift(
  staffId: string,
  homeId: string,
  code: string,
): Promise<StartShiftResult> {
  return db.transaction(async (tx) => {
    const member = await findMembership(tx, staffId, homeId);
    if (!member) return { ok: false, reason: 'not-member' } as const;

    const now = new Date();
    if ((await recentCodeFailures(tx, staffId, now)) >= config.checkInMaxFailures) {
      return { ok: false, reason: 'locked' } as const;
    }
    if (!verifyCheckInCode(member.checkInSecret, code, now)) {
      await recordAudit(tx, [
        { userId: staffId, action: 'SHIFT_CODE_FAILED', entityType: 'HOME', entityId: homeId },
      ]);
      return { ok: false, reason: 'bad-code' } as const;
    }

    const value = await openShift(tx, staffId, homeId, staffId, member, member.homeName);
    return { ok: true, value } as const;
  });
}

/**
 * A manager starts a shift on a staff member's behalf — the fallback when a home has no working
 * check-in display. The staff member must still be an (active) member of the (active) home; the
 * audit row names the manager as actor, with the optional reason.
 */
export async function startShiftFor(
  managerId: string,
  staffId: string,
  homeId: string,
  reason?: string,
): Promise<StartShiftResult> {
  return db.transaction(async (tx) => {
    const member = await findMembership(tx, staffId, homeId);
    if (!member) return { ok: false, reason: 'not-member' } as const;
    const note = `${member.homeName} — started by manager${reason ? `: ${reason}` : ''}`;
    const value = await openShift(tx, staffId, homeId, managerId, member, note);
    return { ok: true, value } as const;
  });
}

/**
 * End a session. A staff member may only end their own (anyone else's reads as not-found);
 * a manager may end anyone's. Ending an already-ended session is a no-op success.
 */
export async function endShift(
  sessionId: string,
  actor: { id: string; isManager: boolean },
): Promise<'ok' | 'not-found'> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    if (!row || (!actor.isManager && row.staffId !== actor.id)) return 'not-found';
    if (row.endedAt === null) await closeOpen(tx, row.staffId, actor.id, new Date());
    return 'ok';
  });
}

export type TerminateShiftResult = 'ok' | 'not-found' | 'already-ended';

/**
 * A manager ends a shift they judge unauthorised AND signs the staff member out: the session
 * closes and every live refresh token is revoked, in one transaction with the audit row. Home
 * access stops at once (it is shift-gated); any remaining direct-assignment access lasts at most
 * until the current short-lived access token expires, as the client can no longer refresh it.
 */
export async function terminateShift(
  sessionId: string,
  managerId: string,
  reason?: string,
): Promise<TerminateShiftResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    if (!row) return 'not-found';
    const now = new Date();
    if (!isShiftActive(row, now)) return 'already-ended';

    const note = reason
      ? `ended by manager and signed out: ${reason}`
      : 'ended by manager and signed out';
    await closeOpen(tx, row.staffId, managerId, now, note);
    // Revoked here rather than via auth.service to keep it atomic with the shift end (and to
    // avoid an import cycle: auth.service already imports this module for logout).
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, row.staffId), isNull(refreshTokens.revokedAt)));
    return 'ok';
  });
}

/** End any open session for a user — on logout and on deactivation. Idempotent. */
export async function endOpenShiftsForUser(userId: string, actorId: string): Promise<void> {
  await db.transaction((tx) => closeOpen(tx, userId, actorId, new Date()));
}
