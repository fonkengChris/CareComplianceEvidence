import { type ShiftSession, shiftSessionSchema } from '@care/shared';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { homes, shiftSessions, staffHomeAssignments, users } from '../db/schema';
import { config } from '../config';
import { type AuditWrite, recordAudit } from './audit.service';

/**
 * Shift service — the only layer that touches `shift_sessions`. Home membership only makes a
 * staff member ELIGIBLE to work at a home; starting a shift here is what opens their home-path
 * access (resolved in staff-assignment.service), and ending it — or the session reaching its
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

/** Everyone currently on shift at a home, earliest start first — the manager's view. */
export async function listActiveShiftsForHome(homeId: string): Promise<ShiftSession[]> {
  const rows = await selectShifts()
    .where(
      and(
        eq(shiftSessions.homeId, homeId),
        isNull(shiftSessions.endedAt),
        gt(shiftSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(shiftSessions.startedAt));
  return rows.map((r) => toPublicShift(r.shift, r.homeName, r.staffName));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Close every open session for a staff member inside `tx` (an expired-but-unclosed row still
 * counts as open for the one-open-session index). Audits only sessions that were still granting
 * access — closing an already-lapsed row is bookkeeping, not an access change.
 */
async function closeOpen(tx: Tx, staffId: string, actorId: string, now: Date): Promise<void> {
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
      toValue: actorId === staffId ? null : 'ended by another user',
    }));
  await recordAudit(tx, audits);
}

export type StartShiftResult =
  { ok: true; value: ShiftSession } | { ok: false; reason: 'not-member' };

/**
 * Start a shift at one of the staff member's (active) homes. Any open session is closed first,
 * so a staff member is only ever on shift at one home. The new session lapses automatically
 * after `config.shiftMaxHours`.
 */
export async function startShift(staffId: string, homeId: string): Promise<StartShiftResult> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ homeName: homes.name, staffName: users.name })
      .from(staffHomeAssignments)
      .innerJoin(homes, eq(homes.id, staffHomeAssignments.homeId))
      .innerJoin(users, eq(users.id, staffHomeAssignments.staffId))
      .where(
        and(
          eq(staffHomeAssignments.staffId, staffId),
          eq(staffHomeAssignments.homeId, homeId),
          eq(homes.active, true),
        ),
      )
      .limit(1);
    if (!member) return { ok: false, reason: 'not-member' } as const;

    const now = new Date();
    await closeOpen(tx, staffId, staffId, now);
    const [row] = await tx
      .insert(shiftSessions)
      .values({ staffId, homeId, startedAt: now, expiresAt: shiftExpiry(now) })
      .returning();
    await recordAudit(tx, [
      {
        userId: staffId,
        action: 'SHIFT_START',
        entityType: 'SHIFT_SESSION',
        entityId: row!.id,
        toValue: member.homeName,
      },
    ]);
    return { ok: true, value: toPublicShift(row!, member.homeName, member.staffName) } as const;
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

/** End any open session for a user — on logout and on deactivation. Idempotent. */
export async function endOpenShiftsForUser(userId: string, actorId: string): Promise<void> {
  await db.transaction((tx) => closeOpen(tx, userId, actorId, new Date()));
}
